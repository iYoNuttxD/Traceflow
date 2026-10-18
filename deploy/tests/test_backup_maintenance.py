"""Durable maintenance FSM tests. Synthetic operations; no database or OCI calls."""
import copy,datetime as dt,os,sys,tempfile,unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
import backup_maintenance as m
from release_contract import Refused,atomic_json,private_json,encoded,digest,exclusive_lock
from activation_contract import TARGET,CONFIGS
RID='20261018T004259Z-'+'5'*40+'-'+'8'*12
NOW=dt.datetime.now(dt.timezone.utc).replace(hour=3,minute=1,second=0,microsecond=0).timestamp()
def policy():
 return {'formatVersion':1,'kind':'traceflow-recurring-maintenance','policyId':'a'*32,'operatorId':'synthetic-operator',
 'issuedAt':m.stamp(NOW-60),'expiresAt':m.stamp(NOW+6*86400),'target':TARGET.copy(),'releaseId':RID,
 'descriptorSha256':'b'*64,'runtimeManifestSha256':'c'*64,'configurationSha256':{n:'d'*64 for n in CONFIGS},
 'backupPolicy':{'path':'/etc/traceflow/recovery-policy.json','sha256':'e'*64},
 'credential':{'provider':'oci-secret-api-key','secretId':'ocid1.vaultsecret.oc1.sa-saopaulo-1.'+'a'*60,'versionNumber':1,'identity':{'userId':'ocid1.user.oc1..'+'a'*60,'tenancyId':'ocid1.tenancy.oc1..'+'b'*60,'fingerprint':':'.join(['ab']*16)}},
 'schedule':{'utcHour':3,'utcMinute':0,'startWindowSeconds':300,'intervalHours':24},
 'limits':{'captureSeconds':600,'recoverySeconds':600,'maxRuns':7},
 'approval':{'downtime':True,'runtimeAccountTransitions':True,'externalWritersExcluded':True,'externalSecretAccessAccepted':True,'supervisedValidation':True},
 'capacity':{'month':dt.datetime.fromtimestamp(NOW,dt.timezone.utc).strftime('%Y-%m'),'externalRequestsUsed':0,'expiresAt':m.stamp(NOW+6*86400)}}
def authorization(p,ident='b'*32):return {'formatVersion':1,'authorizationId':ident,'policySha256':digest(encoded(p)),'issuedAt':m.stamp(NOW-1),'expiresAt':m.stamp(NOW+599)}
class Fake:
 def __init__(self,running=True):
  self.running=running;self.locked=not running;self.clock=NOW;self.calls=[];self.faults={};self.cycle=None
  self.state={'status':'idle','phase':'active' if running else 'migration-complete','current':RID if running else None,'previous':None,'history':[]}
 def call(self,n):
  self.calls.append(n)
  if self.faults.get(n):self.faults[n]-=1;raise Refused('SYNTHETIC_'+n.upper())
 def wall(self):return self.clock
 def boot_id(self):return 'synthetic-boot'
 def process_start(self):return '123'
 def save_state(self,v):self.state=copy.deepcopy(v)
 def load_state(self):return copy.deepcopy(self.state)
 def inspect(self,p):self.call('inspect');return self.load_state(),self.running
 def stop(self):self.call('stop');self.running=False
 def drain(self):self.call('drain')
 def lock_accounts(self):self.call('lock');self.locked=True
 def verify_quiescent(self,p):self.call('quiet');assert self.locked and not self.running
 def capture(self,p,path,lease):
  self.call('capture');assert self.locked and not self.running
  with mock.patch.object(m.time,'time',return_value=self.clock):lease.check(private_json(path),self.state)
 def publish(self,p,run,expires):self.call('publish')
 def cleanup_run(self,r):self.call('cleanup')
 def check_resume(self,p,prior):self.call('resume')
 def unlock_accounts(self):self.call('unlock');self.locked=False
 def start_api(self):self.call('api');self.running=True
 def start_worker(self):self.call('worker')
 def verify_running(self,p):self.call('running');assert self.running and not self.locked
 def assert_stopped_locked(self):self.call('stopped');assert not self.running and self.locked
 def close_credential(self):self.call('credential')
 def alert(self,code):self.calls.append('alert')
class MaintenanceTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='tf-maintenance-',dir=ROOT/'build');self.root=Path(self.temp.name);self.root.chmod(0o700);(self.root/'runs').mkdir(mode=0o700)
  self.p=policy();self.ops=Fake();self.cycle=m.Cycle(self.ops,self.root)
 def tearDown(self):self.temp.cleanup()
 def run_cycle(self,p=None):return self.cycle.run(p or self.p,'supervised',authorization(p or self.p))
 def timer_authority(self,r):atomic_json(self.root/'timer-authorization.json',{'formatVersion':1,'policySha256':digest(encoded(self.p)),'approvedBy':self.p['operatorId'],'expiresAt':self.p['expiresAt'],'supervisedRunId':r['runId']})
 def test_complete_running_resume_order(self):
  prior=copy.deepcopy(self.ops.state);r=self.run_cycle();self.assertEqual(r['status'],'COMPLETE');self.assertTrue(r['backupVerified'] and r['applicationRestored'] and r['credentialClosed']);self.assertEqual(self.ops.state,prior)
  self.assertLess(self.ops.calls.index('lock'),self.ops.calls.index('capture'));self.assertLess(self.ops.calls.index('publish'),self.ops.calls.index('unlock'));self.assertLess(self.ops.calls.index('api'),self.ops.calls.index('worker'))
 def test_first_publication_never_starts(self):
  self.ops=Fake(False);self.cycle=m.Cycle(self.ops,self.root);r=self.run_cycle();self.assertEqual(r['status'],'COMPLETE');self.assertFalse(r['applicationRestored']);self.assertNotIn('unlock',self.ops.calls);self.assertNotIn('api',self.ops.calls)
 def test_policy_expired_before_inspect(self):
  self.p['expiresAt']=m.stamp(NOW);self.p['capacity']['expiresAt']=m.stamp(NOW)
  with self.assertRaises(Refused):self.run_cycle()
  self.assertEqual(self.ops.calls,[])
 def test_supervision_authorization_expired(self):
  a=authorization(self.p);a['expiresAt']=m.stamp(NOW)
  with self.assertRaises(Refused):self.cycle.run(self.p,'supervised',a)
  self.assertEqual(self.ops.calls,[])
 def test_unknown_fields(self):
  self.p['adminApproved']=True
  with self.assertRaisesRegex(Refused,'MAINTENANCE_POLICY_FIELDS'):self.run_cycle()
 def test_downtime_permission_required(self):
  self.p['approval']['downtime']=False
  with self.assertRaisesRegex(Refused,'MAINTENANCE_APPROVAL'):self.run_cycle()
 def test_supervised_replay_rejected(self):
  self.run_cycle()
  with self.assertRaisesRegex(Refused,'MAINTENANCE_REPLAY'):self.run_cycle()
 def test_timer_needs_proof_and_authorization(self):
  with self.assertRaises(Refused):self.cycle.run(self.p,'timer')
  self.assertEqual(self.ops.calls,[])
 def test_timer_after_supervised_proof(self):
  r=self.run_cycle();self.timer_authority(r);r2=self.cycle.run(self.p,'timer');self.assertEqual(r2['status'],'COMPLETE')
  with self.assertRaisesRegex(Refused,'MAINTENANCE_REPLAY'):self.cycle.run(self.p,'timer')
 def test_timer_outside_window(self):
  r=self.run_cycle();self.timer_authority(r);self.ops.clock+=300
  with self.assertRaisesRegex(Refused,'MAINTENANCE_OUTSIDE_WINDOW'):self.cycle.run(self.p,'timer')
 def test_timer_cannot_publish_first_app(self):
  self.ops=Fake(False);self.cycle=m.Cycle(self.ops,self.root);r=self.run_cycle();self.timer_authority(r)
  with self.assertRaisesRegex(Refused,'TIMER_REQUIRES_PUBLISHED_APP'):self.cycle.run(self.p,'timer')
 def test_timer_proof_path_traversal(self):
  r=self.run_cycle();self.timer_authority(r);a=private_json(self.root/'timer-authorization.json');a['supervisedRunId']='../escape';atomic_json(self.root/'timer-authorization.json',a)
  with self.assertRaisesRegex(Refused,'TIMER_PROOF_ID'):self.cycle.run(self.p,'timer')
 def test_failure_restores_running_without_claiming_backup(self):
  self.ops.faults['publish']=1;r=self.run_cycle();self.assertEqual(r['status'],'BACKUP_FAILED_APPLICATION_RESTORED');self.assertFalse(r['backupVerified']);self.assertTrue(self.ops.running);self.assertTrue((self.root/'ALERT.json').exists())
 def test_failure_before_first_publication_stays_off(self):
  self.ops=Fake(False);self.ops.faults['capture']=1;self.cycle=m.Cycle(self.ops,self.root);r=self.run_cycle();self.assertEqual(r['status'],'BACKUP_FAILED_PREACTIVATION_SAFE');self.assertTrue(self.ops.locked);self.assertNotIn('api',self.ops.calls)
 def test_partial_unlock_failure_relocks(self):
  original=self.ops.unlock_accounts
  def fail():original();raise Refused('UNLOCK_PARTIAL')
  self.ops.unlock_accounts=fail;r=self.run_cycle();self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertTrue(self.ops.locked);self.assertFalse(self.ops.running);self.assertEqual(self.ops.state['status'],'intervention-required')
 def test_delayed_backup_fails_then_restores_within_recovery_window(self):
  self.ops.publish=lambda *a:setattr(self.ops,'clock',NOW+601);r=self.run_cycle();self.assertFalse(r['backupVerified']);self.assertEqual(r['status'],'BACKUP_FAILED_APPLICATION_RESTORED')
 def test_expired_recovery_never_unlocks(self):
  self.ops.publish=lambda *a:setattr(self.ops,'clock',NOW+1201);r=self.run_cycle();self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertNotIn('unlock',self.ops.calls)
 def test_policy_expires_during_capture_blocks_resume(self):
  self.p['expiresAt']=m.stamp(NOW+10);self.p['capacity']['expiresAt']=self.p['expiresAt'];self.ops.capture=lambda *a:setattr(self.ops,'clock',NOW+11)
  r=self.run_cycle();self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertTrue(self.ops.locked)
 def test_recovery_is_idempotent(self):
  r=self.run_cycle();before=self.ops.calls.copy();self.assertEqual(self.cycle.recover(),r);self.assertEqual(self.ops.calls,before)
 def test_raw_failure_is_sanitized(self):
  self.ops.capture=lambda *a:(_ for _ in ()).throw(ValueError('mysql://password-secret@host/private SQL'))
  r=self.run_cycle();self.assertEqual(r['failure'],'MAINTENANCE_OPERATION_FAILED');self.assertNotIn('password-secret',encoded(r).decode())
 def test_operational_lock_prevents_concurrent_cycles(self):
  lock=self.root/'operation.lock'
  with exclusive_lock(lock):
   with self.assertRaisesRegex(Refused,'OPERATION_LOCKED'):
    with exclusive_lock(lock):self.run_cycle()
  self.assertEqual(self.ops.calls,[])
 def test_lease_cannot_be_reused(self):
  saved=[];original=self.ops.capture
  def capture(p,path,lease):saved.append(lease);original(p,path,lease)
  self.ops.capture=capture;r=self.run_cycle();self.assertFalse(saved[0].active)
  with self.assertRaisesRegex(Refused,'MAINTENANCE_LOCK_LEASE'):saved[0].check(r['captureAuthorization'],self.ops.state)
 def test_prior_concurrent_operation_not_overwritten(self):
  r=self.run_cycle();r['status']='IN_PROGRESS';atomic_json(self.root/'active.json',r);self.ops.state={'status':'in-progress','operation':'migration'}
  with self.assertRaisesRegex(Refused,'MAINTENANCE_STATE_CONFLICT'):self.cycle.recover()
  self.assertEqual(self.ops.state['operation'],'migration')
 def test_tampered_journal_never_resumes(self):
  r=self.run_cycle();r['status']='IN_PROGRESS';r['policy']['operatorId']='another';atomic_json(self.root/'active.json',r)
  with self.assertRaisesRegex(Refused,'MAINTENANCE_JOURNAL_INTEGRITY'):self.cycle.recover()
 def test_sigterm_failure_restores(self):
  self.ops.capture=lambda *a:(_ for _ in ()).throw(KeyboardInterrupt());r=self.run_cycle();self.assertEqual(r['status'],'BACKUP_FAILED_APPLICATION_RESTORED')
 def test_expired_policy_stopped_recovery_allowed(self):
  self.ops=Fake(False);self.cycle=m.Cycle(self.ops,self.root);r=self.run_cycle();r['status']='IN_PROGRESS';r['backupVerified']=False;atomic_json(self.root/'active.json',r);self.ops.clock=NOW+8*86400
  self.assertEqual(self.cycle.recover()['status'],'BACKUP_FAILED_PREACTIVATION_SAFE');self.assertNotIn('api',self.ops.calls)
 def test_interrupted_scratch_refuses_resume(self):
  self.ops.faults['cleanup']=1;r=self.run_cycle();self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertNotIn('unlock',self.ops.calls)

def failure_case(name,code,pre=False):
 def test(self):
  self.ops.faults[name]=1;r=self.run_cycle();self.assertEqual(r['status'],code)
  if code=='INTERVENTION_REQUIRED':self.assertTrue(self.ops.locked);self.assertFalse(self.ops.running)
  else:self.assertTrue(self.ops.running)
 return test
for name in ('stop','drain','lock','quiet','capture','publish'):
 setattr(MaintenanceTests,'test_once_failure_'+name,failure_case(name,'BACKUP_FAILED_APPLICATION_RESTORED'))
for name in ('resume','unlock','api','worker','running','credential'):
 setattr(MaintenanceTests,'test_recovery_failure_'+name,failure_case(name,'INTERVENTION_REQUIRED'))

def policy_failure(field,value):
 def test(self):
  self.p[field]=value
  with self.assertRaises((Refused,TypeError,ValueError)):self.run_cycle()
  self.assertEqual(self.ops.calls,[])
 return test
for name,field,value in [('version','formatVersion',2),('target','target',{}),('extra_config','configurationSha256',{}),('unsafe_credential','credential',{}),('long_window','limits',{'captureSeconds':99999}),('capacity','capacity',{}),('schedule','schedule',{}),('operator','operatorId','bad\nsecret')]:
 setattr(MaintenanceTests,'test_policy_'+name,policy_failure(field,value))
if __name__=='__main__':unittest.main()
