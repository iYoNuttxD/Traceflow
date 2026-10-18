"""Only the two approved runtime accounts may be unlocked or relocked."""
import contextlib
import os
import selectors
import signal
import subprocess
import time
from pathlib import Path
import re
from activation_contract import TARGET
from operational_io import tool, secure_read, digest, ENV
from release_contract import require
from runtime_grants import MODEL, plan_for, sql_frames, parse_frames, validate_audit

ACCOUNTS = ('traceflow_api','traceflow_worker')
GUARDS = (*ACCOUNTS,'traceflow_diag','traceflow_migrator')
CA = '/etc/pki/traceflow/mysql-ca.pem'
CA_SHA = '2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295'

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
              {'id':'SESSIONS','sql':"SELECT JSON_ARRAY(PROCESSLIST_ID,PROCESSLIST_USER,PROCESSLIST_HOST) FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_USER IN ('traceflow_api','traceflow_worker','traceflow_diag','traceflow_migrator') ORDER BY PROCESSLIST_ID",'width':3}]
        rows,_=self.query(plan)
        require(rows['ACCOUNTS']==sorted([[u,'10.20.1.184','Y' if locked or u not in ACCOUNTS else 'N'] for u in GUARDS]),'RUNTIME_ACCOUNT_STATE')
        require(all(r[1] in ACCOUNTS and isinstance(r[2],str) and r[2].split(':')[0]=='10.20.1.184' for r in rows['SESSIONS']), 'UNEXPECTED_RUNTIME_SESSION')
        if empty:require(not rows['SESSIONS'],'RUNTIME_SESSIONS_REMAIN')
        return rows['SESSIONS']
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
