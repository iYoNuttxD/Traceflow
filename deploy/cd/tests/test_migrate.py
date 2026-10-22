import contextlib,importlib.util,io,json,os,subprocess,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('cd_migrator',Path(__file__).resolve().parents[1]/'migrate.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class MigratorTests(unittest.TestCase):
 def fixture(self,folder):
  base=Path(folder);root=base/'candidate';(root/'backend/node_modules/prisma/build').mkdir(parents=True)
  (root/'backend/node_modules/prisma/build/index.js').write_text('// synthetic only')
  (root/'backend/node_modules/prisma/package.json').write_text('{"version":"6.12.0"}')
  credential=base/'mysql-migrator';credential.write_text('[client]\nuser=tf_live_migrator\npassword=synthetic-not-production\n');credential.chmod(0o600)
  return root,credential
 def invoke(self,root,credential,connection=None,deployment=None):
  stat=Path.stat
  def custody(path,*a,**kw):
   value=stat(path,*a,**kw)
   return types.SimpleNamespace(st_uid=0,st_mode=value.st_mode) if path==credential else value
  connection=connection or subprocess.CompletedProcess([],0,stdout=(json.dumps([m.UUID,m.SCHEMA,'tf_live_migrator@10.20.1.184'])+'\nSsl_cipher\tTLS_AES_128_GCM_SHA256\n').encode(),stderr=b'')
  deployment=deployment or subprocess.CompletedProcess([],0,stdout=b'Applied successfully',stderr=b'')
  log=io.StringIO()
  with patch.object(m,'RELEASES',root.parent),patch.object(m.os,'geteuid',return_value=0),patch.object(Path,'stat',custody),patch.dict(os.environ,{'CREDENTIALS_DIRECTORY':str(credential.parent),'PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK':'1'}),patch.object(m.subprocess,'run',side_effect=[connection,deployment]) as run,contextlib.redirect_stdout(log):
   m.execute(root)
  return run,log.getvalue()
 def test_tls_exact_identity_cli_and_no_credentials_in_arguments_or_log(self):
  with tempfile.TemporaryDirectory() as folder:
   root,credential=self.fixture(folder);run,output=self.invoke(root,credential)
   self.assertEqual(run.call_count,2);mysql=run.call_args_list[0].args[0];cli=run.call_args_list[1]
   self.assertIn('--ssl-mode=VERIFY_IDENTITY',mysql);self.assertIn('migrate',cli.args[0]);self.assertIn('deploy',cli.args[0])
   self.assertNotIn('synthetic-not-production',' '.join(mysql+cli.args[0])+output)
   environment=cli.kwargs['env'];self.assertNotIn('PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK',environment)
   self.assertIn('connection_limit=2',environment['DATABASE_URL']);self.assertIn('sslaccept=strict',environment['DATABASE_URL'])
   self.assertEqual(json.loads(output)['status'],'PRISMA_DEPLOY_PASS')
 def test_mysql_identity_or_tls_failure_stops_before_prisma(self):
  for connection in [subprocess.CompletedProcess([],1,stdout=b'',stderr=b'secret must not escape'),subprocess.CompletedProcess([],0,stdout=b'["wrong","traceflow_live","tf_live_migrator@10.20.1.184"]\nSsl_cipher\tTLS\n',stderr=b'')]:
   with tempfile.TemporaryDirectory() as folder:
    root,credential=self.fixture(folder)
    with self.assertRaisesRegex(ValueError,'MIGRATOR_'):self.invoke(root,credential,connection=connection)
 def test_prisma_failure_is_terminal_and_sanitized(self):
  with tempfile.TemporaryDirectory() as folder:
   root,credential=self.fixture(folder)
   with self.assertRaisesRegex(ValueError,'PRISMA_DEPLOY_FAILED_NO_RETRY'):
    self.invoke(root,credential,deployment=subprocess.CompletedProcess([],1,stdout=b'private detail synthetic-not-production',stderr=b'P3018'))
