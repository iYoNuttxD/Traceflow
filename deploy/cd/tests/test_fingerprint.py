"""Exercise the real streaming parser with synthetic input; Linux memfd is also proven on OCI."""
import importlib.util,json,os,subprocess,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver
spec=importlib.util.spec_from_file_location('ops_parser',Path(__file__).resolve().parents[2]/'operations/live_operations.py')
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
DUMP=b'CREATE TABLE `Synthetic` (\n  `id` int NOT NULL\n);\nINSERT INTO `Synthetic` (`id`) VALUES (1);\n'
class FingerprintTests(unittest.TestCase):
 def test_anonymous_capture_parses_all_rows_and_never_returns_business_values(self):
  with tempfile.TemporaryFile() as backing:
   def memfd(*_):return os.dup(backing.fileno())
   def process(args,**kwargs):
    self.assertEqual(kwargs['stdin'],subprocess.DEVNULL);self.assertIsNotNone(kwargs['preexec_fn'])
    self.assertNotIn('DATABASE_URL',kwargs['env']);kwargs['stdout'].write(DUMP)
    return types.SimpleNamespace(returncode=0)
   def parse(path):
    self.assertTrue(str(path).startswith('/proc/self/fd/'))
    return ops.dump_manifest(Path('/dev/fd/'+path.name))
   module=types.SimpleNamespace(mysql_args=lambda _:['synthetic-client'],DUMP_FLAGS=['--quick'],SCHEMA='synthetic',dump_manifest=parse,sql=lambda _:['old\t'+'a'*64])
   with patch.object(receiver.os,'memfd_create',side_effect=memfd,create=True),patch.object(receiver.os,'MFD_CLOEXEC',getattr(os,'MFD_CLOEXEC',1),create=True),patch.object(receiver.subprocess,'run',side_effect=process):
    value=receiver.data_fingerprint(module)
   self.assertEqual(value['tables']['Synthetic']['rows'],1);self.assertEqual(value['ledger'],{'old':'a'*64})
   self.assertEqual(set(value['tables']['Synthetic']),{'rows','dataSha256'});self.assertNotIn('INSERT',json.dumps(value))
 def test_capture_failure_is_terminal_and_no_sql_observation_follows(self):
  with tempfile.TemporaryFile() as backing,patch.object(receiver.os,'memfd_create',side_effect=lambda *_:os.dup(backing.fileno()),create=True),patch.object(receiver.os,'MFD_CLOEXEC',1,create=True),patch.object(receiver.subprocess,'run',return_value=types.SimpleNamespace(returncode=1)):
   module=types.SimpleNamespace(mysql_args=lambda _:['synthetic'],DUMP_FLAGS=[],SCHEMA='synthetic',sql=lambda _:self.fail('SQL must not follow failed capture'))
   with self.assertRaisesRegex(ValueError,'CAPTURE_FAILED'):receiver.data_fingerprint(module)
