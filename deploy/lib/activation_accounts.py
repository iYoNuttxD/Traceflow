"""Only the two approved runtime accounts may be unlocked or relocked."""
import contextlib
import ipaddress
import os
import selectors
import signal
import subprocess
import time
from pathlib import Path
import re
from activation_contract import TARGET
from operational_io import tool, secure_read, digest, ENV
from release_contract import Refused, require, encoded
from runtime_grants import MODEL, plan_for, sql_frames, parse_frames, validate_audit, unique_json

ACCOUNTS = ('traceflow_api','traceflow_worker')
GUARDS = (*ACCOUNTS,'traceflow_diag','traceflow_migrator')
CA = '/etc/pki/traceflow/mysql-ca.pem'
CA_SHA = '2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295'

RUNTIME_IP = '10.20.1.184'


def runtime_session_ip(row):
    """Accept only the approved IP, using server-observed evidence, never DNS here.

    The first three fields retain the historical session representation. New
    observations append client socket IPs and relevant MySQL host-cache rows,
    collected by correlated subqueries for the same foreground thread.
    """
    if not isinstance(row,list) or len(row) not in (3,5):return None
    host=row[2]
    if not isinstance(host,str) or not host or len(host)>259:return None
    parts=host.split(':')
    if len(parts)>2 or len(parts)==2 and (not re.fullmatch(r'[0-9]{1,5}',parts[1]) or not 0<int(parts[1])<=65535):return None
    source=parts[0]
    try:literal=str(ipaddress.IPv4Address(source))
    except ipaddress.AddressValueError:literal=None
    if literal is None and re.fullmatch(r'[0-9.]+',source):return None
    if literal is None and (len(source)>253 or not re.fullmatch(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?',source)):return None
    sockets,cache=(row[3],row[4]) if len(row)==5 else (None,None)
    # A present socket observation is authoritative: no fallback from a bad,
    # ambiguous or non-TCP socket to a more convenient hostname-cache result.
    socket_verified=False
    if sockets is not None and sockets!=[]:
        if not isinstance(sockets,list) or len(sockets)!=1 or not isinstance(sockets[0],str):return None
        try:address=ipaddress.ip_address(sockets[0])
        except ValueError:return None
        # MySQL can expose an IPv4 peer through its IPv6 socket representation.
        # Only an actual IPv4-mapped address denotes that same approved IPv4.
        if isinstance(address,ipaddress.IPv6Address):address=address.ipv4_mapped
        if str(address)!=RUNTIME_IP:return None
        socket_verified=True
    if literal is not None:
        return RUNTIME_IP if literal==RUNTIME_IP else None
    if cache is not None and cache!=[]:
        if cache!=[[RUNTIME_IP,source,'YES']]:return None
        return RUNTIME_IP
    return RUNTIME_IP if socket_verified else None


def allowed_runtime_session(row):
    return isinstance(row,list) and len(row) in (3,5) and row[1] in ACCOUNTS and runtime_session_ip(row)==RUNTIME_IP


class RuntimeSessionFailure(Refused):
    """Bounded metadata from the rejected observation, never SQL or raw host text."""
    def __init__(self, rows):
        super().__init__('UNEXPECTED_RUNTIME_SESSION')
        rejected=[r for r in rows if not allowed_runtime_session(r)]
        observations=[]
        for row in rejected[:16]:
            cid,user,host=row[:3]
            source=runtime_session_ip(row) or (host.split(':')[0] if isinstance(host,str) else None)
            try:address=str(ipaddress.ip_address(source))
            except (ValueError,TypeError):address=None
            observations.append({'connectionId':cid if type(cid) is int and cid>0 else None,
                'account':user if user in GUARDS else 'UNRECOGNIZED',
                'accountAllowed':user in ACCOUNTS,'sourceMatches':source=='10.20.1.184',
                'sourceKind':'IP' if address else ('MISSING' if host is None else 'UNRECOGNIZED'),
                'sourceIp':address,'sourceSha256':digest(encoded(host))})
        self.observation={'formatVersion':1,'sessionCount':len(rows),'rejectedCount':len(rejected),
            'sessionsSha256':digest(encoded(rows)),'truncated':len(rejected)>16,'rejected':observations}


class Accounts:
    def __init__(self, credential):
        self.path=Path(credential)
        raw=secure_read(self.path,0,4096,0o600)
        require(re.fullmatch(rb'\[client\]\nuser=traceflow_admin\npassword="(?:[^"\\\r\n]|\\["\\])*"\n',raw), 'ADMIN_CREDENTIAL_FORMAT')
        require(digest(tool(['/usr/bin/openssl','x509','-in',CA,'-outform','DER'],timeout=5))==CA_SHA,'CA_CHANGED')
        addresses=tool(['/usr/bin/getent','ahosts',TARGET['host']],timeout=5,maximum=8192).decode().splitlines()
        require(addresses and {line.split()[0] for line in addresses}=={'10.20.2.25'},'ADMIN_DNS_MISMATCH')
        self.sha=digest(raw)
    def query(self,plan):
        require(digest(secure_read(self.path,0,4096,0o600))==self.sha,'ADMIN_CREDENTIAL_CHANGED')
        fd=os.open(self.path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            args=['/usr/bin/mysql','--defaults-file=/proc/self/fd/'+str(fd),'--no-login-paths','--protocol=TCP',
                  '--host='+TARGET['host'],'--port=3306','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,
                  '--tls-version=TLSv1.2,TLSv1.3','--skip-reconnect','--batch','--raw','--skip-column-names',
                  '--skip-auto-rehash','--binary-mode','--local-infile=0','--connect-timeout=5','--default-character-set=utf8mb4']
            return parse_frames(tool(args,input=sql_frames(plan).encode(),pass_fds=(fd,),timeout=30,maximum=65536).decode(),plan)
        finally:os.close(fd)
    def audit(self,locked):
        result=[]
        for user in ACCOUNTS:
            plan=plan_for(MODEL,user);rows,cid=self.query(plan)
            result.append(validate_audit(rows,cid,MODEL,user,locked))
        return result
    def state(self,locked,empty):
        plan=[{'id':'ACCOUNTS','sql':"SELECT JSON_ARRAY(User,Host,account_locked) FROM mysql.user WHERE User IN ('traceflow_api','traceflow_worker','traceflow_diag','traceflow_migrator') ORDER BY User,Host",'width':3},
              {'id':'SESSIONS','sql':"SELECT JSON_ARRAY(t.PROCESSLIST_ID,t.PROCESSLIST_USER,t.PROCESSLIST_HOST,CAST((SELECT JSON_ARRAYAGG(s.IP) FROM performance_schema.socket_instances s WHERE s.THREAD_ID=t.THREAD_ID AND s.EVENT_NAME='wait/io/socket/sql/client_connection') AS CHAR CHARACTER SET utf8mb4),CAST((SELECT JSON_ARRAYAGG(JSON_ARRAY(h.IP,h.HOST,h.HOST_VALIDATED)) FROM performance_schema.host_cache h WHERE h.HOST=SUBSTRING_INDEX(t.PROCESSLIST_HOST,':',1) OR h.IP='10.20.1.184') AS CHAR CHARACTER SET utf8mb4)) FROM performance_schema.threads t WHERE t.TYPE='FOREGROUND' AND t.PROCESSLIST_USER IN ('traceflow_api','traceflow_worker','traceflow_diag','traceflow_migrator') ORDER BY t.PROCESSLIST_ID",'width':5}]
        rows,_=self.query(plan)
        require(rows['ACCOUNTS']==sorted([[u,'10.20.1.184','Y' if locked or u not in ACCOUNTS else 'N'] for u in GUARDS]),'RUNTIME_ACCOUNT_STATE')
        require(all(isinstance(r,list) and len(r)==5 and type(r[0]) is int and r[0]>0 and
                    all(v is None or isinstance(v,str) for v in r[3:]) for r in rows['SESSIONS']),'RUNTIME_SESSION_OBSERVATION')
        # Preserve the strict flat SQL-frame contract. Decode only the two
        # explicitly JSON-encoded evidence columns, without relaxing its parser.
        try:sessions=[r[:3]+[unique_json(v) if v is not None else None for v in r[3:]] for r in rows['SESSIONS']]
        except (ValueError,TypeError,Refused):require(False,'RUNTIME_SESSION_OBSERVATION')
        require(all(all(v is None or isinstance(v,list) for v in r[3:]) for r in sessions),'RUNTIME_SESSION_OBSERVATION')
        if not all(allowed_runtime_session(r) for r in sessions):
            raise RuntimeSessionFailure(sessions)
        if empty:require(not sessions,'RUNTIME_SESSIONS_REMAIN')
        return [r[:3] for r in sessions]
    def change(self,user,locked):
        require(user in ACCOUNTS,'ACCOUNT_NOT_ALLOWED')
        require(digest(secure_read(self.path,0,4096,0o600))==self.sha,'ADMIN_CREDENTIAL_CHANGED')
        fd=os.open(self.path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            args=['/usr/bin/mysql','--defaults-file=/proc/self/fd/'+str(fd),'--no-login-paths','--protocol=TCP',
                  '--host='+TARGET['host'],'--port=3306','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,
                  '--tls-version=TLSv1.2,TLSv1.3','--skip-reconnect','--batch','--raw','--skip-column-names',
                  '--skip-auto-rehash','--binary-mode','--local-infile=0','--connect-timeout=5',
                  '--default-character-set=utf8mb4','--unbuffered']
            with TextSession(args,fd) as session:
                identity=MODEL['plan'][0]
                rows,cid=session.query([identity])
                require(rows['IDENTITY_START']==[[TARGET['serverUuid'],'26.7.0-cloud',3306,
                    'traceflow_admin@%',int(cid),'public',0,1,1,1]], 'ACCOUNT_MUTATION_IDENTITY')
                # Send mutation ONLY AFTER parsing/validating identity on this open physical
                # session. No automatic reconnect, no mysql command interpolation by caller.
                sql="ALTER USER '"+user+"'@'10.20.1.184' ACCOUNT "+('LOCK' if locked else 'UNLOCK')
                result,after=session.query([{'id':'CHANGE','sql':sql,'width':0},MODEL['plan'][-1]])
                require(after==cid and result['CHANGE']==[] and result['IDENTITY_END']==rows['IDENTITY_START'], 'ACCOUNT_MUTATION_IDENTITY')
        finally:os.close(fd)
    def unlock(self):
        self.state(True,True);self.audit(True)
        for user in ACCOUNTS:self.change(user,False)
        self.state(False,True);return self.audit(False)
    def relock(self):
        errors=[]
        # Attempt both accounts even if one operation fails. Never change diag/migrator.
        for user in ACCOUNTS:
            try:self.change(user,True)
            except Exception:errors.append(user)
        require(not errors,'ACCOUNT_RELOCK_INCOMPLETE')
        # Services and the bridge must already be closed. Unexpected live sessions remain
        # a hard failure; there is deliberately no broad KILL or unsafe connection-id race.
        self.state(True,True);return self.audit(True)

class TextSession:
    """Incremental textual client; deliberately refuses EOF, stderr, surplus and timeout."""
    def __init__(self,args,fd):
        self.p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                                env=ENV,pass_fds=(fd,),start_new_session=True)
        self.selector=selectors.DefaultSelector()
        self.selector.register(self.p.stdout,selectors.EVENT_READ,'out')
        self.selector.register(self.p.stderr,selectors.EVENT_READ,'err')
        self.closed=False
    def query(self,plan):
        end=('TF_W02_'+plan[-1]['id']+'_END\t').encode();data=bytearray()
        try:self.p.stdin.write(sql_frames(plan).encode());self.p.stdin.flush()
        except (BrokenPipeError,ConnectionResetError):require(False,'ADMIN_SESSION_FAILED')
        deadline=time.monotonic()+30
        while True:
            require(time.monotonic()<deadline,'ADMIN_SESSION_TIMEOUT')
            for key,_ in self.selector.select(min(1,max(0,deadline-time.monotonic()))):
                chunk=os.read(key.fileobj.fileno(),65536)
                require(chunk and key.data=='out','ADMIN_SESSION_FAILED')
                data+=chunk;require(len(data)<=65536,'ADMIN_OUTPUT_LIMIT')
            lines=bytes(data).splitlines(keepends=True)
            if lines and lines[-1].startswith(end) and lines[-1].endswith(b'\n'):
                return parse_frames(bytes(data).decode('utf-8','strict'),plan)
    def close(self):
        if self.closed:return
        self.p.stdin.close()
        try:
            self.p.wait(5)
            require(self.p.returncode==0 and not self.p.stdout.read(65537) and not self.p.stderr.read(65537),'ADMIN_SESSION_CLOSE')
        finally:self.terminate()
    def terminate(self):
        if self.closed:return
        # Do not signal a group after its leader has been reaped/reused.
        if self.p.poll() is None:
            try:os.killpg(self.p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            except PermissionError:
                # Darwin may return EPERM after the group has disappeared while
                # waitpid(WNOHANG) still reports no exit. Accept only a proved exit;
                # a live/unreapable process remains a hard failure.
                try:self.p.wait(5)
                except subprocess.TimeoutExpired:require(False,'ADMIN_SESSION_TERMINATION')
            self.p.wait(5)
        self.selector.close();self.p.stdout.close();self.p.stderr.close()
        if not self.p.stdin.closed:
            # Abort cleanup may flush buffered input after the child has exited.
            # This is never the normal close path and cannot turn a query into success.
            with contextlib.suppress(BrokenPipeError,ConnectionResetError):self.p.stdin.close()
        self.closed=True
    def __enter__(self):return self
    def __exit__(self,kind,*_):
        if kind is None:self.close()
        else:self.terminate()
