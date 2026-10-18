"""Linux adapter for the bounded maintenance state machine; no configurable SQL."""
import contextlib,datetime as dt,importlib.util,json,os,pwd,stat,sys,time
from pathlib import Path
from activation_contract import CONFIGS,utc
from activation_accounts import Accounts
from backup_maintenance import validate_policy,stamp
from operational_io import secure_read,private_write,tool,unique
from release_contract import (require,private_json,encoded,digest,file_digest,atomic_json,
                              fsync_dir,trusted_path,Refused)
from recovery_policy import validate_policy as validate_backup_policy

ROOT=Path('/var/lib/traceflow-recovery/maintenance')
POLICY=Path('/etc/traceflow/maintenance-policy.json')
UNITS=('traceflow-api.service','traceflow-github-worker.service')

def load_module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m

def read_policy(path=POLICY,expired=False):
 raw=secure_read(path,0,65536,0o600);p=unique(raw)
 require(raw==encoded(p),'POLICY_CANONICAL_JSON');validate_policy(p,expired=expired);return p

class LinuxOperations:
 def __init__(self,release):
  self.release=Path(release);self.ops=load_module('maintenance_release_ops',self.release/'deploy/scripts/release.py')
  self.backup=load_module('maintenance_backup_ops',self.release/'deploy/scripts/recovery-backup.py')
  self.layout=self.ops.Layout();self.ops.native_context(self.layout)
  self.credential_path=Path('/run/traceflow-maintenance/admin.cnf');self.started=None
 def wall(self):return time.time()
 def boot_id(self):return self.ops.boot_id()
 def process_start(self):return self.ops.proc_start(os.getpid())
 def load_state(self):return self.layout.load()
 def save_state(self,state):self.layout.save(state)
 def credential(self,p):
  from backup_secrets import fetch
  raw=fetch(p,self.backup_policy)
  parent=self.credential_path.parent
  parent.mkdir(mode=0o700,exist_ok=True);trusted_path(parent,directory=True,uid=0)
  require(stat.S_IMODE(parent.stat().st_mode)==0o700,'CREDENTIAL_DIRECTORY_MODE')
  if self.credential_path.exists():require(secure_read(self.credential_path,0,4096,0o600)==raw,'VOLATILE_CREDENTIAL_CHANGED')
  else:private_write(self.credential_path,raw)
  self.accounts=Accounts(self.credential_path);self.policy=p
 def ensure_accounts(self,p):
  if not hasattr(self,'accounts') or not self.credential_path.exists():self.credential(p)
  return self.accounts
 def references(self,p):
  runtime,admin,manifest=self.layout.installed(p['releaseId'],p['descriptorSha256'])
  require(runtime==self.release and file_digest(runtime/'manifest.json')==p['runtimeManifestSha256'],'MAINTENANCE_RELEASE')
  require(manifest['sourceState']=='committed' and len(manifest['schema']['migrations'])==68,'MAINTENANCE_SOURCE')
  for name in CONFIGS:require(digest(secure_read('/etc/traceflow/'+name,0,65536,0o600))==p['configurationSha256'][name],'MAINTENANCE_CONFIGURATION_CHANGED')
  raw=secure_read(p['backupPolicy']['path'],0,65536,0o600)
  require(digest(raw)==p['backupPolicy']['sha256'],'BACKUP_POLICY_CHANGED')
  backup=unique(raw);validate_backup_policy(backup)
  for name in ('age','oci'):
   trusted_path(Path(backup[name]),uid=0);require(file_digest(Path(backup[name]))==backup[name+'Sha256'],'BACKUP_TOOL_CHANGED')
  require(self.ops.command(['getenforce']).stdout.strip()=='Enforcing','SELINUX_REQUIRED')
  self.manifest,self.backup_policy=manifest,backup
  return manifest
 def source(self):return self.backup.Source(self.accounts,self.manifest,self.release)
 def ledger(self):
  src=self.source();src.identity()
  rows=src.rows("SELECT JSON_OBJECT('name',migration_name,'sha256',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY CAST(migration_name AS BINARY)")
  require([{'name':r['name'],'sha256':r['sha256']} for r in rows]==self.manifest['schema']['migrations'] and
          all(r['finished'] and not r['rolledBack'] for r in rows),'MIGRATION_CHAIN_MISMATCH')
 def inspect(self,p):
  self.references(p);self.credential(p);state=self.load_state();self.layout.current_matches(state)
  require(state['status']=='idle','MAINTENANCE_RECOVERY_REQUIRED')
  values=[self.ops.service_state(u) for u in UNITS]
  active=all(v.get('ActiveState')=='active' and int(v.get('MainPID','0'))>0 for v in values)
  off=all(v.get('ActiveState')=='inactive' and v.get('MainPID')=='0' for v in values)
  if state.get('current') is None:
   require(off and state.get('previous') is None and not state.get('history') and
           state.get('phase') in ('migration-complete','migration-recovered','first-activation-recovered'),'PREACTIVATION_STATE')
   self.accounts.state(True,True);self.accounts.audit(True)
  else:
   require(state['current']==p['releaseId'] and active,'MAINTENANCE_RUNTIME_STATE')
   self.accounts.state(False,False);self.accounts.audit(False);self.verify_running(p)
  self.ledger();return state,active
 def stop(self):self.ops.stop_services()
 def drain(self):
  end=time.monotonic()+45
  plan=[{'id':'DRAIN','sql':"SELECT JSON_ARRAY(PROCESSLIST_ID,PROCESSLIST_USER,PROCESSLIST_HOST) FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_USER IN ('traceflow_api','traceflow_worker','traceflow_diag','traceflow_migrator') ORDER BY PROCESSLIST_ID",'width':3}]
  while True:
   rows,_=self.accounts.query(plan)
   require(all(r[1] in ('traceflow_api','traceflow_worker') and r[2].split(':')[0]=='10.20.1.184' for r in rows['DRAIN']),'UNEXPECTED_RUNTIME_SESSION')
   if not rows['DRAIN']:return
   require(time.monotonic()<end,'RUNTIME_SESSIONS_REMAIN');time.sleep(.25)
 def lock_accounts(self):self.accounts.relock()
 def verify_quiescent(self,p):
  self.references(p);self.backup.stopped();self.accounts.state(True,True);self.accounts.audit(True);self.ledger();self.source().quiescent()
 def capture(self,p,auth_path,lease):
  a=private_json(auth_path);folder=Path('/run/traceflow-recovery')/a['backupId']
  folder.parent.mkdir(mode=0o700,exist_ok=True);trusted_path(folder.parent,directory=True,uid=0)
  folder.mkdir(mode=0o700);private_write(folder/'admin.cnf',secure_read(self.credential_path,0,4096,0o600))
  try:return self.backup.capture(self.backup_policy,auth_path,_maintenance=lease)
  finally:
   credential=folder/'admin.cnf'
   if credential.exists():secure_read(credential,0,4096,0o600);credential.unlink();fsync_dir(folder)
   if folder.exists():require(not list(folder.iterdir()),'CAPTURE_CREDENTIAL_CONTENT');folder.rmdir();fsync_dir(folder.parent)
 def publish(self,p,run_id,expires):
  require(self.wall()<utc(expires),'BACKUP_WINDOW')
  # Delegated capacity is explicit in the approved policy; actual bucket/size/budget
  # are still inspected by publish. The parent hash is preserved in the journal.
  approval={'formatVersion':1,'month':p['capacity']['month'],'expiresAt':stamp(min(self.wall()+3600,utc(p['capacity']['expiresAt']))),
            'approved':True,'externalRequestsUsed':p['capacity']['externalRequestsUsed']}
  path=self.backup.STATE/'capacity-authorization.json'
  require(not path.exists(),'UNEXPECTED_CAPACITY_AUTHORIZATION')
  receipt=ROOT/'runs'/run_id/'capacity-created.json'
  private_write(receipt,encoded({'path':str(path),'sha256':digest(encoded(approval))}));fsync_dir(receipt.parent)
  private_write(path,encoded(approval));fsync_dir(path.parent)
  try:
   result=self.backup.publish(self.backup_policy,run_id)
   require(result['status']=='BACKUP_EXTERNAL_READBACK_PASS' and result['backupId']==run_id,'BACKUP_PUBLISH_UNVERIFIED')
   return result
  finally:
   require(private_json(path)==approval,'CAPACITY_AUTHORIZATION_CHANGED');path.unlink();fsync_dir(path.parent)
 def cleanup_run(self,r):
  # Interrupted plaintext capture needs explicit operator cleanup until ownership
  # receipts for every transient path have been verified. Never delete by prefix.
  run_id=r['runId']
  from re import fullmatch
  require(fullmatch(r'[a-f0-9]{32}',run_id),'MAINTENANCE_RUN_ID')
  for path in (Path('/run')/('traceflow-recovery-'+run_id),Path('/run/traceflow-recovery')/run_id):
   require(not os.path.lexists(path),'INTERRUPTED_SCRATCH_REQUIRES_REVIEW')
  require(not (self.backup.STATE/'capacity-authorization.json').exists(),'INTERRUPTED_CAPACITY_REQUIRES_REVIEW')
 def check_resume(self,p,prior):
  self.references(p);self.layout.current_matches(prior);self.ledger();self.accounts.audit(True)
 def unlock_accounts(self):self.accounts.unlock()
 def start_api(self):
  self.ops.command(['systemctl','reset-failed',*UNITS],check=False);self.ops.command(['systemctl','start',UNITS[0]],timeout=45)
  deadline=time.monotonic()+40
  while True:
   try:ready=self.ops.local_probe('/health/ready')[0]==200
   except OSError:ready=False
   if ready:return
   require(time.monotonic()<deadline,'READINESS_TIMEOUT');time.sleep(.25)
 def start_worker(self):
  self.started=int(time.time()*1000);self.ops.command(['systemctl','start',UNITS[1]],timeout=60)
 def verify_running(self,p):
  for u in UNITS:self.ops.process_release(u,self.release)
  for route in ('/health/live','/health/ready'):
   status,body=self.ops.local_probe(route);require(status==200 and isinstance(json.loads(body),dict),'MAINTENANCE_HEALTH')
  end=time.monotonic()+75
  while True:
   rows=self.source().rows("SELECT JSON_ARRAY(COUNT(*),COALESCE(CAST(MAX(UNIX_TIMESTAMP(heartbeatAt)*1000) AS UNSIGNED),0)) FROM GitHubSchedulerWorker WHERE heartbeatAt>=UTC_TIMESTAMP(3)-INTERVAL 60 SECOND")
   require(len(rows)==1 and len(rows[0])==2 and type(rows[0][0]) is int and rows[0][0]<=1,'MAINTENANCE_HEARTBEAT')
   if rows[0][0]==1 and (self.started is None or rows[0][1]>=self.started):break
   require(time.monotonic()<end,'WORKER_HEARTBEAT_TIMEOUT');time.sleep(.5)
  state=self.load_state();self.ops.check_generation(self.layout,state['web'],p['releaseId'])
  self.ops.frontend_probe(self.layout,{'frontend':{'url':'https://traceflow.dev'}},self.layout.generations/state['web']/'dist')
  self.accounts.state(False,False);self.accounts.audit(False);self.ledger()
 def assert_stopped_locked(self):self.ops.assert_stopped();self.accounts.state(True,True)
 def close_credential(self):
  if self.credential_path.exists():secure_read(self.credential_path,0,4096,0o600);self.credential_path.unlink();fsync_dir(self.credential_path.parent)
 def alert(self,code):
  # Local durable alert + critical system journal. No email/webhook without approval.
  with contextlib.suppress(Exception):tool(['/usr/bin/logger','-p','daemon.crit','-t','traceflow-recovery','TraceFlow backup requires operator review: '+code],timeout=5)
 def emergency(self,code):
  state=self.load_state()
  if state.get('operation')!='backup-maintenance' or state.get('status')=='idle':return
  state.update(status='intervention-required',phase='backup-recovery-incomplete');self.save_state(state)
  with contextlib.suppress(BaseException):self.stop()
  with contextlib.suppress(BaseException):self.drain();self.lock_accounts()
  with contextlib.suppress(BaseException):self.close_credential()
  atomic_json(ROOT/'ALERT.json',{'status':'INTERVENTION_REQUIRED','code':code,'at':stamp(self.wall()),'runId':state.get('runId')})
  self.alert(code)
