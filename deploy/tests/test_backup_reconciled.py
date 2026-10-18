"""Local custody/FSM tests; MySQL, services, secret access and OCI are simulated."""
import copy,json,sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.path[:0]=[str(Path(__file__).parent),str(Path(__file__).parents[1]/'lib')]
import test_backup_maintenance as fixtures
import test_activation_reconciliation as reconciliation
import backup_maintenance as maintenance
import backup_runtime as runtime
import activation_window as window
from release_contract import Refused,private_json,atomic_json,encoded,digest,file_digest

class ReservationTests(unittest.TestCase):
 def setUp(self):
  self.h=fixtures.MaintenanceTests();self.h.setUp();self.addCleanup(self.h.tearDown)
  self.p,self.ops,self.cycle,self.root=self.h.p,self.h.ops,self.h.cycle,self.h.root
 def run_cycle(self):return self.h.run_cycle()
 def slots(self):
  path=self.root/('policy-'+self.p['policyId']+'.json')
  return private_json(path)['slots'] if path.exists() else []
 def reconciled(self):
  self.ops.running=False;self.ops.locked=True
  self.ops.state.update(status='reconciled-v2',phase=window.RECONCILED_PHASE,current=None,
   recoveryProof={'kind':'activation-recovery','runId':'9'*32},runId='9'*32)
 def test_preflight_refusal_consumes_zero(self):
  self.ops.faults['inspect']=1
  with self.assertRaises(Refused):self.run_cycle()
  self.assertEqual(self.slots(),[]);self.assertIsNone(self.cycle.run_id)
  self.assertFalse((self.root/'active.json').exists());self.assertNotIn('stop',self.ops.calls)
 def test_late_authorization_expiry_consumes_zero(self):
  inspect=self.ops.inspect
  def late(*a):result=inspect(*a);self.ops.clock+=600;return result
  self.ops.inspect=late
  with self.assertRaisesRegex(Refused,'SUPERVISED_AUTHORIZATION'):self.run_cycle()
  self.assertEqual(self.slots(),[]);self.assertFalse((self.root/'active.json').exists())
 def test_timer_prepublication_consumes_zero(self):
  self.reconciled();first=self.run_cycle();self.h.timer_authority(first)
  count=len(self.slots())
  with self.assertRaisesRegex(Refused,'TIMER_REQUIRES_PUBLISHED_APP'):self.cycle.run(self.p,'timer')
  self.assertEqual(len(self.slots()),count)
 def test_exactly_one_slot_before_capture_no_refund(self):
  original=self.ops.capture
  def capture(*a):self.assertEqual(len(self.slots()),1);original(*a)
  self.ops.capture=capture;self.ops.faults['publish']=1
  result=self.run_cycle();self.assertFalse(result['backupVerified']);self.assertEqual(len(self.slots()),1)
  with self.assertRaisesRegex(Refused,'MAINTENANCE_REPLAY'):self.run_cycle()
  self.assertEqual(len(self.slots()),1)
 def test_reservation_failure_no_state_mutation(self):
  state=self.ops.load_state();original=maintenance.atomic_json
  def fail(path,value,*a):
   if path.name.startswith('policy-'):raise OSError('synthetic disk failure')
   return original(path,value,*a)
  with mock.patch.object(maintenance,'atomic_json',side_effect=fail),self.assertRaises(OSError):self.run_cycle()
  self.assertEqual(state,self.ops.load_state());self.assertNotIn('stop',self.ops.calls)
 def test_failure_after_slot_before_journal_is_never_refunded(self):
  with mock.patch.object(self.cycle,'save',side_effect=OSError('synthetic disk failure')),self.assertRaises(OSError):self.run_cycle()
  self.assertEqual(len(self.slots()),1);self.assertNotIn('stop',self.ops.calls)
  with self.assertRaisesRegex(Refused,'MAINTENANCE_REPLAY'):self.run_cycle()
 def test_reconciled_success_restores_exact_proof_without_start(self):
  self.reconciled();before=copy.deepcopy(self.ops.state);r=self.run_cycle()
  self.assertEqual(r['status'],'COMPLETE');self.assertEqual(before,self.ops.state)
  self.assertEqual(r['priorStateSha256'],digest(encoded(before)));self.assertEqual(len(self.slots()),1)
  self.assertNotIn('unlock',self.ops.calls);self.assertNotIn('api',self.ops.calls)
 def test_reconciled_capture_failure_and_interrupt_preserve_proof(self):
  self.reconciled();before=copy.deepcopy(self.ops.state)
  self.ops.capture=lambda *a:(_ for _ in ()).throw(KeyboardInterrupt())
  r=self.run_cycle();self.assertEqual(r['status'],'BACKUP_FAILED_PREACTIVATION_SAFE')
  self.assertEqual(self.ops.state,before);self.assertTrue(r['credentialClosed']);self.assertEqual(len(self.slots()),1)
 def test_independent_recovery_idempotent_exact_prior(self):
  self.reconciled();r=self.run_cycle();prior=self.ops.load_state()
  r.update(status='IN_PROGRESS',backupVerified=False);atomic_json(self.root/'active.json',r)
  result=maintenance.Cycle(self.ops,self.root).recover()
  self.assertEqual(result['status'],'BACKUP_FAILED_PREACTIVATION_SAFE');self.assertEqual(self.ops.state,prior)
  calls=self.ops.calls.copy();maintenance.Cycle(self.ops,self.root).recover();self.assertEqual(calls,self.ops.calls)
 def test_tampered_prior_never_resumes(self):
  self.reconciled();r=self.run_cycle();r['status']='IN_PROGRESS'
  r['priorState']['recoveryProof']['runId']='0'*32
  # Attacker rehashing active.json is insufficient: prepared.json is immutable.
  r['priorStateSha256']=digest(encoded(r['priorState']))
  self.ops.state=copy.deepcopy(r['priorState']);atomic_json(self.root/'active.json',r)
  result=self.cycle.recover();self.assertEqual(result['status'],'INTERVENTION_REQUIRED')
  self.assertEqual(result['recoveryFailure'],'MAINTENANCE_PRIOR_INTEGRITY');self.assertNotIn('unlock',self.ops.calls)
 def test_recovery_deadline_or_mode_cannot_be_rewritten(self):
  self.reconciled();r=self.run_cycle();original=copy.deepcopy(r)
  for key,value in (('mode','timer'),('recoverUntil',maintenance.stamp(fixtures.NOW+99999))):
   r=copy.deepcopy(original);r.update(status='IN_PROGRESS');r[key]=value
   atomic_json(self.root/'active.json',r);self.ops.state=copy.deepcopy(r['priorState'])
   result=self.cycle.recover();self.assertEqual(result['status'],'INTERVENTION_REQUIRED')
   self.assertEqual(result['recoveryFailure'],'MAINTENANCE_PRIOR_INTEGRITY')
 def test_guard_write_failure_containment_and_alert_are_independent(self):
  self.reconciled();self.ops.save_state=lambda *_:(_ for _ in ()).throw(Refused('MAINTENANCE_GUARD_DIVERGED'))
  r=self.run_cycle();self.assertEqual(r['status'],'INTERVENTION_REQUIRED')
  self.assertTrue(r['statePublicationFailed']);self.assertTrue(self.ops.locked);self.assertFalse(self.ops.running)
  self.assertTrue((self.root/'ALERT.json').exists())
 def test_interrupted_reservation_residue_blocks_without_cleanup(self):
  p=self.root/'.write-interrupted-ledger';p.write_bytes(b'synthetic')
  with self.assertRaisesRegex(Refused,'MAINTENANCE_PERSISTENCE_RESIDUE'):self.run_cycle()
  self.assertEqual(self.slots(),[]);self.assertEqual(p.read_bytes(),b'synthetic');self.assertEqual(self.ops.calls,[])
 def test_recovery_residue_contains_but_never_resumes(self):
  self.reconciled();r=self.run_cycle();r['status']='IN_PROGRESS';atomic_json(self.root/'active.json',r)
  p=self.root/'.write-interrupted-journal';p.write_bytes(b'synthetic')
  r=self.cycle.recover();self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertNotIn('unlock',self.ops.calls)
  self.assertEqual(p.read_bytes(),b'synthetic')
 def test_preserves_used_slots_and_budget(self):
  path=self.root/('policy-'+self.p['policyId']+'.json');used={'policySha256':digest(encoded(self.p)),'slots':['historical-one','historical-two']}
  atomic_json(path,used);self.reconciled();self.run_cycle()
  self.assertEqual(self.slots()[:2],used['slots']);self.assertEqual(len(self.slots()),3)

class ProvenanceTests(unittest.TestCase):
 def setUp(self):
  self.h=reconciliation.ReconciliationTests();self.h.setUp();self.addCleanup(self.h.doCleanups)
  self.h.run_flow();self.layout=self.h.layout;self.state=self.layout.load()
  self.p=fixtures.policy();self.p.update(releaseId=self.h.a['releaseId'],descriptorSha256=self.h.a['descriptorSha256'])
  self.adapter=runtime.LinuxOperations.__new__(runtime.LinuxOperations)
  self.adapter.layout=self.layout;self.adapter.manifest=reconciliation.manifest()
  self.adapter.ops=reconciliation.ops
  self.history={p:p.read_bytes() for p in self.h.path.rglob('*') if p.is_file()}
 def validate(self,state=None,mode='supervised'):
  return self.adapter.validate_prior(self.p,state or self.state,mode)
 def test_real_v2_receipt_chain_accepted_history_preserved(self):
  self.validate();self.assertEqual(self.state,self.layout.load())
  self.assertEqual(self.history,{p:p.read_bytes() for p in self.history})
 def test_timer_cannot_use_reconciled_proof(self):
  with self.assertRaisesRegex(Refused,'RECONCILED_SUPERVISION_REQUIRED'):self.validate(mode='timer')
 def test_incomplete_unknown_or_idle_with_proof_refused(self):
  for status in ('idle','in-progress','intervention-required','unknown'):
   state=dict(self.state,status=status);self.layout.save(state)
   with self.subTest(status=status),self.assertRaises(Refused):self.validate(state)
 def test_missing_or_tampered_proof_refused(self):
  state=copy.deepcopy(self.state);state.pop('recoveryProof');self.layout.save(state)
  with self.assertRaises(Refused):self.validate(state)
 def test_failure_receipt_tampered_refused(self):
  p=self.h.path/'failure.json';p.write_bytes(p.read_bytes()+b' ')
  with self.assertRaises(Refused):self.validate()
 def test_applied_receipt_tampered_refused(self):
  p=self.h.folder/'applied.json';v=private_json(p);v['stateSha256']='0'*64;p.write_bytes(encoded(v))
  with self.assertRaises(Refused):self.validate()
 def test_wrong_policy_target_refused(self):
  self.p['descriptorSha256']='0'*64
  with self.assertRaisesRegex(Refused,'MAINTENANCE_RECONCILIATION_BINDING'):self.validate()
 def test_guard_divergence_is_not_repaired(self):
  before=(self.layout.state/'state.json').read_bytes();self.layout.guard.write_bytes(b'{}\n')
  with self.assertRaisesRegex(Refused,'GUARD_DIVERGED'):self.validate()
  with self.assertRaisesRegex(Refused,'GUARD_DIVERGED'):self.adapter.save_state(self.state)
  self.assertEqual(before,(self.layout.state/'state.json').read_bytes());self.assertEqual(self.layout.guard.read_bytes(),b'{}\n')
 def test_state_and_guard_residues_preserved(self):
  for parent in (self.layout.state,self.layout.guard.parent):
   p=parent/'.write-interrupted';p.write_bytes(b'synthetic')
   with self.assertRaisesRegex(Refused,'PERSISTENCE_RESIDUE'):self.validate()
   self.assertEqual(p.read_bytes(),b'synthetic');p.unlink() # owned fixture only
 def test_links_cannot_exist(self):
  link=self.layout.app/'current';link.symlink_to(self.layout.releases/self.p['releaseId'])
  with self.assertRaisesRegex(Refused,'UNEXPECTED_CURRENT'):self.validate()
 def test_recovered_activation_proof_remains_eligible(self):
  # Reuse the complete launch/claim/failure/recovery fixture, not invented receipts.
  self.h.test_full_reconciliation_then_authorized_activation_failure_and_next_attempt()
  self.validate(self.layout.load())
 def test_unlocked_account_or_unexpected_session_refuses_preflight(self):
  for phase in ('account','session'):
   account=mock.Mock();source=mock.Mock()
   if phase=='account':account.state.side_effect=Refused('RUNTIME_ACCOUNT_STATE')
   else:source.quiescent.side_effect=Refused('BACKUP_OTHER_SESSIONS')
   self.adapter.references=mock.Mock();self.adapter.credential=mock.Mock();self.adapter.accounts=account
   self.adapter.source=lambda:source;self.adapter.ledger=mock.Mock()
   self.adapter.ops=SimpleNamespace(service_state=mock.Mock(return_value={'ActiveState':'inactive','MainPID':'0'}))
   with self.subTest(phase=phase),self.assertRaises(Refused):self.adapter.inspect(self.p,'supervised')
   self.adapter.ledger.assert_not_called()
 def test_services_and_sessions_fail_before_reservation(self):
  self.adapter.references=mock.Mock();self.adapter.credential=mock.Mock()
  self.adapter.ops=SimpleNamespace(service_state=mock.Mock(return_value={'ActiveState':'active','MainPID':'3'}))
  with self.assertRaisesRegex(Refused,'MAINTENANCE_RUNTIME_STATE'):self.adapter.inspect(self.p,'supervised')
  self.adapter.credential.assert_not_called()

class ControllerReferenceTests(unittest.TestCase):
 def adapter(self):
  a=runtime.LinuxOperations.__new__(runtime.LinuxOperations);a.release=Path('/synthetic/controller')
  p=fixtures.policy();m={'sourceState':'committed','schema':{'migrations':[{}]*68},'files':{'backend/app.js':{'sha256':'a'*64}}}
  cm=copy.deepcopy(m);cm['reuse']={'releaseId':p['releaseId'],'descriptorSha256':p['descriptorSha256'],'unchangedApplicationSources':True,'unchangedDependencies':True}
  a.layout=SimpleNamespace(installed=mock.Mock(side_effect=[(Path('/synthetic/app'),None,m),(a.release,None,cm)]))
  a.ops=SimpleNamespace(command=mock.Mock(return_value=SimpleNamespace(stdout='Enforcing')))
  return a,p,m,cm
 def run_refs(self,a,p):
  raw=encoded({'age':'/synthetic/age','oci':'/synthetic/oci','ageSha256':'a'*64,'ociSha256':'a'*64});p['backupPolicy']['sha256']=digest(raw)
  def read(path,*_):return raw if str(path)==p['backupPolicy']['path'] else b'synthetic'
  p['configurationSha256']={n:digest(b'synthetic') for n in p['configurationSha256']}
  with mock.patch.object(runtime,'file_digest',side_effect=lambda path:p['runtimeManifestSha256'] if path.name=='manifest.json' else 'a'*64),mock.patch.object(runtime,'secure_read',side_effect=read),mock.patch.object(runtime,'trusted_path'),mock.patch.object(runtime,'validate_backup_policy'):
   a.references(p)
 def test_verified_repack_keeps_policy_bound_to_application(self):
  a,p,m,cm=self.adapter();self.run_refs(a,p);self.assertEqual(a.application,Path('/synthetic/app'));self.assertEqual(a.manifest,m)
 def test_wrong_reuse_origin_refused(self):
  a,p,m,cm=self.adapter();cm['reuse']['descriptorSha256']='0'*64
  with self.assertRaisesRegex(Refused,'CONTROLLER_PROVENANCE'):self.run_refs(a,p)
 def test_schema_mismatch_refused(self):
  a,p,m,cm=self.adapter();cm['schema']={}
  with self.assertRaisesRegex(Refused,'CONTROLLER_IDENTITY'):self.run_refs(a,p)
 def test_application_or_dependencies_changed_refused(self):
  a,p,m,cm=self.adapter();cm['files']['backend/app.js']['sha256']='0'*64
  with self.assertRaisesRegex(Refused,'CONTROLLER_APPLICATION'):self.run_refs(a,p)
 def test_candidate_controller_refused(self):
  a,p,m,cm=self.adapter();cm['sourceState']='candidate'
  with self.assertRaisesRegex(Refused,'CONTROLLER_IDENTITY'):self.run_refs(a,p)
 def test_unowned_emergency_is_noop(self):
  a,p,_,_=self.adapter();a.load_state=lambda:{'status':'in-progress','operation':'backup-maintenance','runId':'9'*32}
  a.stop=mock.Mock();a.save_state=mock.Mock();a.emergency('SYNTHETIC',None);a.emergency('SYNTHETIC','8'*32)
  a.stop.assert_not_called();a.save_state.assert_not_called()

if __name__=='__main__':unittest.main()
