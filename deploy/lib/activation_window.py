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
    observed={name:digest(secure_read('/etc/traceflow/'+name,0,65536,0o600)) for name in CONFIGS}
    require(observed==a['configurationSha256'],'ENVIRONMENT_CHANGED')
    return observed

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
        return {'status':r.status,'sha256':digest(body),'bytes':len(body)}
    finally:conn.close()

def receipt(path,event,a,**fields):
    data={'formatVersion':1,'event':event,'runId':a['runId'],'releaseId':a['releaseId'],
          'descriptorSha256':a['descriptorSha256'],'authorizationSha256':file_digest(path/'authorization.json'),
          'at':timestamp(),**fields}
    # Exclusive files make replay and silent replacement fail.
    publish_reconciliation(path/(event+'.json'),data)
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

def persistence_residues(layout):
    """Names only; never interpret, follow or remove interrupted state writes."""
    result={}
    for scope,parent in (('state',layout.state),('guard',layout.guard.parent)):
        trusted_path(parent,directory=True,uid=os.geteuid())
        names=sorted(p.name for p in parent.iterdir() if p.name.startswith('.write-'))
        if names:result[scope]={'count':len(names),'namesSha256':digest(encoded(names))}
    return result


def persistence_clean(layout,code='ACTIVATION_PERSISTENCE_RESIDUE'):
    require(not persistence_residues(layout),code)


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
        persistence_clean(layout)
        state=layout.load();proof=reconciliation_closed(layout,state)
        controller=reconciliation_controller(ops,layout,proof,manifest) if proof else release/'deploy/scripts/release.py'
        layout.current_matches(state);ops.assert_stopped()
        require(first_activation_eligible(state), 'FIRST_ACTIVATION_ONLY')
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
            # Intent is durable before handing the job to systemd; not proof of ownership.
            receipt(path,'submission',a,status='SUBMISSION_REQUESTED')
        except BaseException:
            cleanup_credential(a)  # No unit submitted; safe exclusive ownership.
            raise
        # Unit is started only after the lock is released; no DB mutation occurs in launcher.
    try:
        seconds=math.floor(expires-time.time());require(seconds>0,'ACTIVATION_WINDOW_EXPIRED')
        ops.command(systemd_command(controller,a['runId'],seconds),timeout=15)
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

def attempt_lock(layout,run_id):
    run_directory(layout,run_id)  # Validate ID before using it as a lock name.
    parent=layout.state/'activation-locks';parent.mkdir(mode=0o700,exist_ok=True)
    trusted_path(parent,directory=True,uid=os.geteuid())
    require(parent.stat().st_mode&0o777==0o700,'ACTIVATION_LOCK_DIRECTORY')
    return exclusive_lock(parent/(run_id+'.lock'))


def bound_receipt(path,a,event):
    d=reconciliation_json(path/(event+'.json'))
    require(d.get('formatVersion')==1 and d.get('event')==event and
            all(d.get(k)==a[k] for k in ('runId','releaseId','descriptorSha256')) and
            d.get('authorizationSha256')==file_digest(path/'authorization.json'),'ACTIVATION_RECEIPT_BINDING')
    utc(d['at'])
    return d


def validate_claim(path,a):
    claim=bound_receipt(path,a,'claim')
    require(set(claim)=={'formatVersion','event','runId','releaseId','descriptorSha256',
            'authorizationSha256','at','priorStateSha256','claimedState','submissionSha256'} and
            claim['priorStateSha256']==file_digest(path/'prior-state.json') and
            claim['submissionSha256']==file_digest(path/'submission.json'),'ACTIVATION_CLAIM_BINDING')
    require(bound_receipt(path,a,'submission').get('status')=='SUBMISSION_REQUESTED','ACTIVATION_SUBMISSION_REQUIRED')
    claimed=claim['claimedState']
    require(isinstance(claimed,dict) and claimed.get('runId')==a['runId'] and
            claimed.get('target')==a['releaseId'] and claimed.get('operation')=='activate-first' and
            claimed.get('status')=='in-progress' and claimed.get('phase')=='recovery-armed', 'ACTIVATION_CLAIM_STATE')
    return claim


def owns_activation(layout,path,a,state=None):
    # A receipt alone is never ownership. The authoritative state must name this
    # exact claim. Called under attempt.lock; mutations also hold operation.lock.
    state=layout.load() if state is None else state
    if state.get('runId')!=a['runId']:return False
    require(state.get('operation')=='activate-first' and state.get('target')==a['releaseId'], 'ACTIVATION_OWNER_MISMATCH')
    claim=validate_claim(path,a)
    require(all(state.get(k)==claim['claimedState'].get(k) for k in ('bootId','pid','processStart','expiresAt')),'ACTIVATION_OWNER_IDENTITY')
    require(state.get('activationClaimSha256')==file_digest(path/'claim.json'),'ACTIVATION_OWNER_UNPROVEN')
    require((state.get('status') in ('in-progress','intervention-required')) or
            (state.get('status')=='idle' and state.get('phase')=='complete' and state.get('current')==a['releaseId']),
            'ACTIVATION_OWNER_STATE')
    return True


def claim_activation(ops,layout,path,a,state):
    persistence_clean(layout)
    require(not any(os.path.lexists(path/n) for n in ('claim.json','unowned.json','closed.json','recovery.json','failure.json')),
            'ACTIVATION_ATTEMPT_CONSUMED')
    require(bound_receipt(path,a,'prepared').get('expiresAt')==a['expiresAt'],'ACTIVATION_PREPARATION_REQUIRED')
    require(bound_receipt(path,a,'submission').get('status')=='SUBMISSION_REQUESTED','ACTIVATION_SUBMISSION_REQUIRED')
    state.update(status='in-progress',phase='recovery-armed',target=a['releaseId'],operation='activate-first',runId=a['runId'],
                 expiresAt=a['expiresAt'],bootId=ops.boot_id(),pid=os.getpid(),processStart=ops.proc_start(os.getpid()))
    state.pop('activationClaimSha256',None)
    receipt(path,'claim',a,priorStateSha256=file_digest(path/'prior-state.json'),claimedState=dict(state),
            submissionSha256=file_digest(path/'submission.json'))
    state['activationClaimSha256']=file_digest(path/'claim.json')
    # This save is the ownership boundary, including a crash before armed.json.
    ops.phase(layout,state,'recovery-armed')
    receipt(path,'armed',a,claimSha256=state['activationClaimSha256'])


def failure_evidence(path,a,state):
    if not os.path.lexists(path/'failure.json'):
        # SIGKILL/timeout may leave no Python exception. Record only what is known.
        receipt(path,'failure',a,status='FAIL',code='ACTIVATION_INTERRUPTED',phase=state.get('phase'),secretsPrinted=False)
    failure=bound_receipt(path,a,'failure')
    require(failure.get('status')=='FAIL' and isinstance(failure.get('code'),str) and
            re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',failure['code']) and failure.get('secretsPrinted') is False,
            'ACTIVATION_FAILURE_EVIDENCE')
    return file_digest(path/'failure.json')


def validate_recovery_receipts(path,a):
    r=bound_receipt(path,a,'recovery');validate_claim(path,a)
    failure=bound_receipt(path,a,'failure')
    require(r.get('claimSha256')==file_digest(path/'claim.json') and
            r.get('failureSha256')==file_digest(path/'failure.json') and
            failure.get('status')=='FAIL' and failure.get('secretsPrinted') is False, 'RECONCILE_FAILURE_PROVENANCE')
    return r


def finalize_unowned(path,a,state):
    # attempt.lock prevents a delayed run-first from claiming while its own secret
    # is removed. The immutable marker rejects that delayed start after lock release.
    # Terminal histories may be covered by an older reconciliation inventory.
    # Never append to them merely because another attempt now owns the state.
    if any(os.path.lexists(path/n) for n in ('closed.json','recovery.json')):
        cleanup_credential(a);return
    if not os.path.lexists(path/'unowned.json'):
        receipt(path,'unowned',a,status='NO_GLOBAL_RECOVERY',observedStateSha256=digest(encoded(state)))
    require(bound_receipt(path,a,'unowned').get('status')=='NO_GLOBAL_RECOVERY','ACTIVATION_UNOWNED_RECEIPT')
    cleanup_credential(a)


def recover(ops,layout,path,a,accounts,observed_persistence=None):
    """Attempt all independent safety actions; never hide an incomplete recovery."""
    require(owns_activation(layout,path,a),'ACTIVATION_NOT_OWNER')
    state=layout.load();failed_state=dict(state);state.update(status='intervention-required',phase='recovering',target=a['releaseId'],runId=a['runId'])
    errors=[]
    def attempt(name,fn):
        try:fn()
        except BaseException:errors.append(name)
    # Containment does not depend on publication of another state. Keep an
    # ambiguous state/guard untouched and preserve the original temporary files.
    def observed_residues():
        try:return persistence_residues(layout)
        except BaseException:
            if 'state-persistence' not in errors:errors.append('state-persistence')
            return {'unverified':True}
    # An earlier observation in this finalizer cannot disappear from the audit
    # merely because a later scan succeeds or an external writer removes a file.
    residues=observed_persistence or observed_residues()
    if residues:
        if 'state-persistence' not in errors:errors.append('state-persistence')
    else:attempt('state-persistence',lambda:layout.save(state))
    evidence={}
    attempt('failure-evidence',lambda:evidence.update(failureSha256=failure_evidence(path,a,failed_state)))
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
    final_residues=observed_residues()
    if final_residues and 'state-persistence' not in errors:errors.append('state-persistence')
    prior=private_json(path/'prior-state.json')
    result={'status':'TEMPORARY_PAGE_RESTORED' if not errors else 'INTERVENTION_REQUIRED','failedControls':errors,
            'schemaRestored':False,'dataPreserved':True,'claimSha256':file_digest(path/'claim.json'),**evidence}
    if 'state-persistence' in errors:
        # Append only: a prior recovery receipt is never overwritten on retry.
        event='containment-'+os.urandom(16).hex() if os.path.lexists(path/'recovery.json') else 'recovery'
        receipt(path,event,a,**result,persistence={'initial':residues,'final':final_residues,
                'observedStateSha256':digest(encoded(layout.load()))},formalRecovery=False)
        return result
    if not errors and 'recoveryProof' in prior:
        # Preserve the origin in the immutable prior-state, never rebind its runId.
        reconciliation_closed(layout,prior,check_guard=False)
        after=recovered_state(prior,a)
        result.update(priorStateSha256=digest(encoded(prior)),recoveredStateSha256=digest(encoded(after)))
        data={'formatVersion':1,'event':'recovery','runId':a['runId'],'releaseId':a['releaseId'],
              'descriptorSha256':a['descriptorSha256'],'authorizationSha256':file_digest(path/'authorization.json'),
              'at':timestamp(),**result}
        publish_reconciliation(path/'recovery.json',data)
        persistence_clean(layout)
        layout.save(after)  # Old controllers reject this status, even after completion.
    else:
        if not errors:
            after=dict(prior,status='idle',phase='first-activation-recovered',runId=a['runId'],target=a['releaseId'])
        else:after=dict(state,status='intervention-required',phase='recovery-incomplete')
        receipt(path,'recovery',a,**result)
        persistence_clean(layout)
        layout.save(after)
    persistence_clean(layout)
    return result

def run(ops,layout,run_id):
    ops.native_context(layout);path,a=load(layout,run_id)
    unit='traceflow-first-'+run_id+'.service'
    properties=ops.command(['systemctl','show',unit,'-p','MainPID','-p','Type','-p','KillMode','-p','RuntimeMaxUSec','-p','ExecStopPost']).stdout
    values=dict(line.split('=',1) for line in properties.splitlines() if '=' in line)
    require(values.get('MainPID')==str(os.getpid()) and values.get('Type')=='exec' and values.get('KillMode')=='control-group' and
            values.get('RuntimeMaxUSec') not in (None,'infinity','0') and 'finalize-first --run-id '+run_id in values.get('ExecStopPost',''), 'RECOVERY_UNIT_REQUIRED')
    with attempt_lock(layout,run_id), exclusive_lock(layout.state/'operation.lock'):
        persistence_clean(layout)
        require(not os.path.lexists(path/'unowned.json'),'ACTIVATION_ATTEMPT_CONSUMED')
        release,admin,manifest=layout.installed(a['releaseId'],a['descriptorSha256'])
        deadline=Deadline(authorize(a,manifest));pre_evidence(a,manifest);checked_configs(a)
        state=layout.load();require(state==private_json(path/'prior-state.json'),'ACTIVATION_STATE_CHANGED')
        proof=reconciliation_closed(layout,state)
        if proof:
            controller=reconciliation_controller(ops,layout,proof,manifest)
            require(str(controller)+' finalize-first --run-id '+run_id in values.get('ExecStopPost',''),'RECONCILE_FINALIZER_CONTROLLER')
        require(read_guard(layout)==guard_projection(state),'ACTIVATION_GUARD_DIVERGED')
        layout.current_matches(state);ops.assert_stopped()
        accounts=Accounts(RUN_BASE/run_id/'admin.cnf');db=None
        try:
            claim_activation(ops,layout,path,a,state)
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
            persistence_clean(layout)
            receipt(path,'verified',a,status='ACTIVATION_VERIFIED',postEvidence=proofs,disconnected=True,
                    schemaFingerprint=before['fingerprint'])
            deadline.check()
            state['history'].setdefault(a['releaseId'],{})['lastActivated']=ops.now()
            state.update(status='idle',phase='complete',current=a['releaseId'],previous=None)
            persistence_clean(layout)
            layout.save(state)
            persistence_clean(layout)
        except BaseException as failure:
            # Preserve a bounded primary code before cleanup can itself fail. Never
            # serialize SQL, URLs, credentials, exception messages or tracebacks.
            code=str(failure) if isinstance(failure,Refused) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',str(failure)) else 'ACTIVATION_FAILED'
            with contextlib.suppress(BaseException):
                receipt(path,'failure',a,status='FAIL',code=code,phase=state.get('phase'),secretsPrinted=False)
            if db is not None:
                with contextlib.suppress(BaseException):db.close()
            # A pre-claim failure cannot recover another attempt. ExecStopPost
            # will perform only isolated credential cleanup for the rejected run.
            if owns_activation(layout,path,a):recover(ops,layout,path,a,accounts)
            raise

def finalize(ops,layout,run_id):
    """ExecStopPost: no expiry gate on safety recovery; no reliance on live controller."""
    ops.native_context(layout);path,a=load(layout,run_id)
    with attempt_lock(layout,run_id):
        state=layout.load()
        # No global lock is needed to discard ONLY this attempt's credential.
        # This works even while another run holds operation.lock throughout startup.
        if state.get('runId')!=run_id:
            finalize_unowned(path,a,state);return
        _finalize_owned(ops,layout,path,a,run_id)

def _finalize_owned(ops,layout,path,a,run_id):
    # Instantiation of Accounts remains lazy, so unreadable credentials cannot
    # prevent independent service/ingress containment for a proven owner.
    class LazyAccounts:
        def relock(self):return Accounts(RUN_BASE/run_id/'admin.cnf').relock()
    with exclusive_lock(layout.state/'operation.lock'):
        try:observed=persistence_residues(layout)
        except (OSError,Refused):observed={'unverified':True}
        if observed:
            if layout.load().get('activationClaimSha256'):
                recover(ops,layout,path,a,LazyAccounts(),observed_persistence=observed)
            raise Refused('ACTIVATION_PERSISTENCE_RESIDUE')
        if (path/'recovery.json').exists():
            r=validate_recovery_receipts(path,a)
            require(r.get('status')=='TEMPORARY_PAGE_RESTORED','RECOVERY_INCOMPLETE')
            state=layout.load();prior=private_json(path/'prior-state.json')
            expected=recovered_state(prior,a) if 'recoveryProof' in prior else dict(
                prior,status='idle',phase='first-activation-recovered',runId=a['runId'],target=a['releaseId'])
            require(state==expected and read_guard(layout)==guard_projection(state),'RECOVERY_STATE_INCOMPLETE')
            if 'recoveredStateSha256' in r:
                require(digest(encoded(state))==r['recoveredStateSha256'],'RECOVERY_STATE_INCOMPLETE')
                proof=reconciliation_closed(layout,state)
                _,_,manifest=layout.installed(a['releaseId'],a['descriptorSha256'])
                reconciliation_controller(ops,layout,proof,manifest)
            persistence_clean(layout)
            return
        require(owns_activation(layout,path,a),'ACTIVATION_NOT_OWNER')
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
                persistence_clean(layout)
                cleanup_credential(a);receipt(path,'closed',a,status='ACTIVATION_VERIFIED',credentialsRemoved=True)
                return
            except BaseException:
                verified=False
        if not verified:
            # A missing/invalid credential must not prevent service and ingress recovery.
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
RECONCILED_STATUS='reconciled-v2'
RECONCILED_PHASE='first-recovery-reconciled-v2'
GUARD_FIELDS=('status','phase','current','target','bootId','pid','processStart','expiresAt','runId','operation')
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
             'stateSha256','externalWritersExcluded','controllerReleaseId','controllerDescriptorSha256'},'RECONCILE_AUTH_FIELDS')
    require(type(q['formatVersion']) is int and q['formatVersion']==2 and q['operation']=='reconcile-first' and
            q['runId']==run_id and q['externalWritersExcluded'] is True,'RECONCILE_AUTH_KIND')
    for k in ('authorizationId','reconciliationId','runId'):
        require(isinstance(q[k],str) and re.fullmatch(r'[a-f0-9]{32}',q[k]),'RECONCILE_AUTH_ID')
    require(isinstance(q['operatorId'],str) and re.fullmatch(r'[A-Za-z0-9._@-]{3,80}',q['operatorId']),'OPERATOR_ID')
    release_id(q['releaseId']);release_id(q['controllerReleaseId'])
    for k in ('descriptorSha256','historySha256','stateSha256','controllerDescriptorSha256'):sha(q[k])
    issued,expires=utc(q['issuedAt']),utc(q['expiresAt'])
    require(0<expires-issued<=600,'RECONCILE_WINDOW')
    if wall is not None:require(issued<=wall<expires,'RECONCILE_AUTH_EXPIRED')
    return expires


def reconciliation_folder(layout,q):
    return layout.state/'reconciliations'/q['runId']/q['reconciliationId']


def first_activation_eligible(state):
    phase_ok=(state.get('status')=='idle' and state.get('phase') in
              ('migration-complete','migration-recovered','first-activation-recovered')) or (
              state.get('status')==RECONCILED_STATUS and state.get('phase')==RECONCILED_PHASE and 'recoveryProof' in state)
    return phase_ok and state.get('current') is None and state.get('previous') is None and not state.get('history')


def guard_projection(state):return {k:state.get(k) for k in GUARD_FIELDS}


def read_guard(layout):
    from operational_io import unique
    return unique(secure_read(layout.guard,os.geteuid(),65536,0o644))


def publish_reconciliation(path,value):
    """Publish complete JSON exclusively; leave every interrupted temporary for review.

    link() is the portable same-filesystem NOREPLACE publication primitive. A crash
    before unlink leaves two links and is refused by secure_read; never overwritten.
    """
    path=Path(path);trusted_path(path.parent,directory=True,uid=os.geteuid())
    require(not any(path.parent.glob('.pending-*')),'RECONCILE_PUBLICATION_RESIDUE')
    raw=encoded(value);temp=path.parent/('.pending-'+path.name+'-'+os.urandom(16).hex())
    private_write(temp,raw)  # O_EXCL, 0600, complete write, fsync(file)
    require(secure_read(temp,os.geteuid(),2*1024*1024,0o600)==raw,'RECONCILE_PUBLICATION_CHANGED')
    fsync_dir(path.parent)
    os.link(temp,path,follow_symlinks=False)  # Fails if destination exists; no replacement.
    temp.unlink();fsync_dir(path.parent)


def reconciliation_inventory(folder):
    if not folder.exists():return
    trusted_path(folder,directory=True,uid=os.geteuid())
    require(not any(folder.glob('.pending-*')),'RECONCILE_PUBLICATION_RESIDUE')
    for p in folder.iterdir():
        require(p.name in ('authorization.json','intent.json','complete.json','applied.json') or
                re.fullmatch(r'(audit|guard-repair)-[a-f0-9]{32}\.json',p.name),'RECONCILE_UNEXPECTED_FILE')
        reconciliation_json(p)  # Reject partial, malformed, duplicate or substituted files.
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
    fsync_dir(folder)  # Re-establish durability after an interrupted final directory fsync.


def reconciliation_documents(folder):
    return digest(encoded({p.name:digest(secure_read(p,os.geteuid(),2*1024*1024,0o600))
        for p in sorted(folder.iterdir()) if p.name!='applied.json'}))


def recovered_state(prior,a):
    result=dict(prior,status=RECONCILED_STATUS,phase=RECONCILED_PHASE,runId=a['runId'],target=a['releaseId'])
    result['recoveryProof']={'kind':'activation-recovery','runId':a['runId']}
    return result


def reconciliation_controller(ops,layout,q,manifest):
    require(isinstance(q,dict),'RECONCILE_CONTROLLER_REQUIRED')
    controller,_,cm=layout.installed(q['controllerReleaseId'],q['controllerDescriptorSha256'])
    entry=controller/'deploy/scripts/release.py'
    require(cm['sourceState']=='committed' and cm['schema']==manifest['schema'],'RECONCILE_CONTROLLER_SCHEMA')
    require(Path(ops.__file__).absolute()==entry and Path(__file__).absolute()==controller/'deploy/lib/activation_window.py',
            'RECONCILE_CONTROLLER_SELECTION')
    return entry


def reconciliation_closed(layout,state,check_guard=True,_seen=()):
    """Follow immutable origin proofs instead of combining IDs from different runs."""
    if check_guard:persistence_clean(layout)
    require('reconciliationId' not in state,'RECONCILE_LEGACY_STATE_REVIEW')
    if 'recoveryProof' not in state:
        require(state.get('status')!=RECONCILED_STATUS,'RECONCILE_PROOF_REQUIRED');return None
    from activation_contract import exact
    proof=state['recoveryProof'];require(isinstance(proof,dict),'RECONCILE_PROOF_FIELDS')
    rid=proof.get('runId');require(isinstance(rid,str) and re.fullmatch(r'[a-f0-9]{32}',rid),'RECONCILE_STATE_ID')
    require(rid not in _seen and len(_seen)<64,'RECONCILE_PROVENANCE_CYCLE')
    require(state.get('status')==RECONCILED_STATUS and state.get('phase')==RECONCILED_PHASE and
            state.get('current') is None and state.get('previous') is None and not state.get('history'),'RECONCILE_COMPLETION_BINDING')
    if proof.get('kind')=='activation-recovery':
        exact(proof,{'kind','runId'},'RECONCILE_PROOF_FIELDS')
        path=run_directory(layout,rid);a=reconciliation_json(path/'authorization.json')
        prior=reconciliation_json(path/'prior-state.json');r=reconciliation_json(path/'recovery.json')
        require(a['runId']==rid and state==recovered_state(prior,a) and r.get('event')=='recovery' and
                r.get('status')=='TEMPORARY_PAGE_RESTORED' and r.get('failedControls')==[] and
                r.get('schemaRestored') is False and r.get('dataPreserved') is True and
                all(r.get(k)==a[k] for k in ('runId','releaseId','descriptorSha256')) and
                r.get('authorizationSha256')==file_digest(path/'authorization.json') and
                r.get('priorStateSha256')==digest(encoded(prior)) and
                r.get('recoveredStateSha256')==digest(encoded(state)),'RECONCILE_RECOVERY_PROVENANCE')
        validate_recovery_receipts(path,a)
        q=reconciliation_closed(layout,prior,False,(*_seen,rid))
        require(q is not None,'RECONCILE_ORIGIN_REQUIRED')
    else:
        exact(proof,{'kind','runId','reconciliationId'},'RECONCILE_PROOF_FIELDS')
        require(proof['kind']=='reconciliation' and isinstance(proof['reconciliationId'],str) and
                re.fullmatch(r'[a-f0-9]{32}',proof['reconciliationId']),'RECONCILE_STATE_ID')
        folder=reconciliation_folder(layout,proof);reconciliation_inventory(folder)
        q=reconciliation_json(folder/'authorization.json');reconciliation_authorize(q,rid)
        require(q['reconciliationId']==proof['reconciliationId'],'RECONCILE_COMPLETION_BINDING')
        intent,done=completion_evidence(layout,folder,q)
        applied=reconciliation_json(folder/'applied.json')
        exact(applied,{'formatVersion','completeSha256','auditFile','auditSha256','stateSha256','guardSha256','documentsSha256'},'RECONCILE_APPLIED_FIELDS')
        validate_audit_file(folder,applied,q,intent)
        require(intent['afterState']==state and applied['formatVersion']==2 and
                applied['completeSha256']==digest(encoded(done)) and applied['stateSha256']==digest(encoded(state)) and
                applied['guardSha256']==digest(encoded(guard_projection(state))) and
                applied['documentsSha256']==reconciliation_documents(folder),'RECONCILE_INCOMPLETE')
    if check_guard:require(read_guard(layout)==guard_projection(state),'RECONCILE_GUARD_DIVERGED')
    return q


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
    require('reconciliationId' not in prior and 'recoveryProof' not in prior,'RECONCILE_PRIOR_PROOF_REVIEW')
    after=dict(prior,status=RECONCILED_STATUS,phase=RECONCILED_PHASE,runId=q['runId'],
               target=q['releaseId'],recoveryProof={'kind':'reconciliation','runId':q['runId'],'reconciliationId':q['reconciliationId']})
    return path,a,after


def reconciliation_environment(ops,layout,a):
    ops.assert_stopped()
    services={name:ops.service_state(name) for name in ops.SERVICES}
    units={name:ops.service_state(name) for name in (
        'traceflow-first-'+a['runId']+'.service','traceflow-recovery-backup.service',
        'traceflow-recovery-reconcile.service','traceflow-recovery-backup.timer')}
    def normalized(values):
        result={}
        for name,props in values.items():
            require(props.get('ActiveState') in ('inactive','failed') and props.get('MainPID')=='0','RECONCILE_UNIT_RUNNING')
            result[name]={'state':props['ActiveState'],'pid':props['MainPID']}
        return result
    services=normalized(services);units=normalized(units)
    absent=not any(os.path.lexists(p) for p in (layout.app/'current',layout.web/'current',
        layout.app/'previous',layout.web/'previous',RUN_BASE/a['runId']))
    require(absent,'RECONCILE_RESIDUAL_RESOURCE')
    configs=checked_configs(a);selinux=ops.command(['getenforce']).stdout.strip()
    require(selinux=='Enforcing','SELINUX_REQUIRED')
    nginx={name:digest(secure_read(name,0,1024*1024,0o644)) if os.path.lexists(name) else None for name in a['nginx']['before']}
    require(nginx==a['nginx']['before'],'RECONCILE_NGINX_DIVERGED')
    local=digest(secure_read('/var/www/traceflow/index.html',0,2*1024*1024,0o644))
    require(local==a['nginx']['temporaryPageSha256'],'TEMPORARY_PAGE_CHANGED')
    syntax=ops.command(['/usr/sbin/nginx','-t'],timeout=10).returncode
    require(type(syntax) is int and syntax==0,'RECONCILE_NGINX_SYNTAX')
    public=temporary_probe(a)
    return {'services':services,'units':units,'configurationSha256':configs,'nginxSha256':nginx,
            'localPageSha256':local,'public':public,'selinux':selinux,'linksAbsent':absent,'nginxTestExitCode':syntax}


def reconciliation_database(ops,release,manifest,accounts):
    """Only fixed read-only SQL. Persist bounded validated metadata, not SQL or secrets."""
    from backup_runtime import load_module
    backup=load_module('reconcile_backup_reader',Path(ops.__file__).with_name('recovery-backup.py'))
    source=backup.Source(accounts,manifest,release)
    source.identity();source.quiescent();audits=accounts.audit(True)
    identity=source.rows("SELECT JSON_ARRAY(@@server_uuid,VERSION(),@@port,DATABASE(),CURRENT_USER(),CAST(CURRENT_ROLE() AS CHAR),TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()))")
    require(identity==[[TARGET['serverUuid'],'26.7.0-cloud',3306,'traceflow','traceflow_admin@%','`administrator`@`%`',0]],'BACKUP_SERVER_IDENTITY')
    rows=source.rows("SELECT JSON_OBJECT('name',migration_name,'sha256',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY CAST(migration_name AS BINARY)")
    chain=[{'name':r['name'],'sha256':r['sha256']} for r in rows]
    require(chain==manifest['schema']['migrations'] and len(rows)==68 and
            all(type(r['finished']) in (bool,int) and r['finished']==1 for r in rows) and
            all(type(r['rolledBack']) in (bool,int) and r['rolledBack']==0 for r in rows),'MIGRATION_CHAIN_MISMATCH')
    source.quiescent();sessions=accounts.state(True,True)
    return {'serverIdentity':identity[0],'runtimeAudits':audits,'migrations':{'count':len(rows),'chainSha256':digest(encoded(chain))},'remainingSessions':sessions}


OBSERVATION_ORDER=('ENVIRONMENT_INITIAL','DATABASE','ENVIRONMENT_FINAL','ACCOUNTS_FINAL','CREDENTIAL_CLOSED','INTEGRITY_FINAL')
def validate_observations(observations,q,a,intent):
    from activation_contract import exact,sha
    require(isinstance(observations,list) and len(observations)==len(OBSERVATION_ORDER),'RECONCILE_OBSERVATIONS_MISSING')
    last=utc(q['issuedAt'])
    for name,item in zip(OBSERVATION_ORDER,observations):
        exact(item,{'kind','startedAt','finishedAt','result'},'RECONCILE_OBSERVATION_FIELDS')
        start,end=utc(item['startedAt']),utc(item['finishedAt'])
        require(item['kind']==name and last<=start<=end<utc(q['expiresAt']),'RECONCILE_OBSERVATION_ORDER');last=end
        r=item['result']
        if name.startswith('ENVIRONMENT_'):
            exact(r,{'services','units','configurationSha256','nginxSha256','localPageSha256','public','selinux','linksAbsent','nginxTestExitCode'},'RECONCILE_ENV_OBSERVATION')
            require(r['configurationSha256']==a['configurationSha256'] and r['nginxSha256']==a['nginx']['before'] and
                    r['localPageSha256']==a['nginx']['temporaryPageSha256'] and r['selinux']=='Enforcing' and r['linksAbsent'] is True and
                    type(r['nginxTestExitCode']) is int and r['nginxTestExitCode']==0,'RECONCILE_ENV_OBSERVATION')
            for field,names in (('services',('traceflow-api.service','traceflow-github-worker.service')),('units',(
                    'traceflow-first-'+q['runId']+'.service','traceflow-recovery-backup.service','traceflow-recovery-reconcile.service','traceflow-recovery-backup.timer'))):
                exact(r[field],names,'RECONCILE_UNIT_OBSERVATION')
                for value in r[field].values():
                    exact(value,{'state','pid'},'RECONCILE_UNIT_OBSERVATION')
                    require(value['state'] in ('inactive','failed') and value['pid']=='0','RECONCILE_UNIT_OBSERVATION')
            exact(r['public'],{'status','sha256','bytes'},'RECONCILE_PUBLIC_OBSERVATION')
            require(type(r['public']['status']) is int and r['public']['status']==200 and r['public']['sha256']==r['localPageSha256'] and
                    type(r['public']['bytes']) is int and 0<r['public']['bytes']<=2*1024*1024,'RECONCILE_PUBLIC_OBSERVATION')
        elif name=='DATABASE':
            exact(r,{'serverIdentity','runtimeAudits','migrations','remainingSessions'},'RECONCILE_DB_OBSERVATION')
            require(r['serverIdentity']==[TARGET['serverUuid'],'26.7.0-cloud',3306,'traceflow','traceflow_admin@%','`administrator`@`%`',0] and r['remainingSessions']==[],'RECONCILE_DB_OBSERVATION')
            exact(r['migrations'],{'count','chainSha256'},'RECONCILE_MIGRATION_OBSERVATION')
            require(type(r['migrations']['count']) is int and r['migrations']['count']==68 and r['migrations']['chainSha256']==intent['migrationChainSha256'],'RECONCILE_MIGRATION_OBSERVATION')
            require(isinstance(r['runtimeAudits'],list) and len(r['runtimeAudits'])==2,'RECONCILE_GRANTS_OBSERVATION')
            for user,d in zip(('traceflow_api','traceflow_worker'),r['runtimeAudits']):
                exact(d,{'account','tls','privileges','roleState','accountLocked','sourceCount','warnings','stateSha256'},'RECONCILE_GRANTS_OBSERVATION')
                require(d['account']==user+'@10.20.1.184' and d['tls'] in ('TLSv1.2','TLSv1.3') and d['privileges']=='USAGE_GLOBAL_AND_SCHEMA_CRUD_ONLY' and
                        d['roleState']=='ABSENT' and d['accountLocked'] is True and type(d['sourceCount']) is int and d['sourceCount']==15 and
                        type(d['warnings']) is int and d['warnings']==0,'RECONCILE_GRANTS_OBSERVATION');sha(d['stateSha256'])
        elif name=='ACCOUNTS_FINAL':require(r=={'remainingSessions':[]},'RECONCILE_SESSION_OBSERVATION')
        elif name=='CREDENTIAL_CLOSED':require(r=={'credentialRemoved':True},'RECONCILE_CREDENTIAL_OBSERVATION')
        else:
            exact(r,{'stateSha256','guardSha256','historySha256','manifestSha256'},'RECONCILE_INTEGRITY_OBSERVATION')
            require(r['stateSha256'] in (q['stateSha256'],digest(encoded(intent['afterState']))) and
                    r['guardSha256'] in (digest(encoded(intent['beforeGuard'])),digest(encoded(guard_projection(intent['afterState'])))) and
                    r['historySha256']==q['historySha256'] and r['manifestSha256']==intent['manifestSha256'],'RECONCILE_INTEGRITY_OBSERVATION')


def validate_audit_file(folder,reference,q,intent):
    from activation_contract import exact
    require(isinstance(reference['auditFile'],str) and re.fullmatch(r'audit-[a-f0-9]{32}\.json',reference['auditFile']),'RECONCILE_AUDIT_PATH')
    audit=reconciliation_json(folder/reference['auditFile'])
    exact(audit,{'formatVersion','authorizationSha256','intentSha256','observations'},'RECONCILE_AUDIT_FIELDS')
    require(type(audit['formatVersion']) is int and audit['formatVersion']==2 and audit['authorizationSha256']==digest(encoded(q)) and
            audit['intentSha256']==digest(encoded(intent)) and reference['auditSha256']==digest(encoded(audit)),'RECONCILE_AUDIT_CHANGED')
    a=reconciliation_json(folder.parents[2]/'activations'/q['runId']/'authorization.json')
    validate_observations(audit['observations'],q,a,intent)
    return audit


def completion_evidence(layout,folder,q):
    from activation_contract import exact
    intent=reconciliation_json(folder/'intent.json');done=reconciliation_json(folder/'complete.json')
    exact(intent,{'formatVersion','authorizationSha256','historySha256','beforeState','beforeGuard','afterState','manifestSha256','migrationChainSha256'},'RECONCILE_INTENT_FIELDS')
    _,_,after=reconciliation_baseline(layout,q)
    require(intent['formatVersion']==2 and intent['authorizationSha256']==digest(encoded(q)) and intent['historySha256']==q['historySha256'] and
            digest(encoded(intent['beforeState']))==q['stateSha256'] and intent['beforeGuard']==guard_projection(intent['beforeState']) and intent['afterState']==after,'RECONCILE_INTENT_CHANGED')
    exact(done,{'formatVersion','status','intentSha256','stateSha256','auditFile','auditSha256'},'RECONCILE_COMPLETION_FIELDS')
    require(done['formatVersion']==2 and done['status']=='AUDIT_COMPLETE_STATE_PENDING' and done['intentSha256']==digest(encoded(intent)) and
            done['stateSha256']==digest(encoded(after)),'RECONCILE_INCOMPLETE')
    validate_audit_file(folder,done,q,intent)
    return intent,done


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
    """Audit -> immutable completion -> incompatible recovered state -> applied proof."""
    ops.native_context(layout);resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    q=reconciliation_json(Path(args.authorization).absolute());reconciliation_authorize(q,args.run_id)
    auth_sha=digest(encoded(q));folder=reconciliation_folder(layout,q)
    with exclusive_lock(layout.state/'operation.lock'):
        path,a,after=reconciliation_baseline(layout,q);state=layout.load();guard=read_guard(layout)
        persistence_clean(layout,'RECONCILE_STATE_RESIDUE')
        reconciliation_inventory(folder)
        if (folder/'authorization.json').exists():require(reconciliation_json(folder/'authorization.json')==q,'RECONCILE_DOCUMENT_CHANGED')
        if (folder/'applied.json').exists():
            require(state==after,'RECONCILE_REPLAY_DIVERGED')
            proof=reconciliation_closed(layout,state)
            require(proof==q,'RECONCILE_REPLAY_DIVERGED')
            _,_,manifest=layout.installed(q['releaseId'],q['descriptorSha256'])
            reconciliation_controller(ops,layout,q,manifest)
            ops.emit('recovery_already_reconciled',runId=q['runId'],reconciliationId=q['reconciliationId'],freshAudit=False)
            return
        expires=reconciliation_authorize(q,args.run_id,time.time());deadline=Deadline(expires)
        release,_,manifest=layout.installed(q['releaseId'],q['descriptorSha256'])
        reconciliation_controller(ops,layout,q,manifest)
        authorize(a,manifest,utc(a['issuedAt']));require(utc(a['issuedAt'])<=time.time(),'RECONCILE_HISTORY_FUTURE')
        intent=reconciliation_json(folder/'intent.json') if (folder/'intent.json').exists() else None
        done=None
        if (folder/'complete.json').exists():intent,done=completion_evidence(layout,folder,q)
        if intent is None:
            require(digest(encoded(state))==q['stateSha256'] and state.get('status')=='intervention-required' and state.get('phase')=='recovery-incomplete' and
                    state.get('runId')==q['runId'] and state.get('target')==q['releaseId'] and state.get('current') is None and
                    state.get('previous') is None and not state.get('history'),'RECONCILE_STATE_DIVERGED')
            require(guard==guard_projection(state),'RECONCILE_GUARD_DIVERGED')
            intent={'formatVersion':2,'authorizationSha256':auth_sha,'historySha256':q['historySha256'],'beforeState':state,
                    'beforeGuard':guard,'afterState':after,'manifestSha256':digest(encoded(manifest)),
                    'migrationChainSha256':digest(encoded(manifest['schema']['migrations']))}
        else:
            expected={'formatVersion':2,'authorizationSha256':auth_sha,'historySha256':q['historySha256'],'beforeState':intent.get('beforeState'),
                      'beforeGuard':guard_projection(intent.get('beforeState',{})),'afterState':after,
                      'manifestSha256':digest(encoded(manifest)),'migrationChainSha256':digest(encoded(manifest['schema']['migrations']))}
            require(intent==expected and digest(encoded(intent['beforeState']))==q['stateSha256'],'RECONCILE_INTENT_CHANGED')
            require(state==intent['beforeState'] or done is not None and state==after,'RECONCILE_STATE_DIVERGED')
            allowed=[guard_projection(state)]
            if done is not None and state==after:allowed.append(intent['beforeGuard'])
            require(guard in allowed,'RECONCILE_GUARD_DIVERGED')
        repair=guard!=guard_projection(state)
        old_alarm=signal.getsignal(signal.SIGALRM)
        def expired(*_):raise Refused('RECONCILE_TIMEOUT')
        signal.signal(signal.SIGALRM,expired);signal.setitimer(signal.ITIMER_REAL,deadline.check())
        observations=[]
        def observe(kind,fn):
            deadline.check();start=timestamp();value=fn();end=timestamp();deadline.check()
            observations.append({'kind':kind,'startedAt':start,'finishedAt':end,'result':value})
        try:
            observe('ENVIRONMENT_INITIAL',lambda:reconciliation_environment(ops,layout,a))
            with reconciliation_accounts(q) as accounts:
                observe('DATABASE',lambda:reconciliation_database(ops,release,manifest,accounts))
                observe('ENVIRONMENT_FINAL',lambda:reconciliation_environment(ops,layout,a))
                observe('ACCOUNTS_FINAL',lambda:{'remainingSessions':accounts.state(True,True)})
            def closed():
                absent=not os.path.lexists(Path('/run/traceflow-reconciliation')/q['reconciliationId'])
                require(absent,'RECONCILE_CREDENTIAL_RESIDUAL');return {'credentialRemoved':absent}
            observe('CREDENTIAL_CLOSED',closed)
            def integrity():
                current=layout.load();current_guard=read_guard(layout)
                require(current==state and current_guard==guard,'RECONCILE_STATE_RACE')
                history=recovery_history(path);require(history==q['historySha256'],'RECONCILE_HISTORY_CHANGED')
                _,_,latest=layout.installed(q['releaseId'],q['descriptorSha256']);reconciliation_controller(ops,layout,q,latest)
                require(latest==manifest,'RECONCILE_RELEASE_CHANGED')
                return {'stateSha256':digest(encoded(current)),'guardSha256':digest(encoded(current_guard)),
                        'historySha256':history,'manifestSha256':digest(encoded(latest))}
            observe('INTEGRITY_FINAL',integrity)
            validate_observations(observations,q,a,intent)
            for parent in (layout.state/'reconciliations',folder.parent,folder):
                parent.mkdir(mode=0o700,exist_ok=True);trusted_path(parent,directory=True,uid=os.geteuid())
                require(parent.stat().st_mode&0o777==0o700,'RECONCILE_DIRECTORY_MODE');fsync_dir(parent.parent)
            for name,value in (('authorization.json',q),('intent.json',intent)):
                if os.path.lexists(folder/name):require(reconciliation_json(folder/name)==value,'RECONCILE_DOCUMENT_CHANGED')
                else:publish_reconciliation(folder/name,value)
            audit_name='audit-'+os.urandom(16).hex()+'.json'
            audit={'formatVersion':2,'authorizationSha256':auth_sha,'intentSha256':digest(encoded(intent)),'observations':observations}
            publish_reconciliation(folder/audit_name,audit)
            audit_ref={'auditFile':audit_name,'auditSha256':digest(encoded(audit))}
            if done is None:
                done={'formatVersion':2,'status':'AUDIT_COMPLETE_STATE_PENDING','intentSha256':digest(encoded(intent)),
                      'stateSha256':digest(encoded(after)),**audit_ref}
                publish_reconciliation(folder/'complete.json',done)
            # Both controllers still see BLOCKED before this point. The new non-idle
            # status is intentionally incompatible with legacy normal activation.
            if repair:
                publish_reconciliation(folder/('guard-repair-'+os.urandom(16).hex()+'.json'),{
                    'formatVersion':2,'completeSha256':digest(encoded(done)),**audit_ref,
                    'fromGuardSha256':digest(encoded(guard)),'toGuardSha256':digest(encoded(guard_projection(after))),
                    'stateSha256':digest(encoded(state)),'reason':'KNOWN_STATE_BEFORE_GUARD_INTERRUPTION'})
            deadline.check();require(layout.load()==state and read_guard(layout)==guard,'RECONCILE_STATE_RACE')
            layout.save(after);deadline.check()
            require(layout.load()==after and read_guard(layout)==guard_projection(after),'RECONCILE_SAVE_INCOMPLETE')
            publish_reconciliation(folder/'applied.json',{'formatVersion':2,'completeSha256':digest(encoded(done)),**audit_ref,
                'stateSha256':digest(encoded(after)),'guardSha256':digest(encoded(guard_projection(after))),
                'documentsSha256':reconciliation_documents(folder)})
            reconciliation_closed(layout,after)
            ops.emit('recovery_reconciled',runId=q['runId'],reconciliationId=q['reconciliationId'],servicesStarted=False,
                     accountsChanged=False,historicalReceiptsPreserved=True)
        finally:
            signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,old_alarm)
