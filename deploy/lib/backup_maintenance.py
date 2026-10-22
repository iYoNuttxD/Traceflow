"""Recurring maintenance policy and durable state machine. No network or SQL here.

The operator grants a bounded, revocable delegation; each run derives a short lease
from that delegation and observed state, never from a synthetic approval boolean.
"""
import contextlib,datetime as dt,os,re,time,uuid
from pathlib import Path
from activation_contract import exact,utc,timestamp,sha,CONFIGS,TARGET
from release_contract import (Refused,require,private_json,encoded,digest,file_digest,
                              atomic_json,fsync_dir,exclusive_lock,release_id)
from operational_io import private_write,secure_read

TERMINAL={'COMPLETE','BACKUP_FAILED_APPLICATION_RESTORED','BACKUP_FAILED_PREACTIVATION_SAFE'}
POLICY_KEYS={'formatVersion','kind','policyId','operatorId','issuedAt','expiresAt','target',
 'releaseId','descriptorSha256','runtimeManifestSha256','configurationSha256','backupPolicy',
 'credential','schedule','limits','approval','capacity'}

def validate_policy(p,wall=None,expired=False):
 wall=time.time() if wall is None else wall
 exact(p,POLICY_KEYS,'MAINTENANCE_POLICY_FIELDS')
 require(p['formatVersion']==1 and p['kind']=='traceflow-recurring-maintenance' and
         re.fullmatch(r'[a-f0-9]{32}',p['policyId'] or ''),'MAINTENANCE_POLICY_KIND')
 require(isinstance(p['operatorId'],str) and re.fullmatch(r'[A-Za-z0-9._@-]{3,80}',p['operatorId']),'MAINTENANCE_OPERATOR')
 issued,expiry=utc(p['issuedAt']),utc(p['expiresAt'])
 require(issued<=wall and 0<expiry-issued<=7*86400 and (expired or wall<expiry),'MAINTENANCE_POLICY_EXPIRED')
 require(p['target']==TARGET,'MAINTENANCE_TARGET');release_id(p['releaseId'])
 for k in ('descriptorSha256','runtimeManifestSha256'):sha(p[k])
 exact(p['configurationSha256'],CONFIGS,'MAINTENANCE_CONFIGS')
 for h in p['configurationSha256'].values():sha(h)
 require(p['schedule']=={'utcHour':3,'utcMinute':0,'startWindowSeconds':300,'intervalHours':24},'MAINTENANCE_SCHEDULE')
 require(p['limits']=={'captureSeconds':600,'recoverySeconds':600,'maxRuns':7},'MAINTENANCE_LIMITS')
 require(p['approval']=={'downtime':True,'runtimeAccountTransitions':True,'externalWritersExcluded':True,
                         'externalSecretAccessAccepted':True,'supervisedValidation':True},'MAINTENANCE_APPROVAL')
 exact(p['backupPolicy'],{'path','sha256'},'BACKUP_POLICY_REFERENCE')
 require(p['backupPolicy']['path']=='/etc/traceflow/recovery-policy.json','BACKUP_POLICY_PATH');sha(p['backupPolicy']['sha256'])
 from backup_secrets import validate_reference
 validate_reference(p['credential'])
 exact(p['capacity'],{'month','externalRequestsUsed','expiresAt'},'MAINTENANCE_CAPACITY')
 require(re.fullmatch(r'\d{4}-\d{2}',p['capacity']['month']) and type(p['capacity']['externalRequestsUsed']) is int and
         0<=p['capacity']['externalRequestsUsed']<=1000-7*32 and
         issued<utc(p['capacity']['expiresAt'])<=expiry,'MAINTENANCE_CAPACITY')
 if not expired:
  require(dt.datetime.fromtimestamp(wall,dt.timezone.utc).strftime('%Y-%m')==p['capacity']['month'] and
          wall<utc(p['capacity']['expiresAt']),'MAINTENANCE_CAPACITY_EXPIRED')
 return expiry

def public_code(e):
 return str(e) if isinstance(e,Refused) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',str(e)) else 'MAINTENANCE_OPERATION_FAILED'

def stamp(seconds):return dt.datetime.fromtimestamp(seconds,dt.timezone.utc).isoformat().replace('+00:00','Z')

class Lease:
 """In-process proof that capture runs inside the already-held deployment lock."""
 def __init__(self,path,run,prior,policy,policy_sha):
  self.path,self.run,self.prior,self.policy,self.policy_sha=path,run,prior,policy,policy_sha
  self.pid=os.getpid();self.active=True
 def check(self,a,state):
  require(self.active and self.pid==os.getpid(),'MAINTENANCE_LOCK_LEASE')
  require(state.get('operation')=='backup-maintenance' and state.get('runId')==self.run['runId'] and
          state.get('status')=='in-progress' and state.get('phase')=='backup-capturing','MAINTENANCE_CAPTURE_STATE')
  require(a==self.run['captureAuthorization'] and a['releaseId']==self.policy['releaseId'] and
          self.run['policySha256']==self.policy_sha and time.time()<utc(a['expiresAt']),'MAINTENANCE_CAPTURE_LEASE')
  require(self.prior==self.run['priorState'] and digest(encoded(self.prior))==self.run['priorStateSha256'],
          'MAINTENANCE_PRIOR_INTEGRITY')
  require(self.prior['status']=='idle' or self.run['mode']=='supervised' and
          self.prior['status']=='reconciled-v2','MAINTENANCE_PRIOR_STATE')

class Cycle:
 """All calls occur with release.operation.lock and recovery.operation.lock held.

Operations are supplied by the reviewed Linux adapter; fixtures implement the same
boundary. SIGKILL/reboot recovery reloads the journal, never replays capture/upload.
 """
 def __init__(self,ops,root):self.ops=ops;self.root=Path(root);self.run_id=None
 def save(self,r):atomic_json(self.root/'active.json',r)
 def event(self,r,event,**fields):
  d={'formatVersion':1,'runId':r['runId'],'policySha256':r['policySha256'],'event':event,'at':timestamp(),**fields}
  folder=self.root/'runs'/r['runId'];private_write(folder/(uuid.uuid4().hex+'.json'),encoded(d));fsync_dir(folder)
 def alert(self,r,code):
  atomic_json(self.root/'ALERT.json',{'status':'ALERT','runId':r['runId'],'code':code,'at':timestamp(),
                                    'applicationRestored':r.get('applicationRestored',False),'backupVerified':r.get('backupVerified',False)})
  self.ops.alert(code)
 def transition(self,r,phase):
  r['phase']=phase;self.save(r);self.event(r,phase)
  state=dict(r['priorState'],status='in-progress',operation='backup-maintenance',runId=r['runId'],
             target=r['releaseId'],phase=phase,pid=os.getpid(),bootId=self.ops.boot_id(),
             processStart=self.ops.process_start(),expiresAt=r['recoverUntil'])
  self.ops.save_state(state)
 def reserve(self,p,policy_sha,mode,supervised,consume=True):
  wall=self.ops.wall();validate_policy(p,wall)
  require(not any(self.root.glob('.write-*')),'MAINTENANCE_PERSISTENCE_RESIDUE')
  active=self.root/'active.json'
  if active.exists():require(private_json(active)['status'] in TERMINAL,'MAINTENANCE_RECOVERY_REQUIRED')
  ledger=self.root/('policy-'+p['policyId']+'.json')
  used=private_json(ledger) if ledger.exists() else {'policySha256':policy_sha,'slots':[]}
  require(used['policySha256']==policy_sha,'MAINTENANCE_POLICY_CHANGED')
  require(len(used['slots'])<p['limits']['maxRuns'],'MAINTENANCE_RUN_LIMIT')
  if mode=='timer':
   d=dt.datetime.fromtimestamp(wall,dt.timezone.utc);s=p['schedule'];elapsed=(d.hour-s['utcHour'])*3600+d.minute*60+d.second
   require(0<=elapsed<s['startWindowSeconds'],'MAINTENANCE_OUTSIDE_WINDOW')
   approval=private_json(self.root/'timer-authorization.json')
   exact(approval,{'formatVersion','policySha256','approvedBy','expiresAt','supervisedRunId'},'TIMER_AUTHORIZATION_FIELDS')
   require(approval['formatVersion']==1 and approval['policySha256']==policy_sha and approval['approvedBy']==p['operatorId'] and
           wall<utc(approval['expiresAt'])<=utc(p['expiresAt']),'TIMER_NOT_AUTHORIZED')
   require(isinstance(approval['supervisedRunId'],str) and re.fullmatch(r'[a-f0-9]{32}',approval['supervisedRunId']),'TIMER_PROOF_ID')
   proof=private_json(self.root/'runs'/approval['supervisedRunId']/'result.json')
   require(proof['status']=='COMPLETE' and proof['mode']=='supervised' and proof['policySha256']==policy_sha and
           proof['backupVerified'] is True and proof['credentialClosed'] is True,'SUPERVISED_RUN_REQUIRED')
   slot=d.strftime('%Y-%m-%d')
  else:
   require(mode=='supervised','MAINTENANCE_MODE')
   exact(supervised,{'formatVersion','authorizationId','policySha256','issuedAt','expiresAt'},'SUPERVISED_AUTH_FIELDS')
   require(supervised['formatVersion']==1 and re.fullmatch(r'[a-f0-9]{32}',supervised['authorizationId']) and
           supervised['policySha256']==policy_sha and utc(supervised['issuedAt'])<=wall<utc(supervised['expiresAt']) and
           0<utc(supervised['expiresAt'])-utc(supervised['issuedAt'])<=600,'SUPERVISED_AUTHORIZATION')
   slot='supervised-'+supervised['authorizationId']
  require(slot not in used['slots'],'MAINTENANCE_REPLAY')
  # Validation is repeated under both official locks after eligibility. Only then
  # reserve before the first maintenance mutation; never refund/reuse a slot.
  if consume:
   used['slots'].append(slot);atomic_json(ledger,used)
  return wall
 def run(self,p,mode,supervised=None):
  policy_sha=digest(encoded(p));self.reserve(p,policy_sha,mode,supervised,consume=False)
  prior,was_running=self.ops.inspect(p,mode)
  require(mode=='supervised' or was_running,'TIMER_REQUIRES_PUBLISHED_APP')
  wall=self.reserve(p,policy_sha,mode,supervised)
  self.run_id=run_id=uuid.uuid4().hex
  folder=self.root/'runs'/run_id;folder.mkdir(mode=0o700);fsync_dir(folder.parent)
  r={'formatVersion':1,'runId':run_id,'mode':mode,'policy':p,'policySha256':policy_sha,'releaseId':p['releaseId'],
     'priorState':prior,'priorStateSha256':digest(encoded(prior)),'wasRunning':was_running,'startedAt':stamp(wall),
     'captureExpiresAt':stamp(min(wall+600,utc(p['expiresAt']),utc(p['capacity']['expiresAt']))),
     'recoverUntil':stamp(wall+1200),'status':'IN_PROGRESS','phase':'prepared','backupVerified':False,
     'applicationRestored':False,'credentialClosed':False,'captureAuthorization':None}
  self.save(r);private_write(folder/'prepared.json',encoded(r));fsync_dir(folder)
  try:
   self.transition(r,'backup-stopping');self.ops.stop();self.ops.drain();self.ops.lock_accounts()
   self.transition(r,'backup-locked');self.ops.verify_quiescent(p)
   require(self.ops.wall()<utc(r['captureExpiresAt']),'BACKUP_WINDOW')
   a={'formatVersion':1,'backupId':run_id,'issuedAt':timestamp(),'expiresAt':r['captureExpiresAt'],
      'releaseId':p['releaseId'],'runtimeManifestSha256':p['runtimeManifestSha256'],
      'configurationSha256':p['configurationSha256'],'operatorId':p['operatorId'],
      'externalWritersControlled':p['approval']['externalWritersExcluded'],'maintenanceAuthorized':True,
      'preActivation':not was_running}
   r['captureAuthorization']=a;self.save(r)
   private_write(folder/'capture-authorization.json',encoded(a))
   self.event(r,'delegation-derived',policyId=p['policyId'],authorizationSha256=file_digest(folder/'capture-authorization.json'))
   self.transition(r,'backup-capturing')
   lease=Lease(folder,r,prior,p,policy_sha)
   try:self.ops.capture(p,folder/'capture-authorization.json',lease)
   finally:lease.active=False
   require(self.ops.wall()<utc(r['captureExpiresAt']),'BACKUP_WINDOW')
   self.transition(r,'backup-publishing');self.ops.publish(p,run_id,r['captureExpiresAt'])
   require(self.ops.wall()<utc(r['captureExpiresAt']),'BACKUP_WINDOW')
   r['backupVerified']=True;self.save(r);self.event(r,'backup-verified')
  except BaseException as e:
   r['failure']=public_code(e);self.save(r);self.event(r,'operation-failed',code=r['failure'])
  return self.recover(r)
 def recover(self,r=None):
  if r is None:
   if not (self.root/'active.json').exists():return {'status':'NO_PENDING_MAINTENANCE'}
   r=private_json(self.root/'active.json')
  if r['status'] in TERMINAL:return r
  require(r['formatVersion']==1 and re.fullmatch(r'[a-f0-9]{32}',r['runId']) and
          r['policySha256']==digest(encoded(r['policy'])),'MAINTENANCE_JOURNAL_INTEGRITY')
  p=r['policy'];validate_policy(p,self.ops.wall(),expired=True)
  # A controller can die after saving the journal but before marking the release.
  # Refuse recovery over another operation; do not overwrite a concurrent deploy.
  state=self.ops.load_state()
  require(state==r['priorState'] or state.get('operation')=='backup-maintenance' and
          state.get('runId')==r['runId'],'MAINTENANCE_STATE_CONFLICT')
  self.run_id=r['runId']
  try:
   require(not any(self.root.glob('.write-*')),'MAINTENANCE_PERSISTENCE_RESIDUE')
   prepared=private_json(self.root/'runs'/r['runId']/'prepared.json')
   immutable=('formatVersion','runId','mode','policy','policySha256','releaseId','priorState',
              'priorStateSha256','wasRunning','startedAt','captureExpiresAt','recoverUntil')
   require(all(r[k]==prepared[k] for k in immutable) and
           r['priorStateSha256']==digest(encoded(r['priorState'])),'MAINTENANCE_PRIOR_INTEGRITY')
   self.ops.validate_prior(p,r['priorState'],r['mode'],check_guard=False)
   self.transition(r,'backup-recovering');self.ops.stop();self.ops.drain();self.ops.lock_accounts()
   self.ops.verify_quiescent(p);self.ops.cleanup_run(r)
   if r['wasRunning']:
    require(self.ops.wall()<utc(r['recoverUntil']),'MAINTENANCE_RECOVERY_EXPIRED')
    validate_policy(p,self.ops.wall())
    self.ops.check_resume(p,r['priorState'])
    self.ops.unlock_accounts()
    self.transition(r,'starting-api');self.ops.start_api()
    self.transition(r,'starting-worker');self.ops.start_worker()
    self.ops.verify_running(p)
   else:self.ops.assert_stopped_locked()
   self.ops.close_credential();r['credentialClosed']=True
   self.ops.save_state(r['priorState']);r['applicationRestored']=r['wasRunning']
   r['status']='COMPLETE' if r['backupVerified'] else ('BACKUP_FAILED_APPLICATION_RESTORED' if r['wasRunning'] else 'BACKUP_FAILED_PREACTIVATION_SAFE')
   r['phase']='closed';self.save(r)
   atomic_json(self.root/'runs'/r['runId']/'result.json',r)
   self.event(r,'closed',status=r['status'],backupVerified=r['backupVerified'],applicationRestored=r['applicationRestored'])
   if not r['backupVerified']:self.alert(r,r.get('failure','MAINTENANCE_INTERRUPTED'))
   return r
  except BaseException as e:
   r['status']='INTERVENTION_REQUIRED';r['phase']='blocked';r['recoveryFailure']=public_code(e)
   # Independently attempt containment, without broad KILL or any schema rollback.
   errors=[]
   for name,fn in (('stop',self.ops.stop),('drain',self.ops.drain),('lock',self.ops.lock_accounts),('credential',self.ops.close_credential)):
    try:fn()
    except BaseException:errors.append(name)
   r['containmentFailures']=errors;self.save(r)
   blocked=dict(r['priorState'],status='intervention-required',phase='backup-recovery-incomplete',operation='backup-maintenance',runId=r['runId'],target=r['releaseId'])
   try:self.ops.save_state(blocked)
   except BaseException:
    r['statePublicationFailed']=True;self.save(r)
   self.alert(r,r['recoveryFailure'])
   atomic_json(self.root/'runs'/r['runId']/'result.json',r);return r
