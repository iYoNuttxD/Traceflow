import copy,importlib.util,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('live_ops_transition',ROOT/'deploy/operations/live_operations.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
class BackupSchemaTransitionTests(unittest.TestCase):
 def setUp(self):
  self.snapshot={'tables':{'Existing':{'foreignKeys':0},'Added':{'foreignKeys':1}},'migrations':[{'name':'20261001_old','sha256':'a'*64},{'name':'20261002_new','sha256':'b'*64}]}
  self.contract={'schemaSha256':'c'*64,'migrations':self.snapshot['migrations'],'tables':2,'foreignKeys':1,'tableNames':['Added','Existing']}
  self.cfg={'schemaContracts':[self.contract]}
 def test_new_recognized_schema_does_not_depend_on_68_or_61(self):
  self.assertEqual(ops.snapshot_contract(self.snapshot,self.cfg),self.contract)
 def test_unknown_migration_count_checksum_duplicates_or_table_identity_refused(self):
  for mutate in [lambda s:s['migrations'].pop(),lambda s:s['migrations'][0].update(sha256='f'*64),lambda s:s['migrations'].append(s['migrations'][0]),lambda s:s['tables'].update(Other=s['tables'].pop('Added')),lambda s:s['tables']['Added'].update(foreignKeys=0)]:
   s=copy.deepcopy(self.snapshot);mutate(s)
   with self.assertRaises(ops.Refused):ops.snapshot_contract(s,self.cfg)
 def test_ambiguous_approved_contracts_refused(self):
  with self.assertRaises(ops.Refused):ops.snapshot_contract(self.snapshot,{'schemaContracts':[self.contract,self.contract]})
 def test_empty_or_unconfigured_schema_is_not_implicitly_accepted(self):
  for contracts in [[],None]:
   cfg={'schemaContracts':contracts}
   with self.assertRaises((ops.Refused,KeyError)):ops.snapshot_contract(self.snapshot,cfg)

from unittest.mock import patch
class JobMonitoringTests(unittest.TestCase):
 def test_monitor_uses_actual_durable_job_names_and_detects_stale_execution(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'src/jobs').mkdir(parents=True);(root/'src/jobs/job-runner.js').touch()
   def command(args,**kwargs):
    if 'WorkingDirectory' in args[3]:return str(root).encode()
    if 'ActiveEnterTimestampMonotonic' in args[3]:return b'1000000'
    return b''
   names=['notifications-due','github-event-dispatch','traceability-notice-dispatch','traceability-alerts']
   with patch.object(ops,'run',side_effect=command),patch.object(ops,'environment',return_value={'JOBS_ENABLED':'true'}),patch.object(ops.time,'monotonic',return_value=200),patch.object(ops,'sql',return_value=[ops.json.dumps([n,10]) for n in names]):
    metrics,failures=ops.scheduled_job_metrics();self.assertEqual(failures,[]);self.assertEqual(set(metrics['leaseAgeSeconds']),set(names))
   with patch.object(ops,'run',side_effect=command),patch.object(ops,'environment',return_value={'JOBS_ENABLED':'true'}),patch.object(ops.time,'monotonic',return_value=200),patch.object(ops,'sql',return_value=[]):
    self.assertIn('SCHEDULED_JOBS_STALE',ops.scheduled_job_metrics()[1])
