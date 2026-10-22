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
  self.plan={'formatVersion':1,'operation':'migrate-and-promote-clean','appSha':'f'*40,'from':self.old,'to':self.new,'added':additions(self.old,self.new),'upgradeEvidenceSha256':'e'*64,'previousAppCompatibleWithTarget':True,'backup':binding,'issuedAt':(now-dt.timedelta(seconds=5)).isoformat(),'expiresAt':(now+dt.timedelta(hours=1)).isoformat()}
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
  host.transition_digest='c'*64;host.request={'runId':'123'};host.cfg={};host.restarted_units=set();host.ops=object();host.root=Path(folder)/'candidate';host.work=Path(folder);host.schema_started=False;host.schema_complete=False;host.migration_quiesced=False
  return host
 def test_actual_adapter_reserves_once_then_quiesces_and_checks_exact_result(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'applied_chain',side_effect=[['20260101_old\t'+'a'*64],['20260102_new\t'+'b'*64,'20260101_old\t'+'a'*64]]),patch.object(receiver,'run') as run:
   run.return_value=b'{"status":"PRISMA_DEPLOY_PASS"}'
   host=self.host(d);host.apply_migrations()
   self.assertTrue(host.schema_complete);self.assertEqual(host.restarted_units,{'api','worker'});self.assertEqual(run.call_count,3)
   self.assertEqual(run.call_args_list[0].args[0],['systemctl','stop','traceflow-live-worker'])
   self.assertIn('LoadCredentialEncrypted=mysql-migrator:/etc/credstore.encrypted/traceflow-live-mysql-migrator',run.call_args_list[2].args[0]);self.assertEqual(json.loads((Path(d)/('migration-'+'c'*64+'.json')).read_text())['status'],'SCHEMA_TRANSITION_COMPLETE')
   with self.assertRaises(FileExistsError):host.apply_migrations()
   self.assertEqual(run.call_count,3)
 def test_partial_actual_adapter_records_failure_and_refuses_binary_restart(self):
  with tempfile.TemporaryDirectory() as d,patch.object(receiver,'STATE',Path(d)),patch.object(receiver,'valid_window'),patch.object(receiver,'applied_chain',return_value=['20260101_old\t'+'a'*64]),patch.object(receiver,'run',side_effect=[b'',b'',InterruptedError('INTERRUPTED')]):
   host=self.host(d)
   with self.assertRaises(InterruptedError):host.apply_migrations()
   self.assertTrue(host.schema_started);self.assertFalse(host.schema_complete)
   self.assertEqual(json.loads((Path(d)/'migration.json').read_text())['status'],'SCHEMA_TRANSITION_INCOMPLETE')
   with self.assertRaisesRegex(ValueError,'OPERATOR_REQUIRED'):host.restore_previous()
 def test_unfinished_rolled_back_or_malformed_history_cannot_be_hidden(self):
  for row in ['n\t'+'a'*64+'\t0\t0','n\t'+'a'*64+'\t1\t1','n\t'+'a'*64]:
   ops=types.SimpleNamespace(sql=lambda _: [row])
   with self.assertRaisesRegex(ValueError,'INCOMPLETE'):receiver.applied_chain(ops)
