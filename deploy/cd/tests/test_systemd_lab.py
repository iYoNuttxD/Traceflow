import hashlib,importlib.util,inspect,json,os,subprocess,sys,tempfile,unittest
from unittest.mock import patch
from pathlib import Path
spec=importlib.util.spec_from_file_location('synthetic_lab',Path(__file__).with_name('systemd_migrator_lab.py'));lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
class SyntheticChildTests(unittest.TestCase):
 def invoke(self,mode):
  with tempfile.TemporaryDirectory() as d:
   value=b'TRACEFLOW_SYNTHETIC_CREDENTIAL_V1';(Path(d)/'mysql-migrator').write_bytes(value)
   return subprocess.run([sys.executable,'-I','-B','-',mode,hashlib.sha256(value).hexdigest()],input=lab.CHILD.encode(),capture_output=True,timeout=5,env={**os.environ,'CREDENTIALS_DIRECTORY':d})
 def test_real_child_reads_synthetic_credential_and_completes_without_database(self):
  p=self.invoke('success');self.assertEqual(p.returncode,0);v=json.loads(p.stdout);self.assertTrue(v['synthetic']);self.assertFalse(v['databaseAccess']);self.assertEqual(v['status'],'MIGRATOR_PREFLIGHT_PASS')
 def test_real_child_blocked_code_and_nonzero_exit_are_captured(self):
  p=self.invoke('blocked');self.assertEqual(p.returncode,1);self.assertEqual(json.loads(p.stdout)['code'],'MIGRATOR_TLS_CONNECTION');self.assertEqual(p.stderr,b'')
 def test_lab_filter_and_parent_script_compile_without_raw_credential_or_url(self):
  value=lab.filtered(b'mysql://private password=private TRACEFLOW_SYNTHETIC_CREDENTIAL_V1')
  self.assertNotIn('mysql://',value);self.assertNotIn('private',value);self.assertNotIn('TRACEFLOW_SYNTHETIC_CREDENTIAL_V1',value)
  compile('import re\n'+inspect.getsource(lab.filtered)+'\n'+lab.PARENT,'synthetic-parent','exec');compile(lab.CHILD,'synthetic-child','exec')

 def test_native_lab_refuses_nonroot_or_other_modes_before_any_command(self):
  for argv,uid in [(['lab','--run-synthetic'],1000),(['lab','--migrate-deploy'],0),(['lab'],0)]:
   with patch.object(lab.sys,'argv',argv),patch.object(lab.os,'geteuid',return_value=uid),patch.object(lab,'call') as run:
    with self.assertRaisesRegex(ValueError,'EXPLICIT_ROOT_SYNTHETIC_ONLY'):lab.main()
   run.assert_not_called()
