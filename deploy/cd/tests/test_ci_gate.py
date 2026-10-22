import sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import ci_gate
class SourceCiTests(unittest.TestCase):
 def run_data(self,status='completed',conclusion='success'):
  return {'id':42,'head_sha':'b'*40,'path':'.github/workflows/ci.yml','event':'push','status':status,'conclusion':conclusion}
 def test_success_binds_checks_to_exact_run_and_github_app(self):
  checks=[{'name':n,'id':i,'app':{'slug':'github-actions'},'details_url':'https://github.com/iYoNuttxD/Traceflow/actions/runs/42/job/1','conclusion':'success'} for i,n in enumerate(['Quality','Backend Tests','Frontend Tests','Supply Chain'])]
  with patch.object(ci_gate,'api',side_effect=[{'workflow_runs':[self.run_data()]},{'check_runs':checks}]):self.assertEqual(ci_gate.source_ci('b'*40,timeout=0),42)
  checks[0]['details_url']='https://github.com/other/actions/runs/99/job/1'
  with patch.object(ci_gate,'api',side_effect=[{'workflow_runs':[self.run_data()]},{'check_runs':checks}]),self.assertRaisesRegex(ValueError,'EXACT_SHA_CI_REQUIRED'):ci_gate.source_ci('b'*40,timeout=0)
 def test_pull_request_ci_binds_the_same_exact_source_and_all_checks(self):
  checks=[{'name':n,'id':i,'app':{'slug':'github-actions'},'details_url':'https://github.com/iYoNuttxD/Traceflow/actions/runs/42/job/1','conclusion':'success'} for i,n in enumerate(['Quality','Backend Tests','Frontend Tests','Supply Chain'])]
  with patch.object(ci_gate,'api',side_effect=[{'workflow_runs':[{**self.run_data(),'event':'pull_request'}]},{'check_runs':checks}]):self.assertEqual(ci_gate.source_ci('b'*40,timeout=0),42)
 def test_failed_ci_is_not_retried_or_converted_to_success(self):
  with patch.object(ci_gate,'api',return_value={'workflow_runs':[self.run_data(conclusion='failure')]}),patch.object(ci_gate.time,'sleep') as sleep,self.assertRaisesRegex(ValueError,'NOT_SUCCESSFUL'):ci_gate.source_ci('b'*40,timeout=0)
  sleep.assert_not_called()
 def test_incomplete_or_wrong_revision_run_refused_at_deadline(self):
  for run in [self.run_data(status='in_progress',conclusion=None),{**self.run_data(),'head_sha':'c'*40},{**self.run_data(),'event':'workflow_dispatch'}]:
   with patch.object(ci_gate,'api',return_value={'workflow_runs':[run]}),self.assertRaisesRegex(ValueError,'COMMIT_CI_REQUIRED'):ci_gate.source_ci('b'*40,timeout=0)
