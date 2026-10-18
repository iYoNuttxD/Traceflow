"""Local-only: real custody/locks/journal, simulated systemd/HTTPS/MySQL boundaries."""
import contextlib,copy,json,os,signal,subprocess,sys,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_activation_window as previous
from test_activation_window import ops,window,c,contract,manifest,stamp,ROOT
from operational_io import private_write

class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.h=previous.WindowTests();self.h.setUp();self.layout=self.h.layout;self.path=self.h.path;self.a=self.h.a
        self.state=dict(self.layout.load(),status='intervention-required',phase='recovery-incomplete',
                        runId=self.a['runId'],target=self.a['releaseId'],operation='activate-first')
        self.layout.save(self.state)
        window.receipt(self.path,'failure',self.a,status='FAIL',code='FRONTEND_SMOKE',phase='public-cutover')
        window.receipt(self.path,'recovery',self.a,status='INTERVENTION_REQUIRED',failedControls=['public-page'],dataPreserved=True,schemaRestored=False)
        self.q={'formatVersion':1,'operation':'reconcile-first','authorizationId':'d'*32,'reconciliationId':'e'*32,
                'operatorId':'fixture-operator','runId':self.a['runId'],'releaseId':self.a['releaseId'],
                'descriptorSha256':self.a['descriptorSha256'],'issuedAt':stamp(time.time()-1),'expiresAt':stamp(time.time()+590),
                'historySha256':window.recovery_history(self.path),'stateSha256':c.digest(c.encoded(self.state)),
                'externalWritersExcluded':True}
        self.auth=self.h.root/'reconcile-auth.json';private_write(self.auth,c.encoded(self.q))
        self.args=SimpleNamespace(run_id=self.a['runId'],authorization=str(self.auth))
        self.folder=window.reconciliation_folder(self.layout,self.q);self.before=self.history()
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close);self.addCleanup(self.h.tearDown)
        self.stack.enter_context(mock.patch.object(ops,'native_context'))
        self.stack.enter_context(mock.patch.object(ops,'emit'))
        self.stack.enter_context(mock.patch.object(window.resource,'setrlimit'))
        self.stack.enter_context(mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/self.a['releaseId'],None,manifest())))
        self.env=self.stack.enter_context(mock.patch.object(window,'reconciliation_environment'))
        self.db=self.stack.enter_context(mock.patch.object(window,'reconciliation_database'))
        self.account=mock.Mock();self.closed=False
        @contextlib.contextmanager
        def accounts(_):
            try:yield self.account
            finally:self.closed=True
        self.credentials=self.stack.enter_context(mock.patch.object(window,'reconciliation_accounts',side_effect=accounts))
    def history(self):return {p.relative_to(self.path).as_posix():(p.read_bytes(),p.stat().st_mode) for p in self.path.rglob('*') if p.is_file()}
    def run_flow(self):window.reconcile(ops,self.layout,self.args)
    def rewrite_auth(self):self.auth.write_bytes(c.encoded(self.q))
    def assert_unchanged(self):
        self.assertEqual(self.layout.load(),self.state);self.assertEqual(self.history(),self.before)
        self.assertFalse((self.folder/'complete.json').exists())
    def test_integrated_success_preserves_history_and_does_not_operate_services_or_accounts(self):
        with mock.patch.object(ops,'command') as command,mock.patch.object(ops,'start_services') as start,mock.patch.object(ops,'stop_services') as stop:
            save=self.layout.save
            def checked_save(s):self.assertTrue(self.closed);save(s)
            with mock.patch.object(self.layout,'save',side_effect=checked_save):self.run_flow()
            command.assert_not_called();start.assert_not_called();stop.assert_not_called()
        self.account.unlock.assert_not_called();self.account.relock.assert_not_called();self.account.change.assert_not_called()
        self.assertEqual(self.history(),self.before);self.assertEqual(self.layout.load()['phase'],'first-activation-recovered')
        window.reconciliation_closed(self.layout,self.layout.load())
        self.assertEqual(len(list(self.folder.glob('audit-*.json'))),1)
    def test_replay_is_noop_not_fresh_audit_even_after_expiration(self):
        self.run_flow();snapshot={p.name:p.read_bytes() for p in self.folder.iterdir()};state=self.layout.load()
        self.db.reset_mock();self.credentials.reset_mock()
        with mock.patch.object(window.time,'time',return_value=time.time()+900):self.run_flow()
        self.db.assert_not_called();self.credentials.assert_not_called()
        self.assertEqual(state,self.layout.load());self.assertEqual(snapshot,{p.name:p.read_bytes() for p in self.folder.iterdir()})
    def test_unknown_expired_future_long_or_missing_authorization(self):
        cases=[('formatVersion',True),('extra',True),('expiresAt',stamp(time.time()-1)),('issuedAt',stamp(time.time()+10)),
               ('expiresAt',stamp(time.time()+700)),('externalWritersExcluded',False),('runId','0'*32),
               ('stateSha256','0'*64),('historySha256','0'*64),('releaseId','bad'),('operatorId','bad operator')]
        original=copy.deepcopy(self.q)
        for key,value in cases:
            with self.subTest(key=key,value=value):
                self.q=copy.deepcopy(original);self.q[key]=value;self.rewrite_auth()
                with self.assertRaises(c.Refused):self.run_flow()
                self.assert_unchanged()
        self.auth.unlink()
        with self.assertRaises(FileNotFoundError):self.run_flow()
        self.assert_unchanged()
    def test_duplicate_json_and_unprotected_authorization_refused(self):
        raw=self.auth.read_bytes();self.auth.write_bytes(raw[:-2]+b',"formatVersion":1}\n')
        with self.assertRaises(c.Refused):self.run_flow()
        self.auth.write_bytes(raw);self.auth.chmod(0o644)
        with self.assertRaises(c.Refused):self.run_flow()
        self.assert_unchanged()
    def test_symlink_hardlink_and_tampered_history(self):
        file=self.path/'failure.json';raw=file.read_bytes();file.write_bytes(raw+b' ')
        with self.assertRaisesRegex(c.Refused,'HISTORY_CHANGED'):self.run_flow()
        file.write_bytes(raw);link=self.path/'alias';link.symlink_to(file)
        with self.assertRaises(c.Refused):self.run_flow()
        link.unlink();os.link(file,link)
        with self.assertRaises(c.Refused):self.run_flow()
        link.unlink();self.assert_unchanged()
    def test_other_recovery_failure_and_contradictory_success_refused(self):
        f=self.path/'recovery.json';d=json.loads(f.read_bytes());d['failedControls']=['accounts'];f.write_bytes(c.encoded(d))
        self.q['historySha256']=window.recovery_history(self.path);self.rewrite_auth()
        with self.assertRaisesRegex(c.Refused,'RECOVERY_SCOPE'):self.run_flow()
        d['failedControls']=['public-page'];f.write_bytes(c.encoded(d));private_write(self.path/'verified.json',b'{}')
        self.q['historySha256']=window.recovery_history(self.path);self.rewrite_auth()
        with self.assertRaisesRegex(c.Refused,'CONTRADICTORY'):self.run_flow()
    def test_environment_database_cleanup_interrupt_and_timeout_fail_closed(self):
        for where,code in ((self.env,'TEMPORARY_PUBLIC_PROBE'),(self.env,'WRITERS_RUNNING'),(self.env,'RECONCILE_NGINX_DIVERGED'),
                           (self.db,'RUNTIME_ACCOUNT_STATE'),(self.db,'RUNTIME_SESSIONS_REMAIN'),(self.db,'MIGRATION_CHAIN_MISMATCH'),
                           (self.db,'TOOL_TIMEOUT'),(self.credentials,'RECONCILE_CREDENTIAL_CHANGED')):
            original=where.side_effect
            with self.subTest(code=code):
                where.side_effect=c.Refused(code)
                with self.assertRaisesRegex(c.Refused,code):self.run_flow()
                self.assert_unchanged()
                where.side_effect=original
        self.db.side_effect=KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):self.run_flow()
        self.assertTrue(self.closed);self.assert_unchanged()
    def test_second_environment_check_fails_without_commit(self):
        self.env.side_effect=[None,c.Refused('LATE_DRIFT')]
        with self.assertRaisesRegex(c.Refused,'LATE_DRIFT'):self.run_flow()
        self.assertTrue(self.closed);self.assert_unchanged()
    def test_expiry_during_audit_never_transitions(self):
        def expire(*_):os.kill(os.getpid(),signal.SIGALRM)
        self.db.side_effect=expire
        with self.assertRaisesRegex(c.Refused,'RECONCILE_TIMEOUT'):self.run_flow()
        self.assertTrue(self.closed);self.assert_unchanged()
    def test_history_changed_during_audit_blocks_commit(self):
        self.db.side_effect=lambda *_:private_write(self.path/'new-event',b'changed')
        with self.assertRaisesRegex(c.Refused,'HISTORY_CHANGED'):self.run_flow()
        self.assertEqual(self.layout.load(),self.state)
    def test_state_race_and_concurrency_refused(self):
        with c.exclusive_lock(self.layout.state/'operation.lock'):
            with self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):self.run_flow()
        self.assert_unchanged()
        self.db.side_effect=lambda *_:self.layout.save(dict(self.state,unexpected=True))
        with self.assertRaisesRegex(c.Refused,'STATE_RACE'):self.run_flow()
        self.assertFalse((self.folder/'complete.json').exists())
    def test_interruption_before_state_save_reaudits_and_completes(self):
        with mock.patch.object(self.layout,'save',side_effect=OSError('synthetic')):
            with self.assertRaises(OSError):self.run_flow()
        self.assert_unchanged();self.assertTrue((self.folder/'intent.json').exists())
        self.db.reset_mock();self.run_flow();self.db.assert_called_once();self.assertEqual(self.history(),self.before)
    def test_interruption_between_state_and_guard_reaudits_and_repairs_only_guard(self):
        def partial_save(state):c.atomic_json(self.layout.state/'state.json',state);raise OSError('synthetic')
        with mock.patch.object(self.layout,'save',side_effect=partial_save):
            with self.assertRaises(OSError):self.run_flow()
        with self.assertRaises((FileNotFoundError,c.Refused)):window.reconciliation_closed(self.layout,self.layout.load())
        self.db.reset_mock();self.run_flow();self.db.assert_called_once();window.reconciliation_closed(self.layout,self.layout.load())
        self.assertEqual(self.history(),self.before)
    def test_completion_write_failure_is_not_replayed_as_success(self):
        original=window.private_write
        def write(p,data):
            if p.name=='complete.json':raise OSError('synthetic')
            return original(p,data)
        with mock.patch.object(window,'private_write',side_effect=write):
            with self.assertRaises(OSError):self.run_flow()
        with self.assertRaises((FileNotFoundError,c.Refused)):window.reconciliation_closed(self.layout,self.layout.load())
        self.env.side_effect=c.Refused('LATE_UNSAFE')
        with self.assertRaisesRegex(c.Refused,'LATE_UNSAFE'):self.run_flow()
        self.assertFalse((self.folder/'complete.json').exists())
    def test_expired_partial_reconciliation_cannot_complete(self):
        with mock.patch.object(self.layout,'save',side_effect=OSError('synthetic')):
            with self.assertRaises(OSError):self.run_flow()
        with mock.patch.object(window.time,'time',return_value=time.time()+900),self.assertRaisesRegex(c.Refused,'EXPIRED'):self.run_flow()
        self.assert_unchanged()
    def test_completed_receipt_state_and_guard_tamper_refused(self):
        self.run_flow();f=self.folder/'complete.json';raw=f.read_bytes();f.write_bytes(b'{}')
        with self.assertRaises(c.Refused):self.run_flow()
        f.write_bytes(raw);self.layout.guard.write_bytes(b'{}')
        with self.assertRaisesRegex(c.Refused,'GUARD_DIVERGED'):self.run_flow()
    def test_audit_tamper_missing_and_unexpected_path_refused(self):
        self.run_flow();complete=self.folder/'complete.json';done=json.loads(complete.read_bytes())
        audit=self.folder/done['auditFile'];raw=audit.read_bytes();audit.unlink()
        with self.assertRaises(FileNotFoundError):self.run_flow()
        private_write(audit,raw+b' ')
        # JSON whitespace is not material; semantic checks and canonical hashes are.
        self.run_flow()
        d=json.loads(raw);d['checks']['accountsLocked']=False;audit.write_bytes(c.encoded(d))
        with self.assertRaisesRegex(c.Refused,'INCOMPLETE'):self.run_flow()
        audit.write_bytes(raw);done['auditFile']='../complete.json';complete.write_bytes(c.encoded(done))
        with self.assertRaisesRegex(c.Refused,'AUDIT_PATH'):self.run_flow()
    def test_completion_cannot_be_rebound_to_another_reconciliation(self):
        self.run_flow();f=self.folder/'authorization.json';d=json.loads(f.read_bytes());d['reconciliationId']='f'*32;f.write_bytes(c.encoded(d))
        with self.assertRaisesRegex(c.Refused,'COMPLETION_BINDING'):window.reconciliation_closed(self.layout,self.layout.load())
    def test_cli_unexpected_exception_is_sanitized(self):
        secret='synthetic-password mysql://private SELECT secret'
        args=['release.py','--root',str(self.h.root),'reconcile-first','--run-id',self.a['runId'],'--authorization',str(self.auth)]
        for exception,expected in ((RuntimeError(secret),'RECONCILE_FAILED'),(c.Refused(secret),'RECONCILE_REFUSED'),(c.Refused('RECONCILE_TIMEOUT'),'RECONCILE_TIMEOUT')):
            with mock.patch.dict(sys.modules,{ops.__name__:ops}),mock.patch.object(sys,'argv',args),mock.patch.object(window,'reconcile',side_effect=exception),self.assertRaises(c.Refused) as error:
                ops.main()
            self.assertEqual(str(error.exception),expected)
    def test_failed_reconciliation_does_not_serialize_secret_messages(self):
        secret='synthetic-password mysql://private SELECT secret'
        self.db.side_effect=RuntimeError(secret)
        with self.assertRaises(RuntimeError):self.run_flow()
        for p in self.h.root.rglob('*.json'):self.assertNotIn(secret,p.read_text())

class BoundaryTests(unittest.TestCase):
    def test_cli_is_manual_and_exposes_no_bypass(self):
        p=subprocess.run([sys.executable,'-I','-B',str(ROOT/'deploy/scripts/release.py'),'reconcile-first','--help'],capture_output=True,text=True)
        self.assertEqual(p.returncode,0);self.assertIn('--authorization',p.stdout)
        for token in ('--force','--skip','--password','--unlock'):self.assertNotIn(token,p.stdout)
    def test_environment_checks_reject_each_live_discrepancy(self):
        from test_activation_window import auth
        a=auth();layout=SimpleNamespace(app=Path('/synthetic/app'),web=Path('/synthetic/web'))
        raw=b'synthetic';sha=c.digest(raw);a['nginx']['before']={k:sha for k in contract.NGINX};a['nginx']['temporaryPageSha256']=sha
        def exists(p):return str(p) in contract.NGINX
        with contextlib.ExitStack() as stack:
            stopped=stack.enter_context(mock.patch.object(ops,'assert_stopped'))
            state=stack.enter_context(mock.patch.object(ops,'service_state',return_value={'ActiveState':'inactive','MainPID':'0'}))
            cmd=stack.enter_context(mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout='Enforcing')))
            stack.enter_context(mock.patch.object(window,'checked_configs'))
            stack.enter_context(mock.patch.object(window.os.path,'lexists',side_effect=exists))
            read=stack.enter_context(mock.patch.object(window,'secure_read',return_value=raw))
            probe=stack.enter_context(mock.patch.object(window,'temporary_probe'))
            window.reconciliation_environment(ops,layout,a);probe.assert_called_once()
            for target,error in ((stopped,'WRITERS_RUNNING'),(probe,'TEMPORARY_PUBLIC_PROBE'),(read,'PRIVATE_SOURCE_UNSAFE')):
                target.side_effect=c.Refused(error)
                with self.assertRaises(c.Refused):window.reconciliation_environment(ops,layout,a)
                target.side_effect=None
            state.return_value={'ActiveState':'active','MainPID':'5'}
            with self.assertRaisesRegex(c.Refused,'UNIT_RUNNING'):window.reconciliation_environment(ops,layout,a)
            state.return_value={'ActiveState':'inactive','MainPID':'0'};cmd.return_value.stdout='Permissive'
            with self.assertRaisesRegex(c.Refused,'SELINUX_REQUIRED'):window.reconciliation_environment(ops,layout,a)
    def test_textual_database_audit_is_readonly_and_requires_exact_chain(self):
        m=manifest();m['schema']['migrations']=[{'name':str(i),'sha256':'a'*64} for i in range(68)]
        rows=[dict(r,finished=1,rolledBack=0) for r in m['schema']['migrations']];source=mock.Mock();source.rows.return_value=rows
        account=mock.Mock()
        with mock.patch('backup_runtime.load_module',return_value=SimpleNamespace(Source=mock.Mock(return_value=source))):
            window.reconciliation_database(ops,Path('/synthetic'),m,account)
            self.assertTrue(source.identity.called);self.assertTrue(source.quiescent.called);account.audit.assert_called_with(True)
            self.assertTrue(source.rows.call_args.args[0].startswith('SELECT '));account.change.assert_not_called()
            for change in ('missing','unfinished','rolledback','checksum'):
                source.rows.return_value=copy.deepcopy(rows)
                if change=='missing':source.rows.return_value.pop()
                elif change=='unfinished':source.rows.return_value[0]['finished']=0
                elif change=='rolledback':source.rows.return_value[0]['rolledBack']=1
                else:source.rows.return_value[0]['sha256']='b'*64
                with self.subTest(change=change),self.assertRaisesRegex(c.Refused,'MIGRATION_CHAIN_MISMATCH'):
                    window.reconciliation_database(ops,Path('/synthetic'),m,account)


class CredentialCustodyTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.temp=tempfile.TemporaryDirectory(prefix='tf-reconcile-secret-',dir=ROOT/'build');self.root=Path(self.temp.name)
        self.addCleanup(self.temp.cleanup);self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.q={'reconciliationId':'c'*32};self.base=self.root/'run';self.base.mkdir(mode=0o700)
        cg=self.root/'cgroup';cg.write_text('0::/synthetic');swap=self.root/'sys/synthetic';swap.mkdir(parents=True);(swap/'memory.swap.max').write_text('0')
        def mapped(value):
            return {'/run/traceflow-reconciliation':self.base,'/proc/self/cgroup':cg,'/sys/fs/cgroup':self.root/'sys'}.get(str(value),Path(value))
        self.stack.enter_context(mock.patch.object(window,'Path',side_effect=mapped))
        self.stack.enter_context(mock.patch.object(window.sys.stdin,'isatty',return_value=True))
        self.stack.enter_context(mock.patch.object(window.sys.stderr,'isatty',return_value=True))
        self.stack.enter_context(mock.patch.object(window,'trusted_path',side_effect=lambda p,**_:c.trusted_path(p,directory=True,uid=os.geteuid())))
        original_read=window.secure_read
        self.stack.enter_context(mock.patch.object(window,'secure_read',side_effect=lambda p,uid,*rest:original_read(p,os.geteuid(),*rest)))
        self.password='synthetic-quote"-slash\\-only'
        self.prompt=self.stack.enter_context(mock.patch.object(window.getpass,'getpass',return_value=self.password))
        self.account=self.stack.enter_context(mock.patch.object(window,'Accounts',return_value=mock.Mock()))
    def test_secret_roundtrip_and_cleanup_before_return(self):
        import io
        output=io.StringIO();output.isatty=lambda:True
        with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
            with window.reconciliation_accounts(self.q):
                p=self.base/self.q['reconciliationId']/'admin.cnf';raw=p.read_text()
                self.assertEqual(p.stat().st_mode&0o777,0o600)
                self.assertIn('password="synthetic-quote\\"-slash\\\\-only"',raw)
        self.assertFalse((self.base/self.q['reconciliationId']).exists());self.assertEqual(output.getvalue(),'')
    def test_constructor_failure_and_sigterm_cleanup(self):
        self.account.side_effect=c.Refused('SYNTHETIC_CONNECTION_FAILURE')
        with self.assertRaises(c.Refused):
            with window.reconciliation_accounts(self.q):self.fail('unreachable')
        self.assertFalse((self.base/self.q['reconciliationId']).exists())
        self.account.side_effect=None
        with self.assertRaisesRegex(c.Refused,'OPERATION_INTERRUPTED'):
            with window.reconciliation_accounts(self.q):raise c.Refused('OPERATION_INTERRUPTED')
        self.assertFalse((self.base/self.q['reconciliationId']).exists())
    def test_residual_from_unclean_exit_is_never_reused_or_deleted(self):
        p=self.base/self.q['reconciliationId'];p.mkdir(mode=0o700);private_write(p/'admin.cnf',b'synthetic-residual')
        with self.assertRaises(FileExistsError):
            with window.reconciliation_accounts(self.q):self.fail('unreachable')
        self.prompt.assert_not_called();self.assertEqual((p/'admin.cnf').read_bytes(),b'synthetic-residual')
    def test_credential_substitution_is_refused_and_not_deleted(self):
        with self.assertRaisesRegex(c.Refused,'CREDENTIAL_CHANGED'):
            with window.reconciliation_accounts(self.q):(self.base/self.q['reconciliationId']/'admin.cnf').write_bytes(b'changed')
        self.assertEqual((self.base/self.q['reconciliationId']/'admin.cnf').read_bytes(),b'changed')
    def test_no_swap_and_tty_are_mandatory_before_password(self):
        (self.root/'sys/synthetic/memory.swap.max').write_text('max')
        with self.assertRaisesRegex(c.Refused,'SWAP'):
            with window.reconciliation_accounts(self.q):self.fail('unreachable')
        self.prompt.assert_not_called()
        with mock.patch.object(window.sys.stdin,'isatty',return_value=False),self.assertRaisesRegex(c.Refused,'TERMINAL'):
            with window.reconciliation_accounts(self.q):self.fail('unreachable')
        self.prompt.assert_not_called()

if __name__=='__main__':unittest.main()
