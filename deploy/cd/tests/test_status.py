import contextlib,io,json,os,subprocess,sys,tempfile,textwrap,types,unittest
from pathlib import Path
from unittest.mock import patch
class ActualWorkflowStatusTests(unittest.TestCase):
 def script(self):
  workflow=Path(__file__).resolve().parents[3]/'.github/workflows/oci-cd.yml'
  section=workflow.read_text().split('      - name: Await authenticated OCI promotion result and automatic smoke tests\n',1)[1]
  return textwrap.dedent(section.split("          python3 - <<'PY'\n",1)[1].split('\n          PY\n',1)[0])
 def execute(self,probe,clock):
  prior=Path.cwd();output=io.StringIO();result=None
  with tempfile.TemporaryDirectory() as folder:
   try:
    os.chdir(folder)
    with patch.dict(os.environ,{'GITHUB_RUN_ID':'123'},clear=True),patch('subprocess.run',side_effect=probe) as calls,patch('time.monotonic',side_effect=clock),patch('time.sleep'),contextlib.redirect_stdout(output):
     with self.assertRaises(SystemExit) as error:exec(compile(self.script(),'synthetic-status-test','exec'),{})
    if Path('deployment-result.json').exists():result=json.loads(Path('deployment-result.json').read_text())
    return str(error.exception),calls.call_count,result,output.getvalue()
   finally:os.chdir(prior)
 def failed_receipt(self,args,**kwargs):
  self.assertIn('curl',args[0]);self.assertIn('--proto',args);self.assertIn('=https',args);self.assertNotIn('--insecure',args);self.assertEqual(kwargs['timeout'],20)
  Path('status-response.json').write_text(json.dumps({'runId':'123','status':'FAILED','code':'DEPLOYMENT_DURATION'}))
  return types.SimpleNamespace(returncode=0,stdout='200',stderr='')
 def test_failed_receipt_is_saved_and_stops_immediately_without_retry(self):
  code,count,result,output=self.execute(self.failed_receipt,[0,1])
  self.assertEqual(code,'OCI_DEPLOY_FAILED_NO_RETRY');self.assertEqual(count,1);self.assertEqual(result['code'],'DEPLOYMENT_DURATION')
 def test_http_refusal_is_diagnosed_without_logging_response_body(self):
  def probe(args,**kwargs):return types.SimpleNamespace(returncode=0,stdout='403',stderr='synthetic-not-for-logs')
  code,count,result,output=self.execute(probe,[0,1,901])
  self.assertEqual(code,'RESULT_TIMEOUT_INSPECT_OCI_DO_NOT_RETRY');self.assertEqual(count,1);self.assertIsNone(result);self.assertIn('403',output);self.assertNotIn('synthetic-not-for-logs',output)
 def test_transport_timeout_remains_bounded_and_sanitized(self):
  def probe(args,**kwargs):raise subprocess.TimeoutExpired('synthetic-not-for-logs',20,output='synthetic-private-body')
  code,count,result,output=self.execute(probe,[0,1,901])
  self.assertEqual(code,'RESULT_TIMEOUT_INSPECT_OCI_DO_NOT_RETRY');self.assertEqual(count,1);self.assertIsNone(result);self.assertNotIn('synthetic-private-body',output);self.assertNotIn('synthetic-not-for-logs',output)
