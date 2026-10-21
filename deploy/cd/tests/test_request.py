import datetime as dt,hashlib,json,os,sys,tempfile,textwrap,types,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver
class ActualWorkflowRequestTests(unittest.TestCase):
 def test_actual_generator_uses_one_utc_instant_and_satisfies_receiver_duration_gate(self):
  workflow=Path(__file__).resolve().parents[3]/'.github/workflows/oci-cd.yml'
  text=workflow.read_text();start='          import datetime as d,hashlib,json,os\n'
  self.assertEqual(text.count(start),1)
  script=textwrap.dedent(start+text.split(start,1)[1].split('\n          PY\n',1)[0])
  base=dt.datetime.now(dt.timezone.utc)
  class Clock(dt.datetime):
   calls=0
   @classmethod
   def now(cls,tz=None):
    value=base+dt.timedelta(seconds=cls.calls);cls.calls+=1;return value
  fake=types.ModuleType('datetime');fake.datetime=Clock;fake.timezone=dt.timezone;fake.timedelta=dt.timedelta
  env={'APP_SHA':'a'*40,'WORKFLOW_SHA':'b'*40,'GITHUB_REPOSITORY':'synthetic/test-only','GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'1'}
  with tempfile.TemporaryDirectory() as folder:
   prior=Path.cwd()
   try:
    os.chdir(folder);root=Path('candidate');root.mkdir();payload=b'synthetic-non-production'
    (root/'release.tar.gz').write_bytes(payload);(root/'identity.json').write_text(json.dumps({'commit':env['APP_SHA'],'packageSha256':hashlib.sha256(payload).hexdigest(),'manifestSha256':'c'*64}))
    with patch.dict(sys.modules,{'datetime':fake}),patch.dict(os.environ,env,clear=True):exec(compile(script,str(workflow),'exec'),{})
    request=json.loads((root/'request.json').read_bytes())
   finally:os.chdir(prior)
  self.assertEqual(Clock.calls,1)
  self.assertEqual((dt.datetime.fromisoformat(request['expiresAt'])-dt.datetime.fromisoformat(request['issuedAt'])).total_seconds(),1200)
  active={'status':'in_progress','event':'workflow_dispatch','head_sha':env['WORKFLOW_SHA'],'path':receiver.WORKFLOW}
  with patch.object(receiver,'fetch',return_value=active):receiver.valid_window(request,{'installedAt':(base-dt.timedelta(hours=1)).isoformat()})
