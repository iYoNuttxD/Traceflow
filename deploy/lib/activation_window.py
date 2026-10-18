"""Bounded first activation, called only by the official release.py CLI.

The transient unit owns the controller cgroup. ExecStopPost is a separate recovery
process; it does not need the controller to survive. No schema recovery is performed.
"""
import contextlib
import getpass
import json
import math
import os
from pathlib import Path
import re
import resource
import pwd
import signal
import sys
import time
from urllib.parse import urlsplit
from activation_contract import (authorize, pre_evidence, post_evidence, Deadline, utc,
    timestamp, NGINX, CONFIGS, POST, TARGET, ref)
from activation_accounts import Accounts
from operational_io import secure_read, private_write, tool
from release_contract import (Refused, require, private_json, atomic_json, encoded, digest,
    file_digest, trusted_path, fsync_dir, exclusive_lock, release_id)

RUN_BASE=Path('/run/traceflow-activation')

def run_directory(layout,run_id):
    require(isinstance(run_id,str) and re.fullmatch(r'[a-f0-9]{32}',run_id),'ACTIVATION_RUN_ID')
    return layout.state/'activations'/run_id

def load(layout,run_id):
    path=run_directory(layout,run_id);trusted_path(path,directory=True,uid=0)
    a=private_json(path/'authorization.json');require(a['runId']==run_id,'ACTIVATION_RUN_MISMATCH')
    return path,a

def runtime_url():
    # OCI07.6 writes KEY=<JSON string>. Do not source/eval an environment file.
    raw=secure_read('/etc/traceflow/api.env',0,65536,0o600).decode()
    lines=[l for l in raw.splitlines() if l.startswith('DATABASE_URL=')]
    require(len(lines)==1,'RUNTIME_CREDENTIAL_FORMAT')
    value=json.loads(lines[0].split('=',1)[1]);require(isinstance(value,str),'RUNTIME_CREDENTIAL_FORMAT')
    u=urlsplit(value);require(u.scheme=='mysql' and u.hostname==TARGET['host'] and u.username=='traceflow_api','RUNTIME_CREDENTIAL_TARGET')
    return value

def checked_configs(a):
    for name in CONFIGS:
        require(digest(secure_read('/etc/traceflow/'+name,0,65536,0o600))==a['configurationSha256'][name],'ENVIRONMENT_CHANGED')

def snapshot_nginx(path,a):
    dest=path/'nginx';dest.mkdir(mode=0o700)
    for i,name in enumerate(NGINX):
        expected=a['nginx']['before'][name];p=Path(name)
        if expected is None:require(not os.path.lexists(p),'NGINX_BASELINE_CHANGED')
        else:
            data=secure_read(p,0,1024*1024,0o644);require(digest(data)==expected,'NGINX_BASELINE_CHANGED')
            private_write(dest/str(i),data)
        candidate=Path(a['nginx']['candidateDirectory'])/str(i)
        require(digest(secure_read(candidate,0,1024*1024,0o600))==a['nginx']['after'][name],'NGINX_CANDIDATE_CHANGED')
    require(digest(secure_read('/var/www/traceflow/index.html',0,2*1024*1024,0o644))==a['nginx']['temporaryPageSha256'],'TEMPORARY_PAGE_CHANGED')
    fsync_dir(dest)

def test_candidate(ops,path,a):
    # The live configuration is untouched. Wildcard conf.d is accepted only for the
    # reviewed single-site inventory, then redirected to an exclusive test directory.
    require({p.name for p in Path('/etc/nginx/conf.d').iterdir()}=={'traceflow.conf'}, 'NGINX_EXTRA_SITE_REVIEW')
    temp=path/'nginx-test';temp.mkdir(mode=0o700)
    candidate=Path(a['nginx']['candidateDirectory'])
    for i,name in enumerate(NGINX):
        raw=secure_read(candidate/str(i),0,1024*1024,0o600)
        require(digest(raw)==a['nginx']['after'][name],'NGINX_CANDIDATE_CHANGED')
        value=raw.decode('utf-8')
        value=value.replace('/etc/nginx/conf.d/*.conf',str(temp/'1'))
        for j,original in enumerate(NGINX):value=value.replace(original,str(temp/str(j)))
        private_write(temp/str(i),value.encode())
    ops.command(['/usr/sbin/nginx','-t','-c',str(temp/'0')],timeout=15)


def replace_file(p,data):
    trusted_path(p.parent,directory=True,uid=0)
    tmp=p.parent/('.traceflow-'+os.urandom(12).hex())
    try:
        private_write(tmp,data);tmp.chmod(0o644);os.replace(tmp,p);fsync_dir(p.parent)
    finally:
        if tmp.exists():tmp.unlink()

def nginx_files(path,a,restore=False):
    for i,name in enumerate(NGINX):
        p=Path(name);current=digest(secure_read(p,0,1024*1024,0o644)) if os.path.lexists(p) else None
        require(current in (a['nginx']['before'][name],a['nginx']['after'][name]),'NGINX_CONCURRENT_CHANGE')
        expected=a['nginx']['before' if restore else 'after'][name]
        if expected is None:
            if p.exists():p.unlink();fsync_dir(p.parent)
        else:
            if not p.parent.exists():
                require(p.parent==Path('/etc/nginx/traceflow'),'NGINX_PARENT')
                trusted_path(p.parent.parent,directory=True,uid=0);p.parent.mkdir(mode=0o755)
            source=path/'nginx'/str(i) if restore else Path(a['nginx']['candidateDirectory'])/str(i)
            data=secure_read(source,0,1024*1024,0o600);require(digest(data)==expected,'NGINX_SNAPSHOT_INTEGRITY')
            replace_file(p,data)
    tool(['/usr/sbin/restorecon',*[n for n in NGINX if Path(n).exists()]],timeout=15)  # Missing originally absent includes handled below.

def nginx_reload(ops):
    ops.command(['/usr/sbin/nginx','-t'],timeout=10)
    ops.command(['systemctl','reload','nginx'],timeout=15)

def temporary_probe(a):
    import http.client,ssl
    conn=http.client.HTTPSConnection('traceflow.dev',443,timeout=10,context=ssl.create_default_context())
    try:
        conn.request('GET','/?recovery='+a['runId'],headers={'Cache-Control':'no-cache'})
        r=conn.getresponse();body=r.read(2*1024*1024+1)
        require(r.status==200 and digest(body)==a['nginx']['temporaryPageSha256'],'TEMPORARY_PUBLIC_PROBE')
    finally:conn.close()

def receipt(path,event,a,**fields):
    data={'formatVersion':1,'event':event,'runId':a['runId'],'releaseId':a['releaseId'],
          'descriptorSha256':a['descriptorSha256'],'authorizationSha256':file_digest(path/'authorization.json'),
          'at':timestamp(),**fields}
    # Exclusive files make replay and silent replacement fail.
    private_write(path/(event+'.json'),encoded(data));fsync_dir(path)
    return data

def systemd_command(controller,run_id,seconds):
    require(re.fullmatch(r'[a-f0-9]{32}',run_id) and 1<=seconds<=600,'UNIT_WINDOW')
    require(re.fullmatch(r'/opt/traceflow/releases/[A-Za-z0-9-]+/deploy/scripts/release.py',str(controller)), 'CONTROLLER_PATH')
    final='/usr/bin/python3 -I -B '+str(controller)+' finalize-first --run-id '+run_id
    return ['systemd-run','--quiet','--unit=traceflow-first-'+run_id,
            '--property=Type=exec','--property=User=root','--property=UMask=0077',
            '--property=RuntimeMaxSec='+str(seconds),'--property=TimeoutStartSec=15',
            '--property=TimeoutStopSec=600','--property=KillMode=control-group','--property=LimitCORE=0',
            '--property=Restart=no','--property=StandardOutput=null','--property=StandardError=null',
            '--property=ExecStopPost='+final,'/usr/bin/python3','-I','-B',str(controller),'run-first','--run-id',run_id]

def launch(ops,layout,args):
    ops.native_context(layout);resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
    rid=release_id(args.release_id);a=private_json(Path(args.authorization).absolute())
    release,admin,manifest=layout.installed(rid,args.digest)
    require(a['descriptorSha256']==args.digest and a['releaseId']==rid,'AUTHORIZATION_MISMATCH')
    expires=authorize(a,manifest);pre_evidence(a,manifest);checked_configs(a)
    require(ops.command(['getenforce']).stdout.strip()=='Enforcing','SELINUX_REQUIRED')
    for key in ('httpd_can_network_connect','httpd_can_network_relay'):
        require(ops.command(['getsebool',key]).stdout.strip()==key+' --> off','SELINUX_BROAD_BOOLEAN')
    ports=ops.command(['semanage','port','-l'],timeout=20).stdout.splitlines()
    require([row.split() for row in ports if row.startswith('traceflow_api_port_t')]==[['traceflow_api_port_t','tcp','3001']], 'SELINUX_RESTRICTED_PORT')
    storage=Path('/var/lib/traceflow/test-evidence');trusted_path(storage,directory=True,uid=pwd.getpwnam('traceflow').pw_uid)
    require(storage.stat().st_mode&0o777==0o700,'STORAGE_MODE')
    for service in ops.SERVICES:
        require(ops.command(['systemctl','show',service,'-p','LimitCORE','--value']).stdout.strip()=='0','CORE_LIMIT_REQUIRED')
    with exclusive_lock(layout.state/'operation.lock'):
        state=layout.load();reconciliation_closed(layout,state);layout.current_matches(state);ops.assert_stopped()
        require(state['status']=='idle' and state['current'] is None and state.get('previous') is None and
                not state['history'] and state.get('phase') in ('migration-complete','migration-recovered','first-activation-recovered'), 'FIRST_ACTIVATION_ONLY')
        parent=layout.state/'activations';parent.mkdir(mode=0o700,exist_ok=True);trusted_path(parent,directory=True,uid=0)
        path=run_directory(layout,a['runId']);path.mkdir(mode=0o700)  # Refuse reuse, even after failure.
        private_write(path/'authorization.json',encoded(a));private_write(path/'prior-state.json',encoded(state))
        snapshot_nginx(path,a);test_candidate(ops,path,a)
        ops.command(['/usr/sbin/nginx','-t'],timeout=10)
        unit='traceflow-first-'+a['runId']+'.service'
        require(ops.command(['systemctl','show',unit,'-p','LoadState','--value']).stdout.strip()=='not-found','ACTIVATION_UNIT_EXISTS')
        RUN_BASE.mkdir(mode=0o700,exist_ok=True);trusted_path(RUN_BASE,directory=True,uid=0)
        volatile=RUN_BASE/a['runId'];volatile.mkdir(mode=0o700)
        try:
            require(sys.stdin.isatty() and sys.stderr.isatty(),'PROTECTED_TERMINAL_REQUIRED')
            password=getpass.getpass('Senha EXISTENTE de traceflow_admin (entrada oculta): ')
            require(0<len(password.encode())<=1024 and not any(ord(c)<32 or ord(c)==127 for c in password),'PASSWORD_FORMAT')
            options='[client]\nuser=traceflow_admin\npassword="'+password.replace('\\','\\\\').replace('"','\\"')+'"\n'
            private_write(volatile/'admin.cnf',options.encode());del password,options
            receipt(path,'prepared',a,expiresAt=a['expiresAt'])
        except BaseException:
            cleanup_credential(a)  # No unit submitted; safe exclusive ownership.
            raise
        # Unit is started only after the lock is released; no DB mutation occurs in launcher.
    try:
        seconds=math.floor(expires-time.time());require(seconds>0,'ACTIVATION_WINDOW_EXPIRED')
        ops.command(systemd_command(release/'deploy/scripts/release.py',a['runId'],seconds),timeout=15)
    except BaseException:
        # If systemd accepted the job but the caller lost its reply, keep its recovery
        # credential. finalize-first is the sole cleanup owner after a submitted job.
        props=ops.command(['systemctl','show',unit,'-p','LoadState','--value'],check=False)
        if props.stdout.strip()=='not-found':cleanup_credential(a)
        raise
    ops.emit('ACTIVATION_PENDING_VALIDATION',runId=a['runId'],unit=unit,expiresAt=a['expiresAt'])

def cleanup_credential(a):
    p=RUN_BASE/a['runId']
    if not os.path.lexists(p):return
    trusted_path(p,directory=True,uid=0)
    require(set(x.name for x in p.iterdir())<= {'admin.cnf'},'CREDENTIAL_DIRECTORY_CONTENT')
    c=p/'admin.cnf'
    if c.exists():secure_read(c,0,4096,0o600);c.unlink();fsync_dir(p)
    p.rmdir();fsync_dir(RUN_BASE)

def recover(ops,layout,path,a,accounts):
    """Attempt all independent safety actions; never hide an incomplete recovery."""
    state=layout.load();state.update(status='intervention-required',phase='recovering',target=a['releaseId'],runId=a['runId'])
    layout.save(state);errors=[]
    def attempt(name,fn):
        try:fn()
        except BaseException:errors.append(name)
    attempt('services',ops.stop_services)
    attempt('nginx-files',lambda:nginx_files(path,a,True))
    attempt('nginx-reload',lambda:nginx_reload(ops))
    attempt('public-page',lambda:temporary_probe(a))
    attempt('accounts',accounts.relock)
    for link in (layout.app/'current',layout.web/'current'):
        def unlink_owned(link=link):
            if not os.path.lexists(link):return
            require(link.is_symlink(),'RECOVERY_LINK_TYPE')
            target=os.readlink(link)
            allowed=(str(layout.releases/a['releaseId']) if link==layout.app/'current' else
                     str(layout.generations/state.get('web','')/'dist'))
            require(target==allowed,'RECOVERY_LINK_CHANGED');link.unlink();fsync_dir(link.parent)
        attempt('links',unlink_owned)
    attempt('credentials',lambda:cleanup_credential(a))
    if not errors:
        prior=private_json(path/'prior-state.json')
        prior.update(status='idle',phase='first-activation-recovered',runId=a['runId'],target=a['releaseId'])
        layout.save(prior)
    else:
        state.update(status='intervention-required',phase='recovery-incomplete');layout.save(state)
    result={'status':'TEMPORARY_PAGE_RESTORED' if not errors else 'INTERVENTION_REQUIRED','failedControls':errors,
            'schemaRestored':False,'dataPreserved':True}
    receipt(path,'recovery',a,**result)
    return result

def run(ops,layout,run_id):
    ops.native_context(layout);path,a=load(layout,run_id)
    unit='traceflow-first-'+run_id+'.service'
    properties=ops.command(['systemctl','show',unit,'-p','MainPID','-p','Type','-p','KillMode','-p','RuntimeMaxUSec','-p','ExecStopPost']).stdout
    values=dict(line.split('=',1) for line in properties.splitlines() if '=' in line)
    require(values.get('MainPID')==str(os.getpid()) and values.get('Type')=='exec' and values.get('KillMode')=='control-group' and
            values.get('RuntimeMaxUSec') not in (None,'infinity','0') and 'finalize-first --run-id '+run_id in values.get('ExecStopPost',''), 'RECOVERY_UNIT_REQUIRED')
    with exclusive_lock(layout.state/'operation.lock'):
        release,admin,manifest=layout.installed(a['releaseId'],a['descriptorSha256'])
        deadline=Deadline(authorize(a,manifest));pre_evidence(a,manifest);checked_configs(a)
        state=layout.load();require(state==private_json(path/'prior-state.json'),'ACTIVATION_STATE_CHANGED')
        layout.current_matches(state);ops.assert_stopped()
        accounts=Accounts(RUN_BASE/run_id/'admin.cnf');db=None
        try:
            state.update(status='in-progress',target=a['releaseId'],operation='activate-first',runId=run_id,
                         expiresAt=a['expiresAt'],bootId=ops.boot_id(),pid=os.getpid(),processStart=ops.proc_start(os.getpid()))
            ops.phase(layout,state,'recovery-armed');receipt(path,'armed',a)
            deadline.check();accounts.unlock();ops.phase(layout,state,'accounts-enabled')
            checked_configs(a)
            # Only the runtime account reaches Prisma; the administrative credential stays
            # in the textual client/finalizer and never reaches Node or EnvironmentFile.
            db=ops.Database(release,admin,path/'authorization.json','read',runtime_value=runtime_url())
            before=db.ask('compatible');deadline.check()
            new_web=ops.generation(layout,a['releaseId'],state);state['web']=new_web
            ops.phase(layout,state,'switching')
            ops.switch_link(layout.app/'current',release)
            ops.switch_link(layout.web/'current',layout.generations/new_web/'dist')
            ops.phase(layout,state,'switched');deadline.check()
            started=ops.start_services(layout,state,a['releaseId'],a,db,public=False)
            deadline.check();checked_configs(a)
            ops.phase(layout,state,'public-cutover');nginx_files(path,a);nginx_reload(ops)
            cutover=time.time();receipt(path,'cutover',a)
            ops.smoke(layout,a['releaseId'],state,a,db,started)
            ops.phase(layout,state,'postchecks-pending')
            receipt(path,'pending',a,status='ACTIVATION_PENDING_VALIDATION')
            while not all((path/(k+'.json')).exists() for k in POST):
                deadline.check();db.ask('check');time.sleep(min(1,deadline.check()))
            proofs={k:post_evidence(private_json(path/(k+'.json')),a,k,cutover) for k in sorted(POST)}
            deadline.check();checked_configs(a);pre_evidence(a,manifest)
            layout.installed(a['releaseId'],a['descriptorSha256'])
            accounts.state(False,False);accounts.audit(False)
            ops.smoke(layout,a['releaseId'],state,a,db,started)
            db.close();db=None;deadline.check();ops.phase(layout,state,'database-disconnected')
            # Final success is durable only after every real postcheck and DB disconnect.
            receipt(path,'verified',a,status='ACTIVATION_VERIFIED',postEvidence=proofs,disconnected=True,
                    schemaFingerprint=before['fingerprint'])
            deadline.check()
            state['history'].setdefault(a['releaseId'],{})['lastActivated']=ops.now()
            state.update(status='idle',phase='complete',current=a['releaseId'],previous=None)
            layout.save(state)
        except BaseException as failure:
            # Preserve a bounded primary code before cleanup can itself fail. Never
            # serialize SQL, URLs, credentials, exception messages or tracebacks.
            code=str(failure) if isinstance(failure,Refused) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',str(failure)) else 'ACTIVATION_FAILED'
            with contextlib.suppress(BaseException):
                receipt(path,'failure',a,status='FAIL',code=code,phase=state.get('phase'),secretsPrinted=False)
            if db is not None:
                with contextlib.suppress(BaseException):db.close()
            recover(ops,layout,path,a,accounts)
            raise

def finalize(ops,layout,run_id):
    """ExecStopPost: no expiry gate on safety recovery; no reliance on live controller."""
    ops.native_context(layout);path,a=load(layout,run_id)
    with exclusive_lock(layout.state/'operation.lock'):
        if (path/'recovery.json').exists():
            r=private_json(path/'recovery.json')
            require(r.get('status')=='TEMPORARY_PAGE_RESTORED','RECOVERY_INCOMPLETE');return
        state=layout.load();verified=False
        try:
            if (path/'verified.json').exists():
                proof=private_json(path/'verified.json')
                verified=(proof.get('status')=='ACTIVATION_VERIFIED' and proof.get('runId')==run_id and
                          proof.get('releaseId')==a['releaseId'] and proof.get('authorizationSha256')==file_digest(path/'authorization.json') and
                          proof.get('disconnected') is True and utc(proof['at'])<utc(a['expiresAt']) and
                          state.get('runId')==run_id and state.get('status')=='idle' and state.get('phase')=='complete' and state.get('current')==a['releaseId'])
                if verified:
                    cutover=utc(private_json(path/'cutover.json')['at'])
                    for k in POST:
                        d=private_json(path/(k+'.json'))
                        require(post_evidence(d,a,k,cutover,utc(proof['at']))==proof['postEvidence'][k],'FINAL_PROOF_CHANGED')
                    layout.current_matches(state);layout.installed(a['releaseId'],a['descriptorSha256'])
        except BaseException:
            verified=False
        if verified:
            if (path/'closed.json').exists():
                closed=private_json(path/'closed.json')
                require(closed.get('runId')==run_id and closed.get('credentialsRemoved') is True and not (RUN_BASE/run_id).exists(),'CLOSURE_INTEGRITY')
                return
            try:
                cleanup_credential(a);receipt(path,'closed',a,status='ACTIVATION_VERIFIED',credentialsRemoved=True)
                return
            except BaseException:
                verified=False
        if not verified:
            # A missing/invalid credential must not prevent service and ingress recovery.
            class LazyAccounts:
                def relock(self):return Accounts(RUN_BASE/run_id/'admin.cnf').relock()
            accounts=LazyAccounts()
            result=recover(ops,layout,path,a,accounts)
            require(result['status']=='TEMPORARY_PAGE_RESTORED','RECOVERY_INCOMPLETE')

def record(layout,run_id,kind,source):
    require(os.geteuid()==0,'ROOT_OPERATOR_REQUIRED');path,a=load(layout,run_id)
    with exclusive_lock(path/'evidence.lock'):
        state=layout.load();require(state.get('runId')==run_id and state.get('phase')=='postchecks-pending' and state['status']=='in-progress','POSTCHECK_WINDOW_REQUIRED')
        cutover=utc(private_json(path/'cutover.json')['at'])
        d=private_json(Path(source).absolute());post_evidence(d,a,kind,cutover)
        private_write(path/(kind+'.json'),encoded(d));fsync_dir(path)


# Explicit reconciliation of the observed first-publication/public-page failure.
# These files are siblings of activations/, never replacements of historical receipts.
RECONCILIATION_CHECKS={'servicesStopped':True,'accountsLocked':True,'runtimeSessions':0,
    'migrationCount':68,'nginxRestored':True,'publicHtmlExact':True,'linksAbsent':True,'credentialRemoved':True}
def reconciliation_json(path):
    from operational_io import unique
    return unique(secure_read(Path(path),os.geteuid(),2*1024*1024,0o600))


def recovery_history(path):
    """Hash the whole protected historical tree, including events and Nginx snapshots."""
    result={};total=0
    for p in sorted(path.rglob('*')):
        require(not p.is_symlink(),'RECONCILE_HISTORY_SYMLINK')
        if p.is_dir():
            trusted_path(p,directory=True,uid=os.geteuid());continue
        raw=secure_read(p,os.geteuid(),2*1024*1024,0o600)
        total+=len(raw);require(total<=16*1024*1024,'RECONCILE_HISTORY_LIMIT')
        result[p.relative_to(path).as_posix()]=digest(raw)
    require(result,'RECONCILE_HISTORY_EMPTY')
    return digest(encoded(result))


def reconciliation_authorize(q,run_id,wall=None):
    from activation_contract import exact,sha
    exact(q,{'formatVersion','operation','authorizationId','reconciliationId','operatorId',
             'runId','releaseId','descriptorSha256','issuedAt','expiresAt','historySha256',
             'stateSha256','externalWritersExcluded'},'RECONCILE_AUTH_FIELDS')
    require(type(q['formatVersion']) is int and q['formatVersion']==1 and q['operation']=='reconcile-first' and
            q['runId']==run_id and q['externalWritersExcluded'] is True,'RECONCILE_AUTH_KIND')
    for k in ('authorizationId','reconciliationId','runId'):
        require(isinstance(q[k],str) and re.fullmatch(r'[a-f0-9]{32}',q[k]),'RECONCILE_AUTH_ID')
    require(isinstance(q['operatorId'],str) and re.fullmatch(r'[A-Za-z0-9._@-]{3,80}',q['operatorId']),'OPERATOR_ID')
    release_id(q['releaseId'])
    for k in ('descriptorSha256','historySha256','stateSha256'):sha(q[k])
    issued,expires=utc(q['issuedAt']),utc(q['expiresAt'])
    require(0<expires-issued<=600,'RECONCILE_WINDOW')
    if wall is not None:require(issued<=wall<expires,'RECONCILE_AUTH_EXPIRED')
    return expires


def reconciliation_folder(layout,q):
    return layout.state/'reconciliations'/q['runId']/q['reconciliationId']


def reconciliation_closed(layout,state):
    """A crash between state/guard writes and completion must not open activation."""
    if 'reconciliationId' not in state:return
    require(re.fullmatch(r'[a-f0-9]{32}',state.get('runId','')) and
            re.fullmatch(r'[a-f0-9]{32}',state['reconciliationId']),'RECONCILE_STATE_ID')
    folder=layout.state/'reconciliations'/state['runId']/state['reconciliationId']
    intent=reconciliation_json(folder/'intent.json');done=reconciliation_json(folder/'complete.json')
    from activation_contract import exact
    q=reconciliation_json(folder/'authorization.json');reconciliation_authorize(q,state['runId'])
    require(q['reconciliationId']==state['reconciliationId'] and q['releaseId']==state.get('target') and
            state.get('status')=='idle' and state.get('phase')=='first-activation-recovered' and
            state.get('current') is None and state.get('previous') is None and not state.get('history'),
            'RECONCILE_COMPLETION_BINDING')
    exact(done,{'formatVersion','status','intentSha256','stateSha256','auditFile','auditSha256'},'RECONCILE_COMPLETION_FIELDS')
    require(isinstance(done['auditFile'],str) and re.fullmatch(r'audit-[a-f0-9]{32}\.json',done['auditFile']),'RECONCILE_AUDIT_PATH')
    audit=reconciliation_json(folder/done['auditFile'])
    exact(audit,{'formatVersion','observedAt','authorizationSha256','historySha256','checks'},'RECONCILE_AUDIT_FIELDS')
    require(done['formatVersion']==1 and done['status']=='RECOVERY_RECONCILED' and
            done['intentSha256']==digest(encoded(intent)) and done['stateSha256']==digest(encoded(state)) and
            intent=={'formatVersion':1,'authorizationSha256':digest(encoded(q)),'historySha256':q['historySha256'],
                     'beforeStateSha256':q['stateSha256'],'afterState':state} and
            done['auditSha256']==digest(encoded(audit)) and audit['formatVersion']==1 and
            audit['authorizationSha256']==digest(encoded(q)) and audit['historySha256']==q['historySha256'] and
            encoded(audit['checks'])==encoded(RECONCILIATION_CHECKS) and utc(q['issuedAt'])<=utc(audit['observedAt'])<utc(q['expiresAt']),
            'RECONCILE_INCOMPLETE')
    require(recovery_history(run_directory(layout,state['runId']))==q['historySha256'],'RECONCILE_HISTORY_CHANGED')
    from operational_io import unique
    guard={k:state.get(k) for k in ('status','phase','current','target','bootId','pid','processStart','expiresAt','runId','operation')}
    require(unique(secure_read(layout.guard,os.geteuid(),65536,0o644))==guard,'RECONCILE_GUARD_DIVERGED')


def reconciliation_baseline(layout,q):
    path=run_directory(layout,q['runId'])
    require(recovery_history(path)==q['historySha256'],'RECONCILE_HISTORY_CHANGED')
    a=reconciliation_json(path/'authorization.json');prior=reconciliation_json(path/'prior-state.json')
    failure=reconciliation_json(path/'failure.json');recovery=reconciliation_json(path/'recovery.json')
    require(a['runId']==q['runId'] and a['releaseId']==q['releaseId'] and
            a['descriptorSha256']==q['descriptorSha256'],'RECONCILE_RELEASE_BINDING')
    for d,event in ((failure,'failure'),(recovery,'recovery')):
        require(d.get('event')==event and all(d.get(k)==a[k] for k in ('runId','releaseId','descriptorSha256')) and
                d.get('authorizationSha256')==file_digest(path/'authorization.json'),'RECONCILE_RECEIPT_BINDING')
    require(failure.get('status')=='FAIL' and failure.get('code')=='FRONTEND_SMOKE' and
            failure.get('phase')=='public-cutover','RECONCILE_FAILURE_SCOPE')
    require(recovery.get('status')=='INTERVENTION_REQUIRED' and recovery.get('failedControls')==['public-page'] and
            recovery.get('dataPreserved') is True and recovery.get('schemaRestored') is False,'RECONCILE_RECOVERY_SCOPE')
    require(not any(os.path.lexists(path/n) for n in ('verified.json','closed.json','pending.json')),'RECONCILE_CONTRADICTORY_HISTORY')
    require(prior.get('status')=='idle' and prior.get('current') is None and prior.get('previous') is None and
            not prior.get('history') and prior.get('phase') in ('migration-complete','migration-recovered','first-activation-recovered'),
            'RECONCILE_PRIOR_STATE')
    after=dict(prior,status='idle',phase='first-activation-recovered',runId=q['runId'],
               target=q['releaseId'],reconciliationId=q['reconciliationId'])
    return path,a,after


def reconciliation_environment(ops,layout,a):
    ops.assert_stopped()
    require(not any(os.path.lexists(p) for p in (layout.app/'current',layout.web/'current',
            layout.app/'previous',layout.web/'previous',RUN_BASE/a['runId'])),'RECONCILE_RESIDUAL_RESOURCE')
    for unit in ('traceflow-first-'+a['runId']+'.service','traceflow-recovery-backup.service',
                 'traceflow-recovery-reconcile.service','traceflow-recovery-backup.timer'):
        props=ops.service_state(unit)
        require(props.get('ActiveState') in ('inactive','failed') and props.get('MainPID','0')=='0','RECONCILE_UNIT_RUNNING')
    checked_configs(a)
    require(ops.command(['getenforce']).stdout.strip()=='Enforcing','SELINUX_REQUIRED')
    for name,expected in a['nginx']['before'].items():
        actual=digest(secure_read(name,0,1024*1024,0o644)) if os.path.lexists(name) else None
        require(actual==expected,'RECONCILE_NGINX_DIVERGED')
    require(digest(secure_read('/var/www/traceflow/index.html',0,2*1024*1024,0o644))==a['nginx']['temporaryPageSha256'],
            'TEMPORARY_PAGE_CHANGED')
    ops.command(['/usr/sbin/nginx','-t'],timeout=10)
    temporary_probe(a)  # Exact HTTPS bytes. No stripping, UA fallback or relaxed hash.


def reconciliation_database(ops,release,manifest,accounts):
    """All SQL is read-only; never calls unlock, relock, change or a migration."""
    from backup_runtime import load_module
    backup=load_module('reconcile_backup_reader',Path(ops.__file__).with_name('recovery-backup.py'))
    source=backup.Source(accounts,manifest,release)
    source.identity();source.quiescent();accounts.audit(True)
    rows=source.rows("SELECT JSON_OBJECT('name',migration_name,'sha256',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY CAST(migration_name AS BINARY)")
    require([{'name':r['name'],'sha256':r['sha256']} for r in rows]==manifest['schema']['migrations'] and
            len(rows)==68 and all(type(r['finished']) in (bool,int) and r['finished']==1 for r in rows) and
            all(type(r['rolledBack']) in (bool,int) and r['rolledBack']==0 for r in rows),'MIGRATION_CHAIN_MISMATCH')
    source.quiescent();accounts.state(True,True)


@contextlib.contextmanager
def reconciliation_accounts(q):
    """Manual TTY, bounded tmpfs custody, no Vault change or permanent credential."""
    require(sys.stdin.isatty() and sys.stderr.isatty(),'PROTECTED_TERMINAL_REQUIRED')
    cg=Path('/proc/self/cgroup').read_text().strip()
    require(cg.startswith('0::/') and (Path('/sys/fs/cgroup')/cg[3:].lstrip('/')/'memory.swap.max').read_text().strip()=='0',
            'SECRET_SWAP_NOT_DISABLED')
    parent=Path('/run/traceflow-reconciliation');parent.mkdir(mode=0o700,exist_ok=True)
    trusted_path(parent,directory=True,uid=0);require(parent.stat().st_mode&0o777==0o700,'CREDENTIAL_DIRECTORY_MODE')
    # A residual from SIGKILL is refused, never silently deleted or reused.
    folder=parent/q['reconciliationId'];folder.mkdir(mode=0o700)
    credential=folder/'admin.cnf';created=False;expected=None
    try:
        password=getpass.getpass('Senha EXISTENTE de traceflow_admin (entrada oculta): ')
        require(0<len(password.encode())<=1024 and not any(ord(c)<32 or ord(c)==127 for c in password),'PASSWORD_FORMAT')
        options='[client]\nuser=traceflow_admin\npassword="'+password.replace('\\','\\\\').replace('"','\\"')+'"\n'
        expected=digest(options.encode());private_write(credential,options.encode());created=True;del password,options
        yield Accounts(credential)
    finally:
        if created:
            require(digest(secure_read(credential,0,4096,0o600))==expected,'RECONCILE_CREDENTIAL_CHANGED')
            credential.unlink();fsync_dir(folder)
        require(not list(folder.iterdir()),'RECONCILE_CREDENTIAL_RESIDUAL');folder.rmdir();fsync_dir(parent)


def reconcile(ops,layout,args):
    """Manual, read-only audit followed by one local journal transition. No activation."""
    ops.native_context(layout);resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    q=reconciliation_json(Path(args.authorization).absolute());reconciliation_authorize(q,args.run_id)
    auth_sha=digest(encoded(q));folder=reconciliation_folder(layout,q)
    with exclusive_lock(layout.state/'operation.lock'):
        path,a,after=reconciliation_baseline(layout,q);state=layout.load()
        if (folder/'complete.json').exists():
            intent=reconciliation_json(folder/'intent.json')
            require(intent['authorizationSha256']==auth_sha and intent['afterState']==after and state==after,'RECONCILE_REPLAY_DIVERGED')
            reconciliation_closed(layout,state)
            ops.emit('recovery_already_reconciled',runId=q['runId'],reconciliationId=q['reconciliationId'],freshAudit=False)
            return
        expires=reconciliation_authorize(q,args.run_id,time.time());deadline=Deadline(expires)
        release,_,manifest=layout.installed(q['releaseId'],q['descriptorSha256'])
        authorize(a,manifest,utc(a['issuedAt']))  # Validate historical contract, not revive its window.
        require(utc(a['issuedAt'])<=time.time(),'RECONCILE_HISTORY_FUTURE')
        intent=None
        if (folder/'intent.json').exists():
            intent=reconciliation_json(folder/'intent.json')
            require(intent.get('authorizationSha256')==auth_sha and intent.get('historySha256')==q['historySha256'] and
                    intent.get('beforeStateSha256')==q['stateSha256'] and intent.get('afterState')==after,'RECONCILE_INTENT_CHANGED')
        original=digest(encoded(state))==q['stateSha256'] and state.get('status')=='intervention-required' and state.get('phase')=='recovery-incomplete'
        require((original or intent is not None and state==after) and state.get('runId')==q['runId'] and
                state.get('target')==q['releaseId'] and state.get('current') is None and state.get('previous') is None and
                not state.get('history'),'RECONCILE_STATE_DIVERGED')
        # Every retry before completion re-audits live conditions, including after a partial save.
        old_alarm=signal.getsignal(signal.SIGALRM)
        def expired(*_):raise Refused('RECONCILE_TIMEOUT')
        signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL,deadline.check())
        try:
            reconciliation_environment(ops,layout,a);deadline.check()
            with reconciliation_accounts(q) as accounts:
                reconciliation_database(ops,release,manifest,accounts);deadline.check()
                reconciliation_environment(ops,layout,a);accounts.state(True,True);deadline.check()
            # Credential cleanup and query subprocess closure are prerequisites of commit.
            deadline.check();require(layout.load()==state,'RECONCILE_STATE_RACE')
            require(recovery_history(path)==q['historySha256'],'RECONCILE_HISTORY_CHANGED')
            layout.installed(q['releaseId'],q['descriptorSha256']);deadline.check()
            for parent in (layout.state/'reconciliations',folder.parent,folder):
                parent.mkdir(mode=0o700,exist_ok=True);trusted_path(parent,directory=True,uid=os.geteuid())
                require(parent.stat().st_mode&0o777==0o700,'RECONCILE_DIRECTORY_MODE')
            audit={'formatVersion':1,'authorizationSha256':auth_sha,'historySha256':q['historySha256'],
                   'beforeStateSha256':q['stateSha256'],'afterState':after}
            auth_copy=folder/'authorization.json'
            if auth_copy.exists():require(reconciliation_json(auth_copy)==q,'RECONCILE_AUTH_CHANGED')
            else:private_write(auth_copy,encoded(q));fsync_dir(folder)
            if intent is None:private_write(folder/'intent.json',encoded(audit));fsync_dir(folder)
            else:require(intent==audit,'RECONCILE_INTENT_CHANGED')
            # Evidence of each successful live audit is append-only; no previous receipt is edited.
            audit_name='audit-'+os.urandom(16).hex()+'.json'
            checked={'formatVersion':1,'observedAt':timestamp(),'authorizationSha256':auth_sha,
                     'historySha256':q['historySha256'],'checks':RECONCILIATION_CHECKS}
            private_write(folder/audit_name,encoded(checked));fsync_dir(folder);deadline.check()
            layout.save(after)
            # If save/guard/fsync/complete is interrupted, activation refuses the missing completion.
            private_write(folder/'complete.json',encoded({'formatVersion':1,'status':'RECOVERY_RECONCILED',
                'intentSha256':digest(encoded(audit)),'stateSha256':digest(encoded(after)),
                'auditFile':audit_name,'auditSha256':digest(encoded(checked))}));fsync_dir(folder)
            reconciliation_closed(layout,after)
            ops.emit('recovery_reconciled',runId=q['runId'],reconciliationId=q['reconciliationId'],
                     servicesStarted=False,accountsChanged=False,historicalReceiptsPreserved=True)
        finally:
            signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,old_alarm)
