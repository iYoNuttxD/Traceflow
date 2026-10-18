"""Synthetic secret-bundle and credential boundary tests; never calls OCI."""
import base64,copy,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
import backup_secrets as s
from release_contract import Refused
from operational_io import encoded
REF={'provider':'oci-secret-api-key','secretId':'ocid1.vaultsecret.oc1.sa-saopaulo-1.'+'a'*60,'versionNumber':1,
 'identity':{'userId':'ocid1.user.oc1..'+'b'*60,'tenancyId':'ocid1.tenancy.oc1..'+'c'*60,'fingerprint':':'.join(['ab']*16)}}
SYNTHETIC='synthetic-password\\with"quotes'
def bundle(value=None):
 value=value or {'formatVersion':1,'user':'traceflow_admin','password':SYNTHETIC}
 return {'secretId':REF['secretId'],'version':1,'contentType':'BASE64','content':base64.b64encode(encoded(value)).decode()}
class SecretsTests(unittest.TestCase):
 def test_valid_escaped_cnf(self):
  self.assertEqual(s.decode_bundle(encoded(bundle()),REF),b'[client]\nuser=traceflow_admin\npassword="synthetic-password\\\\with\\"quotes"\n')
 def test_no_instance_principal_fallback(self):
  r=copy.deepcopy(REF);r['provider']='oci-secret'
  with self.assertRaises(Refused):s.validate_reference(r)
 def test_reference_fields_and_identity(self):
  for field in REF:
   r=copy.deepcopy(REF);del r[field]
   with self.subTest(field=field),self.assertRaises(Refused):s.validate_reference(r)
  for field,value in [('userId','ocid1.user.oc1..wrong'),('tenancyId','../secret'),('fingerprint','ab')]:
   r=copy.deepcopy(REF);r['identity'][field]=value
   with self.subTest(field=field),self.assertRaises(Refused):s.validate_reference(r)
 def test_wrong_resource_type_and_regex_separators(self):
  for value in ('ocid1.secret.oc1.sa-saopaulo-1.'+'a'*60,REF['secretId'].replace('ocid1.','ocid1X'),REF['secretId'].replace('sa-saopaulo-1','us-ashburn-1')):
   r=copy.deepcopy(REF);r['secretId']=value
   with self.subTest(value=value),self.assertRaises(Refused):s.validate_reference(r)
 def test_ref_extra_and_boolean_version(self):
  for extra in ({'debug':True},{'versionNumber':True},{'versionNumber':0}):
   r=copy.deepcopy(REF);r.update(extra)
   with self.subTest(extra=extra),self.assertRaises(Refused):s.validate_reference(r)
 def test_response_bindings(self):
  for field,value in [('secretId','other'),('version',2),('version',True),('contentType','TEXT'),('extra',True)]:
   b=bundle();b[field]=value
   with self.subTest(field=field,value=value),self.assertRaises(Refused):s.decode_bundle(encoded(b),REF)
 def test_base64_strict_size(self):
  for value in ('!bad', 'a'*8193, '', None):
   b=bundle();b['content']=value
   with self.subTest(value=str(value)[:10]),self.assertRaises(Refused):s.decode_bundle(encoded(b),REF)
 def test_password_controls_size_and_type(self):
  for value in ('', 'a\nb', 'a\x00b','a\x7fb','x'*1025,False,None):
   b=bundle({'formatVersion':1,'user':'traceflow_admin','password':value})
   with self.subTest(value=str(value)[:10]),self.assertRaises(Refused):s.decode_bundle(encoded(b),REF)
 def test_secret_account_and_fields(self):
  for value in ({'formatVersion':True,'user':'traceflow_admin','password':'x'},{'formatVersion':1,'user':'root','password':'x'},
                {'formatVersion':1,'user':'traceflow_admin','password':'x','extra':True}):
   with self.subTest(value=value),self.assertRaises(Refused):s.decode_bundle(encoded(bundle(value)),REF)
 def test_duplicate_json(self):
  b=bundle();b['content']=base64.b64encode(b'{"formatVersion":1,"user":"traceflow_admin","password":"a","password":"b"}').decode()
  with self.assertRaisesRegex(Refused,'DUPLICATE_JSON'):s.decode_bundle(encoded(b),REF)
 def test_credential_source_allowlist(self):
  for value in ('/tmp','/run/credentials/traceflow-api.service',''):
   with mock.patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':value}),self.subTest(value=value),self.assertRaisesRegex(Refused,'SYSTEMD_CREDENTIAL_REQUIRED'):
    s.signing_key(REF)
 def test_signing_key_fingerprint(self):
  with mock.patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':'/run/credentials/traceflow-recovery-backup.service'}),mock.patch.object(s,'secure_read') as read,mock.patch.object(s,'tool',return_value=b'synthetic-public-DER'):
   with self.assertRaisesRegex(Refused,'SIGNING_KEY_CHANGED'):s.signing_key(REF)
   read.assert_called_once_with(Path('/run/credentials/traceflow-recovery-backup.service/oci-api-key'),0,16384,0o400)
 def test_secret_cli_command_contains_no_password_or_fallback(self):
  # Filesystem custody itself is exercised by Linux tests. Here intercept the IO
  # boundary to prove fixed API auth + cleanup, without creating any real secrets.
  with mock.patch.object(s,'signing_key',return_value=Path('/run/credentials/traceflow-recovery-backup.service/oci-api-key')),mock.patch.object(Path,'mkdir'),mock.patch.object(Path,'exists',return_value=False),mock.patch.object(Path,'is_symlink',return_value=False),mock.patch.object(Path,'is_dir',return_value=True),mock.patch.object(Path,'stat',return_value=type('S',(),{'st_uid':0,'st_mode':0o40700})()),mock.patch.object(s,'private_write') as write,mock.patch.object(s,'fsync_dir'),mock.patch.object(s,'secure_read',side_effect=lambda *a:write.call_args.args[1]),mock.patch.object(Path,'unlink') as unlink,mock.patch.object(s,'tool',return_value=encoded(bundle())) as tool:
   result=s.fetch({'credential':REF},{'oci':'/opt/tools/oci'})
   args=tool.call_args.args[0];self.assertIn('api_key',args);self.assertNotIn('instance_principal',args);self.assertNotIn(SYNTHETIC,str(args));self.assertNotIn(SYNTHETIC,str(write.call_args));unlink.assert_called_once();self.assertIn(b'password=',result)
 def test_network_failure_removes_config_and_preserves_error(self):
  with mock.patch.object(s,'signing_key',return_value=Path('/run/key')),mock.patch.object(Path,'mkdir'),mock.patch.object(Path,'exists',return_value=False),mock.patch.object(Path,'is_symlink',return_value=False),mock.patch.object(Path,'is_dir',return_value=True),mock.patch.object(Path,'stat',return_value=type('S',(),{'st_uid':0,'st_mode':0o40700})()),mock.patch.object(s,'private_write') as write,mock.patch.object(s,'fsync_dir'),mock.patch.object(s,'secure_read',side_effect=lambda *a:write.call_args.args[1]),mock.patch.object(Path,'unlink') as unlink,mock.patch.object(s,'tool',side_effect=Refused('TOOL_TIMEOUT')):
   with self.assertRaisesRegex(Refused,'TOOL_TIMEOUT'):s.fetch({'credential':REF},{'oci':'/opt/tools/oci'})
   unlink.assert_called_once()
if __name__=='__main__':unittest.main()
