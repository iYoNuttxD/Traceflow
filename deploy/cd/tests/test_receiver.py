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
