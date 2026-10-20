"""Session allowlist and bounded diagnostics; synthetic rows, no MySQL or services."""
import json,sys,unittest
from pathlib import Path
from unittest import mock
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_activation_window as previous
from activation_accounts import ACCOUNTS,GUARDS,Accounts,RuntimeSessionFailure,allowed_runtime_session,runtime_session_ip
from release_contract import Refused,private_json
from runtime_grants import parse_frames

class SessionTests(unittest.TestCase):
    def account(self,rows,locked=False):
        a=Accounts.__new__(Accounts)
        a.query=mock.Mock(return_value=({'ACCOUNTS':sorted([[u,'10.20.1.184','Y' if locked or u not in ACCOUNTS else 'N'] for u in GUARDS]),'SESSIONS':[r+[None,None] if len(r)==3 else r[:3]+[json.dumps(v) if isinstance(v,list) else v for v in r[3:]] for r in rows]},'17'))
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

class OriginEvidenceTests(unittest.TestCase):
    host='approved.synthetic.invalid'
    ip='10.20.1.184'
    def row(self,host=None,sockets=None,cache=None,user='traceflow_api'):
        return [41,user,self.host if host is None else host,sockets,cache]
    def good_cache(self):return [[self.ip,self.host,'YES']]
    def test_literal_ipv4_with_and_without_port_is_preserved(self):
        for host in (self.ip,self.ip+':4500'):
            self.assertTrue(allowed_runtime_session(self.row(host)))
            self.assertTrue(allowed_runtime_session(self.row(host,[self.ip])))
    def test_hostname_uses_same_thread_client_socket_without_external_dns(self):
        with mock.patch('socket.getaddrinfo',side_effect=AssertionError('NO_EXTERNAL_DNS')):
            self.assertTrue(allowed_runtime_session(self.row(sockets=[self.ip])))
    def test_ipv4_mapped_socket_is_only_the_same_approved_ipv4(self):
        self.assertTrue(allowed_runtime_session(self.row(sockets=['::ffff:'+self.ip])))
        self.assertTrue(allowed_runtime_session(self.row(sockets=['::ffff:a14:1b8'])))
        for value in ('::1','2002:0a14:01b8::','::ffff:10.20.1.185'):
            self.assertFalse(allowed_runtime_session(self.row(sockets=[value],cache=self.good_cache())))
    def test_numeric_invalid_ip_does_not_become_an_authorized_hostname(self):
        for value in ('010.20.1.184','10.20.1.999','1.2.3','123'):
            self.assertFalse(allowed_runtime_session(self.row(value,sockets=[self.ip])))
    def test_unique_validated_mysql_host_cache_is_accepted(self):
        self.assertTrue(allowed_runtime_session(self.row(cache=self.good_cache())))
        self.assertTrue(allowed_runtime_session(self.row(sockets=[self.ip],cache=self.good_cache())))
    def test_unverified_hostnames_are_rejected(self):
        for cache in (None,[],[[self.ip,self.host,'NO']],[[self.ip,self.host,None]],[[self.ip,None,'YES']],[[self.ip,self.host.lower()+'x','YES']],[[self.ip,self.host,'yes']]):
            with self.subTest(cache=cache):self.assertFalse(allowed_runtime_session(self.row(cache=cache)))
    def test_foreign_and_ambiguous_cache_entries_are_rejected(self):
        good=self.good_cache()
        for cache in ([[self.ip+'0',self.host,'YES']],good+good,good+[['10.20.1.185',self.host,'YES']],good+[[self.ip,'other.synthetic.invalid','YES']]):
            for sockets in (None,[self.ip]):
                with self.subTest(cache=cache,sockets=sockets):self.assertFalse(allowed_runtime_session(self.row(sockets=sockets,cache=cache)))
    def test_bad_socket_cannot_fall_back_to_valid_cache(self):
        for sockets in (['10.20.1.185'],[self.ip,self.ip],[''],[None],['::ffff:10.20.1.185'],self.ip,[[self.ip]]):
            with self.subTest(sockets=sockets):self.assertFalse(allowed_runtime_session(self.row(sockets=sockets,cache=self.good_cache())))
    def test_wrong_literal_or_malformed_host_is_not_overridden_by_socket(self):
        for host in ('10.20.1.185','010.20.1.184','::ffff:'+self.ip,'[::1]','hostname:bad',self.host+':0',self.host+':65536','https://synthetic.invalid/',' space.invalid','-bad.invalid','bad..invalid',True):
            with self.subTest(host=host):self.assertFalse(allowed_runtime_session(self.row(host,[self.ip],self.good_cache())))
    def test_cache_must_correspond_exactly_to_observed_hostname(self):
        self.assertFalse(allowed_runtime_session(self.row(self.host.upper(),cache=self.good_cache())))
        self.assertFalse(allowed_runtime_session(self.row(self.host+'.',cache=self.good_cache())))
    def test_original_user_allowlist_is_unchanged(self):
        for user in ('traceflow_diag','traceflow_migrator','root','unknown'):
            for sockets,cache in (([self.ip],None),(None,self.good_cache())):
                with self.subTest(user=user):self.assertFalse(allowed_runtime_session(self.row(sockets=sockets,cache=cache,user=user)))
    def test_raw_three_field_hostname_does_not_gain_authorization(self):
        self.assertFalse(allowed_runtime_session([1,'traceflow_api',self.host]))
    def test_state_preserves_triple_result_and_empty_requirement(self):
        h=SessionTests();rows=[self.row(cache=self.good_cache())];a=h.account(rows)
        self.assertEqual(a.state(False,False),[rows[0][:3]])
        a=h.account(rows,True)
        with self.assertRaisesRegex(Refused,'RUNTIME_SESSIONS_REMAIN'):a.state(True,True)
    def test_state_refuses_missing_observed_fields_and_bad_connection_ids(self):
        h=SessionTests()
        for row in ([1,'traceflow_api',self.ip],[True,'traceflow_api',self.ip,None,None],[0,'traceflow_api',self.ip,None,None]):
            a=h.account([]);a.query.return_value[0]['SESSIONS']=[row]
            with self.subTest(row=row),self.assertRaisesRegex(Refused,'RUNTIME_SESSION_OBSERVATION'):a.state(False,False)
    def test_rejected_hostname_diagnostics_remain_sanitized(self):
        a=SessionTests().account([self.row(cache=[[self.ip,self.host,'NO']])])
        with self.assertRaises(RuntimeSessionFailure) as error:a.state(False,False)
        d=error.exception.observation
        self.assertEqual(d['rejectedCount'],1);self.assertNotIn(self.host,json.dumps(d))
        self.assertEqual(d['rejected'][0]['sourceKind'],'UNRECOGNIZED')
    def test_actual_flat_sql_frame_parser_and_evidence_decoding(self):
        wire=[41,'traceflow_api',self.host,None,json.dumps(self.good_cache())]
        a=Accounts.__new__(Accounts)
        def query(plan):
            accounts=sorted([[u,self.ip,'N' if u in ACCOUNTS else 'Y'] for u in GUARDS])
            data={'ACCOUNTS':accounts,'SESSIONS':[wire]};lines=[]
            for q in plan:
                lines.append('TF_W02_'+q['id']+'_BEGIN\t17')
                lines.extend(json.dumps(row) for row in data[q['id']]);lines.extend(['0','TF_W02_'+q['id']+'_END\t17'])
            return parse_frames('\n'.join(lines)+'\n',plan)
        a.query=query;self.assertEqual(a.state(False,False),[wire[:3]])
    def test_bad_evidence_json_is_refused_without_relaxing_flat_frames(self):
        for value in ('{bad-json','{}','123','[NaN]'):
            a=SessionTests().account([]);a.query.return_value[0]['SESSIONS']=[[41,'traceflow_api',self.host,None,value]]
            with self.subTest(value=value),self.assertRaisesRegex(Refused,'RUNTIME_SESSION_OBSERVATION'):a.state(False,False)
        plan=[{'id':'SESSIONS','sql':'SELECT 1','width':5}]
        text='TF_W02_SESSIONS_BEGIN\t17\n'+json.dumps(self.row(cache=self.good_cache()))+'\n0\nTF_W02_SESSIONS_END\t17\n'
        with self.assertRaisesRegex(Refused,'ADMIN_ROWS'):parse_frames(text,plan)
    def test_plan_collects_origin_evidence_from_same_thread_in_one_select(self):
        a=SessionTests().account([],True);a.state(True,True);plan=a.query.call_args.args[0]
        self.assertEqual([q['id'] for q in plan],['ACCOUNTS','SESSIONS'])
        q=plan[1];self.assertEqual(q['width'],5);self.assertTrue(q['sql'].startswith('SELECT '))
        for fragment in ('s.THREAD_ID=t.THREAD_ID',"s.EVENT_NAME='wait/io/socket/sql/client_connection'",'h.IP,h.HOST,h.HOST_VALIDATED',"h.IP='10.20.1.184'"):
            self.assertIn(fragment,q['sql'])

if __name__=='__main__':unittest.main()
