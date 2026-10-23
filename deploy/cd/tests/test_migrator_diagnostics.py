import json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver as r

class MigratorDiagnosticTests(unittest.TestCase):
 def diagnostic(self,stdout=b'',stderr=b'',code=1,timeout=False):return r.migration_diagnostic(stdout,stderr,code,timeout)
 def test_creation_failure_is_not_attributed_to_mysql_or_child(self):
  d=self.diagnostic(stderr=b'Failed to set unit properties: unknown assignment synthetic-private')
  self.assertEqual(d['code'],'MIGRATOR_UNIT_PROPERTY_REFUSED');self.assertFalse(d['childExecutionObserved']);self.assertNotIn('synthetic-private',json.dumps(d))
 def test_property_and_reason_are_private_whitelisted_values(self):
  d=self.diagnostic(stderr=b'Failed to set unit properties: Unknown assignment: PartOf=synthetic-private')
  self.assertEqual(d['unitProperty'],'PartOf');self.assertEqual(d['systemdReason'],'UNKNOWN_ASSIGNMENT')
  self.assertNotIn('unitProperty',r.public_migration_diagnostic(d));self.assertNotIn('private',json.dumps(d))
 def test_transient_start_refusal_remains_distinct(self):
  self.assertEqual(self.diagnostic(stderr=b'Failed to start transient service unit: synthetic-private')['code'],'MIGRATOR_TRANSIENT_START_FAILED')
 def test_namespace_credential_or_exec_setup_uses_systemd_exit_status(self):
  for status in (203,226,243):
   d=self.diagnostic(stderr=('Main processes terminated with: code=exited/status='+str(status)).encode())
   self.assertEqual(d['category'],'unit-setup');self.assertEqual(d['execMainStatus'],status);self.assertFalse(d['childExecutionObserved']);self.assertTrue(d['unitExecutionObserved'])
 def test_process_execution_without_known_json_is_not_called_a_mysql_failure(self):
  d=self.diagnostic(stderr=b'Main processes terminated with: code=exited/status=9')
  self.assertTrue(d['childExecutionObserved']);self.assertEqual(d['category'],'child-execution')
 def test_actual_blocked_child_code_is_retained_without_other_fields(self):
  d=self.diagnostic(stdout=json.dumps({'status':'BLOCKED','code':'MIGRATOR_TLS_CONNECTION','password':'synthetic-private','url':'mysql://private','invocationId':'a'*32}).encode())
  self.assertEqual(d['code'],'MIGRATOR_TLS_CONNECTION');self.assertEqual(d['category'],'mysql-connection');self.assertEqual(d['invocationId'],'a'*32)
  self.assertNotIn('private',json.dumps(d));self.assertNotIn('invocationId',r.public_migration_diagnostic(d))
 def test_schema_privilege_and_prisma_validation_codes_remain_exact(self):
  for code in ('MIGRATOR_PRIVILEGES','PRISMA_CLI_IDENTITY','SCHEMA_DRIFT_OR_INTROSPECTION_FAILED'):
   self.assertEqual(self.diagnostic(stdout=json.dumps({'status':'BLOCKED','code':code}).encode())['code'],code)
 def test_unknown_or_malicious_json_does_not_become_public_code(self):
  for value in ({'status':'BLOCKED','code':'SYNTHETIC_PRIVATE_PASSWORD'},['private'],None,{'status':'BLOCKED','code':['private']}):
   d=self.diagnostic(stdout=json.dumps(value).encode());self.assertEqual(d['code'],'MIGRATOR_EXECUTION_UNCLASSIFIED');self.assertNotIn('private',json.dumps(d).lower())
 def test_timeout_oom_and_child_specific_timeout_are_not_generic(self):
  for stderr,timeout in [(b'Finished with result: oom-kill',False),(b'Finished with result: timeout',False),(b'',True)]:
   self.assertEqual(self.diagnostic(stderr=stderr,timeout=timeout)['category'],'timeout-or-resource')
  self.assertEqual(self.diagnostic(stdout=b'{"status":"BLOCKED","code":"MIGRATOR_SCHEMA_TIMEOUT"}')['code'],'MIGRATOR_SCHEMA_TIMEOUT')
 def test_success_proves_child_execution_without_raw_output(self):
  d=self.diagnostic(stdout=b'{"status":"MIGRATOR_PREFLIGHT_PASS","invocationId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',code=0)
  self.assertEqual(d['category'],'success');self.assertTrue(d['childExecutionObserved'])
 def test_timeout_exception_cannot_leak_arguments_environment_or_output(self):
  args=r.migration_unit(Path('/synthetic'),'123',check=True)
  with patch.object(r.subprocess,'run',side_effect=subprocess.TimeoutExpired('mysql://synthetic-private',1,output=b'private',stderr=b'private')):
   with self.assertRaisesRegex(ValueError,'MIGRATOR_TIMEOUT_OR_RESOURCE') as raised:r.run(args)
  self.assertNotIn('private',str(raised.exception));self.assertNotIn('private',json.dumps(raised.exception.migration_diagnostics))
 def test_preflight_persists_only_filtered_metadata_in_private_file(self):
  with tempfile.TemporaryDirectory() as d:
   host=r.Host.__new__(r.Host);host.root=Path('/synthetic');host.request={'runId':'123'};host.work=Path(d);host.migrator_preflight=None
   result=subprocess.CompletedProcess([],1,stdout=b'{"status":"BLOCKED","code":"MIGRATOR_CUSTODY","password":"synthetic-private"}',stderr=b'synthetic-private')
   def child(command,**kwargs):
    Path(next(v.split('StandardOutput=append:',1)[1] for v in command if v.startswith('StandardOutput=append:'))).write_bytes(result.stdout);return result
   with patch.object(r.subprocess,'run',side_effect=child),self.assertRaisesRegex(ValueError,'MIGRATOR_CUSTODY'):host.invoke_migrator(check=True)
   p=Path(d)/'migrator-check-diagnostic.json';self.assertEqual(p.stat().st_mode&0o777,0o600);self.assertNotIn('private',p.read_text());self.assertEqual(host.migrator_preflight['diagnostics'][0]['childCode'],'MIGRATOR_CUSTODY')
 def test_signal_summary_is_evidence_of_execution_not_a_mysql_identity_claim(self):
  d=self.diagnostic(stderr=b'Main processes terminated with: code=killed/status=KILL\nFinished with result: signal')
  self.assertEqual(d['execMainStatus'],'KILL');self.assertEqual(d['unitResult'],'signal');self.assertEqual(d['category'],'child-execution')
 def test_manager_opened_output_preserves_wait_collect_and_sandbox(self):
  args=r.migration_unit(Path('/synthetic'),'123',check=True)
  for value in ('--wait','--collect','ProtectSystem=strict','NoNewPrivileges=yes','MemoryMax=512M','MemorySwapMax=0','LimitCORE=0','BindsTo=traceflow-live-cd.service','PartOf=traceflow-live-cd.service'):self.assertIn(value,args)
  self.assertNotIn('--quiet',args);self.assertNotIn('--pipe',args)
  self.assertIn('StandardOutput=append:/var/lib/traceflow-live-cd/migrator-check-123.json',args);self.assertIn('StandardError=null',args)

 def test_manager_output_requires_private_regular_file_and_limit(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'output.json';args=r.migration_unit(Path('/synthetic'),'123',check=True,output=p)
   p.write_bytes(b'{"status":"MIGRATOR_PREFLIGHT_PASS"}');p.chmod(0o600)
   self.assertEqual(r.migration_output(args),p.read_bytes())
   p.chmod(0o644)
   with self.assertRaisesRegex(ValueError,'MIGRATOR_OUTPUT_CUSTODY'):r.migration_output(args)
   p.chmod(0o600);p.write_bytes(b'x'*65537)
   with self.assertRaisesRegex(ValueError,'MIGRATOR_OUTPUT_LIMIT'):r.migration_output(args)
   p.unlink();p.symlink_to(Path(d)/'target');p.resolve().write_bytes(b'{}');p.resolve().chmod(0o600)
   with self.assertRaisesRegex(ValueError,'MIGRATOR_OUTPUT_CUSTODY'):r.migration_output(args)
 def test_manager_output_is_required_even_when_systemd_returns_zero(self):
  with tempfile.TemporaryDirectory() as d:
   args=r.migration_unit(Path('/synthetic'),'123',check=True,output=Path(d)/'absent')
   with patch.object(r.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'ignored',stderr=b'')):
    with self.assertRaisesRegex(ValueError,'MIGRATOR_OUTPUT_MISSING'):r.run(args)
 def test_output_is_exclusive_and_cannot_be_replayed(self):
  with tempfile.TemporaryDirectory() as d:
   host=r.Host.__new__(r.Host);host.root=Path('/synthetic');host.request={'runId':'123'};host.work=Path(d);host.migrator_preflight=None
   (Path(d)/'migrator-check-output.json').write_text('{}')
   with patch.object(r.subprocess,'run') as command,self.assertRaises(FileExistsError):host.invoke_migrator(check=True)
   command.assert_not_called()
 def test_connection_reset_is_classified_without_an_invented_child_cause(self):
  result=self.diagnostic(stderr=b'Failed to start transient service unit: Connection reset by peer')
  self.assertEqual(result['systemdReason'],'BUS_CONNECTION_RESET');self.assertEqual(result['category'],'unit-creation');self.assertFalse(result['childExecutionObserved'])

 def test_collected_setup_failure_is_recovered_from_filtered_journal(self):
  unit='traceflow-live-cd-migrate-check-123.service'
  for status,name in ((203,'EXEC'),(226,'NAMESPACE'),(243,'CREDENTIALS')):
   logs=b'\n'.join(json.dumps(v).encode() for v in (
    {'_SYSTEMD_UNIT':unit,'MESSAGE':'Main process exited, code=exited, status='+str(status)+'/'+name,'password':'synthetic-private'},
    {'UNIT':unit,'MESSAGE':"Failed with result 'exit-code'."}))
   proof=r.migration_journal_evidence(logs,unit)
   result=r.migration_diagnostic(b'',b'',1,unit_evidence=proof)
   self.assertEqual(result['category'],'unit-setup');self.assertEqual(result['execMainStatus'],status);self.assertFalse(result['childExecutionObserved']);self.assertNotIn('private',json.dumps(result))
 def test_journal_ignores_other_units_unknown_fields_and_unstructured_messages(self):
  logs=b'\n'.join(json.dumps(v).encode() for v in (
   {'UNIT':'other.service','MESSAGE':'Main process exited, code=exited, status=243/CREDENTIALS'},
   {'UNIT':'expected.service','MESSAGE':'synthetic-private'},None))
  self.assertEqual(r.migration_journal_evidence(logs,'expected.service'),{})
 def test_missing_executable_is_not_misreported_as_tls_or_child(self):
  d=self.diagnostic(stderr=b'Failed to find executable /synthetic-private: No such file or directory')
  self.assertEqual(d['code'],'MIGRATOR_EXECUTABLE_UNAVAILABLE');self.assertFalse(d['childExecutionObserved']);self.assertNotIn('synthetic-private',json.dumps(d))

 def test_resource_failure_has_precedence_over_partial_child_json(self):
  d=self.diagnostic(stdout=b'{"status":"BLOCKED","code":"MIGRATOR_PRIVILEGES"}',stderr=b'Finished with result: timeout')
  self.assertEqual(d['category'],'timeout-or-resource');self.assertEqual(d['code'],'MIGRATOR_TIMEOUT_OR_RESOURCE');self.assertEqual(d['childCode'],'MIGRATOR_PRIVILEGES')

if __name__=='__main__':unittest.main()
