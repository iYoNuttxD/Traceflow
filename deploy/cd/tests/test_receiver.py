import datetime as dt,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver
class RequestWindowTests(unittest.TestCase):
 def example(self):
  now=dt.datetime.now(dt.timezone.utc)
  return {'installedAt':(now-dt.timedelta(hours=1)).isoformat()},{'issuedAt':(now-dt.timedelta(seconds=5)).isoformat(),'expiresAt':(now+dt.timedelta(minutes=19)).isoformat(),'runId':'123','workflowSha':'a'*40},{'status':'in_progress','event':'workflow_dispatch','head_sha':'a'*40,'path':receiver.WORKFLOW}
 def test_current_approved_workflow_and_bounded_authorization(self):
  cfg,req,run=self.example()
  with patch.object(receiver,'fetch',return_value=run):receiver.valid_window(req,cfg)
 def test_expired_preinstallation_unbounded_or_naive_refused(self):
  for field,value in [('expiresAt',(dt.datetime.now(dt.timezone.utc)-dt.timedelta(seconds=1)).isoformat()),('issuedAt',(dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=1)).isoformat()),('expiresAt',(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=1)).isoformat()),('issuedAt',dt.datetime.now().isoformat())]:
   cfg,req,run=self.example();req[field]=value
   with patch.object(receiver,'fetch',return_value=run),self.assertRaises(ValueError):receiver.valid_window(req,cfg)
 def test_wrong_run_revision_origin_path_or_completed_run_refused(self):
  for field,value in [('head_sha','b'*40),('status','completed'),('event','push'),('path','.github/workflows/other.yml')]:
   cfg,req,run=self.example();run[field]=value
   with patch.object(receiver,'fetch',return_value=run),self.assertRaisesRegex(ValueError,'WORKFLOW_NOT_ACTIVE'):receiver.valid_window(req,cfg)

class MigrationChainTests(unittest.TestCase):
 def setUp(self):
  # The two real names/checksums whose MySQL utf8mb4_unicode_ci order differs.
  self.migrations=[{'name': '20260910120000_s109_requirement_traceability', 'sha256': 'f423de1be966e25d3c45d2c25490ae72d6d6cb92716d77a11073cc2e955e2bae'}, {'name': '20260910120000_s1_06_preserve_legacy_effort', 'sha256': 'bdddb1ebab0fc17de995207b37cd47a07b5a495d6ea7dfbb615ad9127caf70f1'}]
  self.rows=[x['name']+'\t'+x['sha256'] for x in self.migrations]
 def test_equivalent_applied_chain_in_different_order_passes(self):
  receiver.validate_migration_chain(list(reversed(self.rows)),self.migrations)
 def test_missing_migration_refused(self):
  with self.assertRaisesRegex(ValueError,'LIVE_MIGRATION_CHAIN'):
   receiver.validate_migration_chain(self.rows[:-1],self.migrations)
 def test_additional_migration_refused(self):
  with self.assertRaisesRegex(ValueError,'LIVE_MIGRATION_CHAIN'):
   receiver.validate_migration_chain(self.rows+['20990101000000_extra\t'+'a'*64],self.migrations)
 def test_changed_checksum_refused(self):
  with self.assertRaisesRegex(ValueError,'LIVE_MIGRATION_CHAIN'):
   receiver.validate_migration_chain([self.migrations[0]['name']+'\t'+'f'*64,self.rows[1]],self.migrations)
 def test_duplicates_in_observation_manifest_or_both_refused(self):
  for rows,migrations in [([self.rows[0]]*2,self.migrations),(self.rows,[self.migrations[0]]*2),([self.rows[0]]*2,[self.migrations[0]]*2)]:
   with self.subTest(rows=rows,migrations=migrations),self.assertRaisesRegex(ValueError,'LIVE_MIGRATION_CHAIN'):
    receiver.validate_migration_chain(rows,migrations)
