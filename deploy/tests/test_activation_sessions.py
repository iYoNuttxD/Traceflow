"""Session allowlist and bounded diagnostics; synthetic rows, no MySQL or services."""
import json,sys,unittest
from pathlib import Path
from unittest import mock
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_activation_window as previous
from activation_accounts import ACCOUNTS,GUARDS,Accounts,RuntimeSessionFailure
from release_contract import Refused,private_json

class SessionTests(unittest.TestCase):
    def account(self,rows,locked=False):
        a=Accounts.__new__(Accounts)
        a.query=mock.Mock(return_value=({'ACCOUNTS':sorted([[u,'10.20.1.184','Y' if locked or u not in ACCOUNTS else 'N'] for u in GUARDS]),'SESSIONS':rows},'17'))
        return a
    def test_only_original_runtime_users_and_source_are_allowed(self):
        rows=[[1,'traceflow_api','10.20.1.184:4500'],[2,'traceflow_worker','10.20.1.184']]
        self.assertEqual(self.account(rows).state(False,False),rows)
        self.assertEqual(self.account([],True).state(True,True),[])
        for user,host in [('traceflow_diag','10.20.1.184'),('traceflow_migrator','10.20.1.184'),
                ('traceflow_api','10.20.1.185:4500'),('traceflow_worker','hostname:4500'),
                ('traceflow_api',None),('traceflow_api',''),('traceflow_api','::ffff:10.20.1.184')]:
            with self.subTest(user=user,host=host),self.assertRaisesRegex(RuntimeSessionFailure,'^UNEXPECTED_RUNTIME_SESSION$'):
                self.account([[1,user,host]]).state(False,False)
    def test_empty_requirement_and_locked_accounts_are_not_relaxed(self):
        with self.assertRaisesRegex(Refused,'RUNTIME_SESSIONS_REMAIN'):
            self.account([[1,'traceflow_api','10.20.1.184']],True).state(True,True)
        a=self.account([]);a.query.return_value[0]['ACCOUNTS'][0][2]='Y'
        with self.assertRaisesRegex(Refused,'RUNTIME_ACCOUNT_STATE'):a.state(False,False)
    def test_sanitized_diagnostic_is_bounded_and_does_not_invent_origin(self):
        rows=[[i,'traceflow_diag',None] for i in range(1,20)]
        rows.append([20,'synthetic-secret-user','https://synthetic.invalid/?token=synthetic-secret'])
        a=self.account(rows)
        with self.assertRaises(RuntimeSessionFailure) as error:a.state(False,False)
        d=error.exception.observation
        self.assertEqual(d['rejectedCount'],20);self.assertEqual(len(d['rejected']),16);self.assertTrue(d['truncated'])
        self.assertEqual(d['rejected'][0]['sourceKind'],'MISSING');self.assertIsNone(d['rejected'][0]['sourceIp'])
        self.assertNotIn('synthetic',json.dumps(d));self.assertNotIn('password',json.dumps(d))
        d=RuntimeSessionFailure([[1,'unknown-secret','secret-host:port']]).observation['rejected'][0]
        self.assertEqual(d['account'],'UNRECOGNIZED');self.assertEqual(d['sourceKind'],'UNRECOGNIZED')
        self.assertNotIn('secret',json.dumps(d))
        d=RuntimeSessionFailure([[2,'traceflow_worker','10.20.1.185:1234']]).observation['rejected'][0]
        self.assertEqual(d['sourceIp'],'10.20.1.185');self.assertFalse(d['sourceMatches'])
    def test_final_account_failure_after_three_postchecks_records_diagnostic_and_recovers(self):
        h=previous.WindowTests();h.setUp();self.addCleanup(h.tearDown)
        failure=RuntimeSessionFailure([[42,'traceflow_api',None]])
        h.account.state.side_effect=failure
        with self.assertRaises(RuntimeSessionFailure):h.run_flow()
        self.assertTrue(all((h.path/(k+'.json')).exists() for k in previous.contract.POST))
        self.assertFalse((h.path/'verified.json').exists());self.assertFalse((h.path/'closed.json').exists())
        d=private_json(h.path/'failure.json');self.assertEqual(d['code'],'UNEXPECTED_RUNTIME_SESSION')
        self.assertEqual(d['phase'],'postchecks-pending');self.assertEqual(d['runtimeSessionFailure'],failure.observation)
        self.assertEqual(private_json(h.path/'recovery.json')['failureSha256'],previous.c.file_digest(h.path/'failure.json'))
        h.account.relock.assert_called_once();h.db.close.assert_called_once()
    def test_arbitrary_exception_metadata_cannot_enter_failure_receipt(self):
        h=previous.WindowTests();h.setUp();self.addCleanup(h.tearDown)
        failure=Refused('UNEXPECTED_RUNTIME_SESSION');failure.observation={'secret':'do-not-record'}
        h.account.state.side_effect=failure
        with self.assertRaises(Refused):h.run_flow()
        raw=(h.path/'failure.json').read_bytes();self.assertNotIn(b'do-not-record',raw)
        self.assertNotIn('runtimeSessionFailure',private_json(h.path/'failure.json'))

if __name__=='__main__':unittest.main()
