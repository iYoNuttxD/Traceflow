import copy,datetime as dt,hashlib,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from contract import canonical,promote
from migrations import additions,chain,transition
from test_contract import Lab

class TransitionTests(unittest.TestCase):
 def setUp(self):
  self.old={'schemaSha256':'a'*64,'migrations':[{'name':'20261014_old','sha256':'1'*64}]}
  self.new={'schemaSha256':'b'*64,'migrations':[{'name':'20261007_new','sha256':'2'*64},*self.old['migrations']]}
  now=dt.datetime.now(dt.timezone.utc)
  self.backup={'status':'SUCCESS','externalReadback':True,'id':'snapshot','cipherSha256':'c'*64,'manifestSha256':'d'*64,'finishedAt':now.isoformat()}
  binding={k:self.backup[k] for k in ('id','cipherSha256','manifestSha256')}
  self.restore={**binding,'status':'ISOLATED_RESTORE_PASS','productionDestination':False,**{k:True for k in ('allTableDataHashesEqual','allStructuresEqual','persistentFileHashesEqual','configurationHashesEqual','cleanup')}}
  self.plan={'formatVersion':1,'operation':'migrate-and-promote-clean','appSha':'f'*40,'from':self.old,'to':self.new,'added':additions(self.old,self.new),'upgradeEvidenceSha256':'e'*64,'previousAppCompatibleWithTarget':True,'externalWritersExcluded':True,'backup':binding,'issuedAt':(now-dt.timedelta(seconds=5)).isoformat(),'expiresAt':(now+dt.timedelta(hours=1)).isoformat()}
 def validate(self,expected=None):
  digest=hashlib.sha256(canonical(self.plan)).hexdigest()
  return transition(self.plan,self.old,self.new,'f'*40,expected or digest,self.backup,self.restore)
 def test_backdated_unapplied_migration_is_an_exact_addition(self):
  self.assertEqual(self.validate(),[self.new['migrations'][0]])
 def test_applied_migration_missing_changed_or_duplicated_refused(self):
  for rows in [self.new['migrations'][:1],[{'name':'20261014_old','sha256':'3'*64}],self.old['migrations']*2]:
   with self.subTest(rows=rows),self.assertRaises(ValueError):additions(self.old,{'migrations':rows})
 def test_digest_expired_identity_or_claimed_additions_refused(self):
  with self.assertRaisesRegex(ValueError,'DIGEST'):self.validate('0'*64)
  for key,value in [('expiresAt','2020-01-01T00:00:00+00:00'),('appSha','0'*40),('added',[]),('previousAppCompatibleWithTarget',False)]:
   original=copy.deepcopy(self.plan);self.plan[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):self.validate()
   self.plan=original
 def test_backup_restore_cannot_be_swapped_or_simulated(self):
  for key,value in [('id','another'),('cipherSha256','1'*64),('manifestSha256','2'*64),('cleanup',False),('allStructuresEqual',False),('productionDestination',True)]:
   original=self.restore.copy();self.restore[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):self.validate()
   self.restore=original
 def test_unfinished_or_stale_backup_refused(self):
  for key,value in [('status','STARTED'),('externalReadback',False),('finishedAt','2020-01-01T00:00:00+00:00')]:
   original=self.backup.copy();self.backup[key]=value
   with self.subTest(key=key),self.assertRaises(ValueError):self.validate()
   self.backup=original

class MigrationLab(Lab):
 def __init__(self,fail=None):
  super().__init__(fail);self.schema='previous';self.migration_quiesced=False
 def apply_migrations(self):
  self.migration_quiesced=True;self.application='stopped';self.step('quiesce')
  self.schema='partial';self.step('ddl')
  self.schema='target';self.step('ddl_complete')
 def restore_previous(self):
  if self.schema=='partial':raise ValueError('MIGRATION_INCOMPLETE_OPERATOR_REQUIRED')
  return super().restore_previous()

class MigrationRecoveryTests(unittest.TestCase):
 def test_failure_before_ddl_restores_previous_without_schema_rollback(self):
  lab=MigrationLab('quiesce')
  try:
   with self.assertRaises(ValueError):promote(lab)
   self.assertEqual((lab.schema,lab.application),('previous','previous'));self.assertIn('previous_ready',lab.events)
  finally:lab.close()
 def test_partial_ddl_requires_intervention_without_automatic_retry(self):
  lab=MigrationLab('ddl')
  try:
   with self.assertRaisesRegex(ValueError,'OPERATOR_REQUIRED'):promote(lab)
   self.assertEqual((lab.schema,lab.application),('partial','stopped'));self.assertNotIn('rollback',lab.events);self.assertIn('recovery_incomplete',lab.events)
  finally:lab.close()
 def test_target_schema_remains_when_compatible_previous_binary_is_restored(self):
  lab=MigrationLab('startup')
  try:
   with self.assertRaises(ValueError):promote(lab)
   self.assertEqual((lab.schema,lab.application),('target','previous'));self.assertIn('previous_ready',lab.events)
  finally:lab.close()
 def test_success_applies_once_before_candidate(self):
  lab=MigrationLab()
  try:
   promote(lab);self.assertEqual(lab.events.count('ddl'),1);self.assertLess(lab.events.index('ddl_complete'),lab.events.index('startup'));self.assertEqual(lab.schema,'target')
  finally:lab.close()

import json,tempfile,types
from unittest.mock import patch
import receiver
class InstalledMigrationPhaseTests(unittest.TestCase):
 def host(self,folder):
  host=receiver.Host.__new__(receiver.Host);host.plan={'from':{'migrations':[{'name':'20260101_old','sha256':'a'*64}]},'to':{'migrations':[{'name':'20260101_old','sha256':'a'*64},{'name':'20260102_new','sha256':'b'*64}]},'added':[{'name':'20260102_new','sha256':'b'*64}]}
  host.transition_digest='c'*64;host.request={'runId':'123'};host.cfg={};host.restarted_units=set();host.ops=object();host.root=Path(folder)/'candidate';host.work=Path(folder);host.schema_started=False;host.schema_complete=False;host.migration_quiesced=False;host.schema_guard_claimed=False;host.retention_target_ready=False;host.changed_units=set();host.units={'retention':Path(folder)/'retention.conf'}
  return host
 def test_actual_adapter_reserves_once_then_quiesces_and_checks_exact_result(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'applied_chain',side_effect=[['20260101_old\t'+'a'*64],['20260102_new\t'+'b'*64,'20260101_old\t'+'a'*64]]),patch.object(receiver,'data_fingerprint',return_value={'tables':{'x':{'rows':1,'dataSha256':'a'*64}},'ledger':{'20260101_old':'b'*64}}),patch.object(receiver,'run') as run:
   run.side_effect=[b'inactive',b'',b'',b'{"status":"PRISMA_DEPLOY_PASS"}',b'',b'']
   host=self.host(d);host.apply_migrations()
   self.assertTrue(host.schema_complete);self.assertEqual(host.restarted_units,{'api','worker'});self.assertEqual(run.call_count,6)
   self.assertEqual(run.call_args_list[1].args[0],['systemctl','stop','traceflow-live-worker'])
   self.assertIn('LoadCredentialEncrypted=mysql-migrator:/etc/credstore.encrypted/traceflow-live-mysql-migrator',run.call_args_list[3].args[0]);self.assertEqual(json.loads((Path(d)/('migration-'+'c'*64+'.json')).read_text())['status'],'SCHEMA_TRANSITION_COMPLETE')
   with self.assertRaises(FileExistsError):host.apply_migrations()
   self.assertEqual(run.call_count,6)
 def test_partial_actual_adapter_records_failure_and_refuses_binary_restart(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'applied_chain',return_value=['20260101_old\t'+'a'*64]),patch.object(receiver,'data_fingerprint',return_value={'tables':{},'ledger':{}}),patch.object(receiver,'run',side_effect=[b'inactive',b'',b'',InterruptedError('INTERRUPTED'),b'']):
   host=self.host(d)
   with self.assertRaises(InterruptedError):host.apply_migrations()
   self.assertTrue(host.schema_started);self.assertFalse(host.schema_complete)
   self.assertEqual(host.migration_result['containment'],'unit-stop-confirmed')
   self.assertTrue((Path(d)/'schema-transition-in-progress').exists())
   self.assertEqual(json.loads((Path(d)/'migration.json').read_text())['status'],'SCHEMA_TRANSITION_INCOMPLETE')
   with self.assertRaisesRegex(ValueError,'OPERATOR_REQUIRED'):host.restore_previous()
 def test_unfinished_rolled_back_or_malformed_history_cannot_be_hidden(self):
  for row in ['n\t'+'a'*64+'\t0\t0','n\t'+'a'*64+'\t1\t1','n\t'+'a'*64]:
   ops=types.SimpleNamespace(sql=lambda _: [row])
   with self.assertRaisesRegex(ValueError,'INCOMPLETE'):receiver.applied_chain(ops)

class MigrationSandboxTests(unittest.TestCase):
 def test_child_is_bound_to_parent_and_preserves_security_restrictions(self):
  command=receiver.migration_unit(Path('/opt/traceflow-live/releases/synthetic'),'123')
  for prop in ['BindsTo=traceflow-live-cd.service','PartOf=traceflow-live-cd.service','ProtectSystem=strict','ProtectKernelTunables=yes','ProtectKernelModules=yes','ProtectKernelLogs=yes','ProtectControlGroups=yes','RestrictSUIDSGID=yes','RestrictRealtime=yes','LockPersonality=yes','RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6','KillMode=control-group','LimitCORE=0','MemorySwapMax=0']:
   self.assertIn(prop,command)
  inaccessible=next(p.split('=',1)[1].split() for p in command if str(p).startswith('InaccessiblePaths='))
  self.assertIn('/etc/traceflow-live',inaccessible);self.assertIn('/etc/credstore.encrypted',inaccessible)
 def test_request_id_cannot_inject_another_unit(self):
  with self.assertRaises(ValueError):receiver.migration_unit(Path('/synthetic'),'../../another')

class WriterCoordinationTests(unittest.TestCase):
 def test_active_retention_is_refused_before_any_runtime_stop(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'run',return_value=b'active') as run:
   host=InstalledMigrationPhaseTests().host(d)
   with self.assertRaisesRegex(ValueError,'RETENTION_OPERATION_ACTIVE'):host.apply_migrations()
   self.assertFalse(host.schema_started);self.assertEqual(run.call_count,1)
   host.release_schema_guard();self.assertFalse((Path(d)/'schema-transition-in-progress').exists())
 def test_guard_cannot_be_removed_by_another_run(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)):
   host=InstalledMigrationPhaseTests().host(d);host.schema_guard_claimed=True
   (Path(d)/'schema-transition-in-progress').write_text('{"runId":"another"}')
   with self.assertRaisesRegex(ValueError,'OWNERSHIP'):host.release_schema_guard()
   self.assertTrue((Path(d)/'schema-transition-in-progress').exists())
 def test_retention_selector_changes_only_working_directory(self):
  with tempfile.TemporaryDirectory() as d:
   host=InstalledMigrationPhaseTests().host(d);value=host.unit('retention')
   self.assertIn('WorkingDirectory=',value);self.assertNotIn('ExecStart=',value)

class DataPreservationTests(unittest.TestCase):
 def test_changed_old_data_or_migration_metadata_prevents_application_start(self):
  before={'tables':{'x':{'rows':1,'dataSha256':'a'*64}},'ledger':{'old':'b'*64}}
  for after,code in [({'tables':{'x':{'rows':2,'dataSha256':'c'*64}},'ledger':before['ledger']},'PREEXISTING_DATA_CHANGED'),({'tables':before['tables'],'ledger':{'old':'c'*64}},'HISTORICAL_MIGRATION_RECORD_CHANGED')]:
   with self.subTest(code=code),tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'applied_chain',side_effect=[['20260101_old\t'+'a'*64],['20260101_old\t'+'a'*64,'20260102_new\t'+'b'*64]]),patch.object(receiver,'data_fingerprint',side_effect=[before,after]),patch.object(receiver,'run',side_effect=[b'inactive',b'',b'',b'{"status":"PRISMA_DEPLOY_PASS"}',b'']):
    host=InstalledMigrationPhaseTests().host(d)
    with self.assertRaisesRegex(ValueError,code):host.apply_migrations()
    self.assertFalse(host.schema_complete);self.assertTrue((Path(d)/'schema-transition-in-progress').exists())
    with self.assertRaisesRegex(ValueError,'OPERATOR_REQUIRED'):host.restore_previous()
 def test_completed_schema_keeps_new_retention_contract_on_binary_rollback(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'run'):
   host=InstalledMigrationPhaseTests().host(d);host.schema_started=True;host.schema_complete=True
   host.recovery={};host.state_attempted=False;host.routing_changed=False;host.reload_attempted=False
   host.old={str(host.units['retention']):b'old'};host.changed_units={'retention'};host.restarted_units=set()
   host.units['retention'].write_bytes(b'new-schema-contract')
   self.assertFalse(host.restore_previous());self.assertEqual(host.units['retention'].read_bytes(),b'new-schema-contract')
