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

# Sanitized, unmodified OCI-07.16A observation. No MainPID exists for this timer.
TIMER_EVIDENCE=json.loads((Path(__file__).parent/'fixtures/reconciliation-systemd-timer.json').read_text())
TIMER_NAME=TIMER_EVIDENCE['timer']
TIMER_PROPERTIES=dict(TIMER_EVIDENCE['officialServiceStateResult'])
TIMER_PROPERTIES.update(dict(line.split('=',1) for line in TIMER_EVIDENCE['extraReadOnlyProperties'].splitlines()))
TIMER_FIELDS=('LoadState','ActiveState','SubState','UnitFileState','Triggers')
REAL_ENVIRONMENT=window.reconciliation_environment

def timer_output():
    # Project only the properties requested by the new read-only query, unchanged values.
    return ''.join(k+'='+TIMER_PROPERTIES[k]+'\n' for k in TIMER_FIELDS)

def timer_fixture():
    return {'type':'timer','loadState':TIMER_PROPERTIES['LoadState'],'state':TIMER_PROPERTIES['ActiveState'],
            'subState':TIMER_PROPERTIES['SubState'],'unitFileState':TIMER_PROPERTIES['UnitFileState'],
            'triggers':TIMER_PROPERTIES['Triggers']}

def environment_fixture(a):
    state={'type':'service','state':'inactive','pid':'0'}
    units={n:dict(state) for n in ('traceflow-first-'+a['runId']+'.service',
           'traceflow-recovery-backup.service','traceflow-recovery-reconcile.service')}
    units[TIMER_NAME]=timer_fixture()
    return {'services':{n:dict(state) for n in ops.SERVICES},'units':units,
        'configurationSha256':a['configurationSha256'],'nginxSha256':a['nginx']['before'],
        'localPageSha256':a['nginx']['temporaryPageSha256'],'public':{'status':200,'sha256':a['nginx']['temporaryPageSha256'],'bytes':356},
        'selinux':'Enforcing','linksAbsent':True,'nginxTestExitCode':0}

def database_fixture(m):
    return {'serverIdentity':[contract.TARGET['serverUuid'],'26.7.0-cloud',3306,'traceflow','traceflow_admin@%','`administrator`@`%`',0],
        'runtimeAudits':[{'account':u+'@10.20.1.184','tls':'TLSv1.3','privileges':'USAGE_GLOBAL_AND_SCHEMA_CRUD_ONLY','roleState':'ABSENT',
        'accountLocked':True,'sourceCount':15,'warnings':0,'stateSha256':'a'*64} for u in ('traceflow_api','traceflow_worker')],
        'migrations':{'count':68,'chainSha256':c.digest(c.encoded(m['schema']['migrations']))},'remainingSessions':[]}

class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.h=previous.WindowTests();self.h.setUp();self.layout=self.h.layout;self.path=self.h.path;self.a=self.h.a
        self.state=dict(self.layout.load(),status='intervention-required',phase='recovery-incomplete',
                        runId=self.a['runId'],target=self.a['releaseId'],operation='activate-first')
        self.layout.save(self.state)
        window.receipt(self.path,'failure',self.a,status='FAIL',code='FRONTEND_SMOKE',phase='public-cutover')
        window.receipt(self.path,'recovery',self.a,status='INTERVENTION_REQUIRED',failedControls=['public-page'],dataPreserved=True,schemaRestored=False)
        self.q={'formatVersion':2,'operation':'reconcile-first','authorizationId':'d'*32,'reconciliationId':'e'*32,
                'operatorId':'fixture-operator','runId':self.a['runId'],'releaseId':self.a['releaseId'],
                'descriptorSha256':self.a['descriptorSha256'],'issuedAt':stamp(time.time()-1),'expiresAt':stamp(time.time()+590),
                'historySha256':window.recovery_history(self.path),'stateSha256':c.digest(c.encoded(self.state)),
                'externalWritersExcluded':True,'controllerReleaseId':self.a['releaseId'],'controllerDescriptorSha256':self.a['descriptorSha256']}
        self.auth=self.h.root/'reconcile-auth.json';private_write(self.auth,c.encoded(self.q))
        self.args=SimpleNamespace(run_id=self.a['runId'],authorization=str(self.auth))
        self.folder=window.reconciliation_folder(self.layout,self.q);self.before=self.history()
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close);self.addCleanup(self.h.tearDown)
        self.stack.enter_context(mock.patch.object(ops,'native_context'))
        self.stack.enter_context(mock.patch.object(ops,'emit'))
        self.stack.enter_context(mock.patch.object(window.resource,'setrlimit'))
        self.controller=self.stack.enter_context(mock.patch.object(window,'reconciliation_controller',return_value=self.layout.releases/self.a['releaseId']/'deploy/scripts/release.py'))
        self.stack.enter_context(mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/self.a['releaseId'],None,manifest())))
        self.env=self.stack.enter_context(mock.patch.object(window,'reconciliation_environment',return_value=environment_fixture(self.a)))
        self.db=self.stack.enter_context(mock.patch.object(window,'reconciliation_database',return_value=database_fixture(manifest())))
        self.account=mock.Mock();self.account.state.return_value=[];self.closed=False
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
        self.assertFalse((self.folder/'applied.json').exists())
    def test_integrated_success_preserves_history_and_does_not_operate_services_or_accounts(self):
        with mock.patch.object(ops,'command') as command,mock.patch.object(ops,'start_services') as start,mock.patch.object(ops,'stop_services') as stop:
            save=self.layout.save
            def checked_save(s):self.assertTrue(self.closed);save(s)
            with mock.patch.object(self.layout,'save',side_effect=checked_save):self.run_flow()
            command.assert_not_called();start.assert_not_called();stop.assert_not_called()
        self.account.unlock.assert_not_called();self.account.relock.assert_not_called();self.account.change.assert_not_called()
        self.assertEqual(self.history(),self.before);self.assertEqual(self.layout.load()['phase'],window.RECONCILED_PHASE)
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
        self.assertFalse((self.folder/'applied.json').exists())
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
        original=window.publish_reconciliation
        def write(p,data):
            if p.name=='complete.json':raise OSError('synthetic')
            return original(p,data)
        with mock.patch.object(window,'publish_reconciliation',side_effect=write):
            with self.assertRaises(OSError):self.run_flow()
        self.assertEqual(self.layout.load(),self.state)
        self.assertFalse(window.first_activation_eligible(self.layout.load()))
        self.env.side_effect=c.Refused('LATE_UNSAFE')
        with self.assertRaisesRegex(c.Refused,'LATE_UNSAFE'):self.run_flow()
        self.assertFalse((self.folder/'applied.json').exists())
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
        # Completion also seals byte hashes of every new document.
        with self.assertRaisesRegex(c.Refused,'INCOMPLETE'):self.run_flow()
        audit.write_bytes(raw)
        d=json.loads(raw);d['observations'][1]['result']['runtimeAudits'][0]['accountLocked']=False;audit.write_bytes(c.encoded(d))
        with self.assertRaisesRegex(c.Refused,'AUDIT_CHANGED'):self.run_flow()
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

    @contextlib.contextmanager
    def launch_fixture(self,module,a):
        storage=self.h.evidence;storage.chmod(0o700)
        auth=self.h.root/('activation-'+a['runId']+'.json');private_write(auth,c.encoded(a))
        args=SimpleNamespace(release_id=a['releaseId'],digest=a['descriptorSha256'],authorization=str(auth))
        def command(argv,**kw):
            if argv[0]=='getenforce':value='Enforcing'
            elif argv[0]=='getsebool':value=argv[1]+' --> off'
            elif argv[0]=='semanage':value='traceflow_api_port_t tcp 3001'
            elif 'LimitCORE' in argv:value='0'
            elif 'LoadState' in argv:value='not-found'
            else:value=''
            return SimpleNamespace(stdout=value,returncode=0)
        real_path=Path
        with contextlib.ExitStack() as stack:
            old_mask=os.umask(0o077);os.umask(old_mask);stack.callback(os.umask,old_mask)
            stack.enter_context(mock.patch.object(module,'systemd_command',side_effect=lambda controller,run,seconds:['systemd-run','python3',str(controller),'run-first','--run-id',run]))
            stack.enter_context(mock.patch.object(module,'Path',side_effect=lambda p,*v:storage if str(p)=='/var/lib/traceflow/test-evidence' else real_path(p,*v)))
            stack.enter_context(mock.patch.object(module.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.geteuid())))
            stack.enter_context(mock.patch.object(module,'RUN_BASE',self.h.root/'volatile'))
            stack.enter_context(mock.patch.object(module,'trusted_path',side_effect=lambda p,**kw:c.trusted_path(p,directory=kw.get('directory'),uid=os.geteuid())))
            for name in ('pre_evidence','checked_configs','snapshot_nginx','test_candidate'):
                stack.enter_context(mock.patch.object(module,name))
            stack.enter_context(mock.patch.object(module,'authorize',return_value=time.time()+590))
            stack.enter_context(mock.patch.object(module.resource,'setrlimit'))
            stack.enter_context(mock.patch.object(module.sys.stdin,'isatty',return_value=True))
            stack.enter_context(mock.patch.object(module.sys.stderr,'isatty',return_value=True))
            stack.enter_context(mock.patch.object(module.getpass,'getpass',return_value='synthetic-only'))
            stack.enter_context(mock.patch.object(ops,'assert_stopped'))
            cmd=stack.enter_context(mock.patch.object(ops,'command',side_effect=command))
            yield args,cmd

    def test_full_reconciliation_then_authorized_activation_failure_and_next_attempt(self):
        self.run_flow();origin_state=self.layout.load();original_files=self.history()
        old_path=self.h.path
        new=copy.deepcopy(self.a);new['runId']='1'*32;new['nonce']='2'*32;new['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+new['runId']
        with self.launch_fixture(window,new) as (args,cmd):window.launch(ops,self.layout,args)
        submitted=[call.args[0] for call in cmd.call_args_list if call.args[0][0]=='systemd-run']
        self.assertEqual(len(submitted),1)
        self.assertEqual(submitted[0][-4],str(self.controller.return_value))
        self.h.a=new;self.h.path=window.run_directory(self.layout,new['runId'])
        self.assertEqual(c.private_json(self.h.path/'prior-state.json'),origin_state)
        with self.assertRaisesRegex(c.Refused,'SYNTHETIC_FAILURE'):self.h.run_flow(fail='public-cutover')
        state=self.layout.load();self.assertEqual(state['runId'],new['runId'])
        self.assertEqual(state['recoveryProof'],{'kind':'activation-recovery','runId':new['runId']})
        self.assertNotIn('reconciliationId',state)
        self.assertEqual(window.reconciliation_closed(self.layout,state),self.q)
        self.assertTrue(window.first_activation_eligible(state))
        with mock.patch.object(window,'load',return_value=(self.h.path,new)):
            window.finalize(ops,self.layout,new['runId'])
        third=copy.deepcopy(new);third['runId']='3'*32
        with self.launch_fixture(window,third) as (args,_):window.launch(ops,self.layout,args)
        self.assertEqual(c.private_json(window.run_directory(self.layout,third['runId'])/'prior-state.json'),state)
        self.assertEqual(original_files,self.history());self.assertEqual(self.path,old_path)

    def test_subsequent_recovery_requires_immutable_failure_in_provenance(self):
        self.test_full_reconciliation_then_authorized_activation_failure_and_next_attempt()
        state=self.layout.load();path=window.run_directory(self.layout,'1'*32);f=path/'failure.json';raw=f.read_bytes()
        for value in (None,raw+b' ',c.encoded(dict(c.private_json(f),runId='9'*32))):
            with self.subTest(value='missing' if value is None else 'tampered'):
                if value is None:f.unlink()
                else:f.write_bytes(value)
                with self.assertRaises((c.Refused,FileNotFoundError)):window.reconciliation_closed(self.layout,state)
                self.assertEqual(state,self.layout.load());self.assertEqual(self.history(),self.before)
                f.write_bytes(raw);f.chmod(0o600)
        self.assertEqual(window.reconciliation_closed(self.layout,state),self.q)

    def later_failed_attempt(self):
        self.run_flow();self.origin_q=copy.deepcopy(self.q)
        self.origin_files={str(p.relative_to(self.h.root)):p.read_bytes() for parent in (self.layout.state/'activations',self.layout.state/'reconciliations') for p in parent.rglob('*.json')}
        new=copy.deepcopy(self.a);new['runId']='1'*32;new['nonce']='2'*32;new['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+new['runId']
        with self.launch_fixture(window,new) as (args,_):window.launch(ops,self.layout,args)
        self.a=new;self.path=window.run_directory(self.layout,new['runId'])
        with mock.patch.object(ops,'boot_id',return_value='test-boot'),mock.patch.object(ops,'proc_start',return_value='123'):
            window.claim_activation(ops,self.layout,self.path,new,self.layout.load())
        window.receipt(self.path,'cutover',new)
        state=self.layout.load();state['phase']='postchecks-pending';self.layout.save(state)
        window.receipt(self.path,'pending',new,status='ACTIVATION_PENDING_VALIDATION')
        window.receipt(self.path,'failure',new,status='FAIL',code='OPERATION_INTERRUPTED',phase='postchecks-pending',secretsPrinted=False)
        with mock.patch.object(ops,'stop_services'),mock.patch.object(window,'nginx_files'),mock.patch.object(window,'nginx_reload'),mock.patch.object(window,'cleanup_credential'),mock.patch.object(window,'temporary_probe',side_effect=window.PublicPageFailure({'kind':'TIMEOUT'})):
            window.recover(ops,self.layout,self.path,new,self.account)
        self.assertEqual(c.private_json(self.path/'recovery.json')['publicPageFailure'],{'kind':'TIMEOUT'})
        self.state=self.layout.load();self.before=self.history()
        self.q=dict(self.origin_q,authorizationId='3'*32,reconciliationId='4'*32,runId=new['runId'],
                    stateSha256=c.digest(c.encoded(self.state)),historySha256=window.recovery_history(self.path))
        self.rewrite_auth();self.args.run_id=new['runId'];self.folder=window.reconciliation_folder(self.layout,self.q)
        self.env.return_value=environment_fixture(new);self.credentials.reset_mock();self.db.reset_mock()

    def test_later_reconciliation_preserves_prior_chain_and_replays_without_audit(self):
        self.later_failed_attempt();self.run_flow()
        self.assertEqual(window.reconciliation_closed(self.layout,self.layout.load()),self.q)
        self.assertEqual(self.before,self.history())
        for name,raw in self.origin_files.items():self.assertEqual((self.h.root/name).read_bytes(),raw)
        self.db.reset_mock();self.run_flow();self.db.assert_not_called()
        self.assertTrue(window.first_activation_eligible(self.layout.load()))
        later=copy.deepcopy(self.a);later['runId']='5'*32;later['nonce']='6'*32
        later['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+later['runId']
        with self.launch_fixture(window,later) as (args,_):window.launch(ops,self.layout,args)
        self.h.a=later;self.h.path=window.run_directory(self.layout,later['runId'])
        with self.assertRaisesRegex(c.Refused,'SYNTHETIC_FAILURE'):self.h.run_flow(fail='public-cutover')
        self.assertEqual(window.reconciliation_closed(self.layout,self.layout.load()),self.q)
        self.assertEqual(self.before,self.history())

    def test_later_reconciliation_refuses_wrong_failure_claim_or_pending(self):
        self.later_failed_attempt()
        for name,field,value in [('failure.json','code','OTHER_FAILURE'),('failure.json','phase','public-cutover'),
                ('recovery.json','claimSha256','0'*64),('pending.json','status','OTHER_STATUS'),
                ('claim.json','priorStateSha256','0'*64)]:
            with self.subTest(name=name,field=field):
                file=self.path/name;raw=file.read_bytes();data=json.loads(raw);data[field]=value;file.write_bytes(c.encoded(data))
                self.q['historySha256']=window.recovery_history(self.path);self.rewrite_auth()
                with self.assertRaises(c.Refused):self.run_flow()
                self.assertEqual(self.state,self.layout.load());self.credentials.assert_not_called()
                file.write_bytes(raw)

    def test_later_reconciliation_requires_preserved_origin_proof(self):
        self.later_failed_attempt()
        origin=window.reconciliation_folder(self.layout,self.origin_q)/'applied.json';raw=origin.read_bytes();origin.write_bytes(b'{}')
        with self.assertRaises(c.Refused):self.run_flow()
        self.assert_unchanged();self.credentials.assert_not_called();origin.write_bytes(raw)
        self.run_flow();self.assertEqual(window.reconciliation_closed(self.layout,self.layout.load()),self.q)

    def test_later_reconciliation_interrupt_before_guard_reaudits(self):
        self.later_failed_attempt()
        def partial(state):c.atomic_json(self.layout.state/'state.json',state);raise OSError('synthetic')
        with mock.patch.object(self.layout,'save',side_effect=partial),self.assertRaises(OSError):self.run_flow()
        with self.assertRaises((c.Refused,FileNotFoundError)):window.reconciliation_closed(self.layout,self.layout.load())
        self.db.reset_mock();self.run_flow();self.db.assert_called_once()
        self.assertEqual(self.before,self.history());window.reconciliation_closed(self.layout,self.layout.load())

    def test_later_origin_change_during_audit_refuses_commit(self):
        self.later_failed_attempt()
        file=window.reconciliation_folder(self.layout,self.origin_q)/'applied.json'
        def change(*_):file.write_bytes(b'{}');return database_fixture(manifest())
        self.db.side_effect=change
        with self.assertRaises(c.Refused):self.run_flow()
        self.assert_unchanged()

    def test_launch_submits_selected_controller_not_historical_runtime(self):
        self.run_flow();new=copy.deepcopy(self.a);new['runId']='1'*32
        selected=Path('/opt/traceflow/releases')/('20261018T060000Z-'+'f'*40+'-'+'e'*12)/'deploy/scripts/release.py'
        self.controller.return_value=selected
        with self.launch_fixture(window,new) as (args,cmd):window.launch(ops,self.layout,args)
        submitted=[call.args[0] for call in cmd.call_args_list if call.args[0][0]=='systemd-run']
        self.assertEqual(submitted[0][-4],str(selected))
        real=window.systemd_command(selected,new['runId'],120)
        self.assertIn('--property=ExecStopPost=/usr/bin/python3 -I -B '+str(selected)+' finalize-first --run-id '+new['runId'],real)
        self.assertEqual(real[-4],str(selected))

    def test_legacy_controller_refuses_completed_v2_state(self):
        import importlib.util
        source=subprocess.check_output(['git','show','401f130461c87c254075f4b0a3a40e1a2feca40b:deploy/lib/activation_window.py'],cwd=ROOT)
        path=self.h.root/'legacy.py';private_write(path,source)
        spec=importlib.util.spec_from_file_location('legacy_activation_fixture',path);legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
        self.run_flow();new=copy.deepcopy(self.a);new['runId']='1'*32
        with self.launch_fixture(legacy,new) as (args,cmd),self.assertRaisesRegex(c.Refused,'FIRST_ACTIVATION_ONLY'):
            legacy.launch(ops,self.layout,args)
        self.assertFalse(any(call.args[0][0]=='systemd-run' for call in cmd.call_args_list))

    def test_initial_guard_missing_divergent_malformed_and_extra_never_repaired(self):
        original=self.layout.guard.read_bytes()
        for bad in (None,b'{}',b'{',c.encoded(dict(window.guard_projection(self.state),extra=True)),c.encoded(dict(window.guard_projection(self.state),status='idle'))):
            with self.subTest(bad=bad):
                if bad is None:self.layout.guard.unlink()
                else:self.layout.guard.write_bytes(bad)
                self.db.reset_mock()
                with self.assertRaises((c.Refused,FileNotFoundError,ValueError)):self.run_flow()
                self.db.assert_not_called();self.assertEqual(self.layout.load(),self.state)
                self.assertEqual(self.layout.guard.read_bytes() if self.layout.guard.exists() else None,bad)
                self.layout.guard.write_bytes(original);self.layout.guard.chmod(0o644)

    def test_known_guard_repair_has_its_own_bound_receipt(self):
        def partial(state):c.atomic_json(self.layout.state/'state.json',state);raise OSError('synthetic')
        with mock.patch.object(self.layout,'save',side_effect=partial),self.assertRaises(OSError):self.run_flow()
        self.assertEqual(self.layout.load()['status'],window.RECONCILED_STATUS)
        self.assertTrue((self.folder/'complete.json').exists());self.assertFalse((self.folder/'applied.json').exists())
        self.run_flow();repairs=list(self.folder.glob('guard-repair-*.json'));self.assertEqual(len(repairs),1)
        r=c.private_json(repairs[0]);self.assertEqual(r['reason'],'KNOWN_STATE_BEFORE_GUARD_INTERRUPTION')
        self.assertEqual(r['fromGuardSha256'],c.digest(c.encoded(window.guard_projection(self.state))))
        self.assertEqual(r['toGuardSha256'],c.digest(c.encoded(window.guard_projection(self.layout.load()))))
        self.assertEqual(r['completeSha256'],c.digest(c.encoded(c.private_json(self.folder/'complete.json'))))

    def test_guard_divergence_after_known_partial_still_refused(self):
        def partial(state):c.atomic_json(self.layout.state/'state.json',state);raise OSError('synthetic')
        with mock.patch.object(self.layout,'save',side_effect=partial),self.assertRaises(OSError):self.run_flow()
        self.layout.guard.write_bytes(c.encoded(dict(window.guard_projection(self.state),pid=998)))
        self.db.reset_mock()
        with self.assertRaisesRegex(c.Refused,'GUARD_DIVERGED'):self.run_flow()
        self.db.assert_not_called();self.assertFalse(list(self.folder.glob('guard-repair-*.json')))

    def test_every_observation_is_required_and_derived(self):
        self.env.return_value=None
        with self.assertRaisesRegex(c.Refused,'ENV_OBSERVATION'):self.run_flow()
        self.assert_unchanged();self.env.return_value=environment_fixture(self.a)
        self.db.return_value=None
        with self.assertRaisesRegex(c.Refused,'DB_OBSERVATION'):self.run_flow()
        self.assert_unchanged();self.db.return_value=database_fixture(manifest())
        self.run_flow();done=c.private_json(self.folder/'complete.json');audit=c.private_json(self.folder/done['auditFile'])
        self.assertNotIn('checks',audit)
        self.assertEqual([v['kind'] for v in audit['observations']],list(window.OBSERVATION_ORDER))
        self.assertEqual(audit['observations'][0]['result'],self.env.return_value)
        self.assertEqual(audit['observations'][1]['result'],self.db.return_value)
        intent=c.private_json(self.folder/'intent.json')
        for mutation in ('missing','reorder','future','unknown','warning','excessive','sessions'):
            obs=copy.deepcopy(audit['observations'])
            if mutation=='missing':obs.pop()
            elif mutation=='reorder':obs.reverse()
            elif mutation=='future':obs[1]['finishedAt']=stamp(time.time()+900)
            elif mutation=='unknown':obs[0]['result']['unknown']=True
            elif mutation=='warning':obs[1]['result']['runtimeAudits'][0]['warnings']=1
            elif mutation=='excessive':obs[1]['result']['runtimeAudits'][0]['privileges']='ALL'
            else:obs[3]['result']['remainingSessions']=[123]
            with self.subTest(mutation=mutation),self.assertRaises(c.Refused):window.validate_observations(obs,self.q,self.a,intent)

    def test_real_timer_receipt_is_sealed_and_typed_tampering_refused(self):
        with mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=timer_output())):
            self.env.return_value['units'][TIMER_NAME]=window.reconciliation_timer_state(ops)
        self.run_flow()
        done=c.private_json(self.folder/'complete.json');audit=c.private_json(self.folder/done['auditFile'])
        intent=c.private_json(self.folder/'intent.json')
        window.validate_observations(audit['observations'],self.q,self.a,intent)
        for obs in (audit['observations'][0],audit['observations'][2]):
            self.assertEqual(obs['result']['units'][TIMER_NAME],timer_fixture())
            self.assertNotIn('pid',obs['result']['units'][TIMER_NAME])
        for change in ('timer-as-service','service-as-timer','legacy-timer','legacy-service','extra-pid',
                       'enabled','missing-disabled','unknown-type','swapped-names','substate','load-state','trigger'):
            observations=copy.deepcopy(audit['observations']);env=observations[0]['result'];timer=env['units'][TIMER_NAME]
            if change=='timer-as-service':timer['type']='service'
            elif change=='service-as-timer':env['services'][ops.SERVICES[0]]=timer_fixture()
            elif change=='legacy-timer':env['units'][TIMER_NAME]={'state':'inactive','pid':'0'}
            elif change=='legacy-service':env['services'][ops.SERVICES[0]].pop('type')
            elif change=='extra-pid':timer['pid']='0'
            elif change=='enabled':timer['unitFileState']='enabled'
            elif change=='missing-disabled':timer.pop('unitFileState')
            elif change=='unknown-type':timer['type']='socket'
            elif change=='swapped-names':
                env['units'][TIMER_NAME],env['units']['traceflow-recovery-backup.service']=env['units']['traceflow-recovery-backup.service'],timer
            elif change=='substate':timer['subState']='waiting'
            elif change=='load-state':timer['loadState']='not-found'
            else:timer['triggers']='other.service'
            with self.subTest(change=change),self.assertRaisesRegex(c.Refused,'UNIT_OBSERVATION'):
                window.validate_observations(observations,self.q,self.a,intent)
        self.assertEqual(self.history(),self.before)
        window.reconciliation_closed(self.layout,self.layout.load())

    def test_invalid_timer_is_refused_before_credential_sql_or_receipt(self):
        before_guard=self.layout.guard.read_bytes()
        self.env.side_effect=REAL_ENVIRONMENT
        with mock.patch.object(ops,'assert_stopped'),mock.patch.object(ops,'service_state',return_value={'ActiveState':'inactive','MainPID':'0'}), \
             mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=timer_output().replace('UnitFileState=disabled','UnitFileState=enabled'))):
            with self.assertRaisesRegex(c.Refused,'RECONCILE_TIMER_STATE'):self.run_flow()
        self.credentials.assert_not_called();self.db.assert_not_called();self.account.state.assert_not_called()
        self.assert_unchanged();self.assertEqual(self.layout.guard.read_bytes(),before_guard)
        self.assertFalse(self.folder.exists())

    def test_after_applied_before_result_is_historical_noop(self):
        with mock.patch.object(ops,'emit',side_effect=OSError('synthetic')),self.assertRaises(OSError):self.run_flow()
        before={p.name:p.read_bytes() for p in self.folder.iterdir()};self.db.reset_mock()
        self.run_flow();self.db.assert_not_called()
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.folder.iterdir()})

    def test_state_or_guard_temporary_residue_requires_intervention(self):
        for directory in (self.layout.state,self.layout.guard.parent):
            p=directory/'.write-synthetic';private_write(p,b'partial synthetic state')
            with self.assertRaisesRegex(c.Refused,'STATE_RESIDUE'):self.run_flow()
            self.assertEqual(p.read_bytes(),b'partial synthetic state');self.assert_unchanged()
            p.unlink()  # Fixture-only cleanup; production code never removes the residue.

    def test_forged_guard_ahead_of_state_is_not_known_interruption(self):
        with mock.patch.object(self.layout,'save',side_effect=OSError('synthetic')),self.assertRaises(OSError):self.run_flow()
        intent=c.private_json(self.folder/'intent.json')
        self.layout.guard.write_bytes(c.encoded(window.guard_projection(intent['afterState'])))
        self.db.reset_mock()
        with self.assertRaisesRegex(c.Refused,'GUARD_DIVERGED'):self.run_flow()
        self.db.assert_not_called();self.assertEqual(self.layout.load(),self.state)

    def test_incomplete_publication_blocks_current_controller_launch(self):
        original=window.publish_reconciliation
        def publish(path,value):
            if path.name=='applied.json':raise OSError('synthetic')
            return original(path,value)
        with mock.patch.object(window,'publish_reconciliation',side_effect=publish),self.assertRaises(OSError):self.run_flow()
        self.assertEqual(self.layout.load()['status'],window.RECONCILED_STATUS)
        new=copy.deepcopy(self.a);new['runId']='1'*32
        with self.launch_fixture(window,new) as (args,cmd),self.assertRaises(FileNotFoundError):window.launch(ops,self.layout,args)
        self.assertFalse(any(call.args[0][0]=='systemd-run' for call in cmd.call_args_list))

    def test_partial_receipt_blocks_without_overwriting_evidence(self):
        original=window.private_write
        def write(path,raw):
            if path.name.startswith('.pending-intent.json'):
                original(path,raw[:17]);raise OSError('synthetic power loss')
            return original(path,raw)
        with mock.patch.object(window,'private_write',side_effect=write),self.assertRaises(OSError):self.run_flow()
        residuals={p.name:p.read_bytes() for p in self.folder.iterdir()};self.db.reset_mock()
        with self.assertRaisesRegex(c.Refused,'PUBLICATION_RESIDUE'):self.run_flow()
        self.db.assert_not_called();self.assertEqual(self.layout.load(),self.state)
        self.assertEqual(residuals,{p.name:p.read_bytes() for p in self.folder.iterdir()})


class BoundaryTests(unittest.TestCase):
    def test_cli_is_manual_and_exposes_no_bypass(self):
        p=subprocess.run([sys.executable,'-I','-B',str(ROOT/'deploy/scripts/release.py'),'reconcile-first','--help'],capture_output=True,text=True)
        self.assertEqual(p.returncode,0);self.assertIn('--authorization',p.stdout)
        for token in ('--force','--skip','--password','--unlock'):self.assertNotIn(token,p.stdout)
    def test_controller_requires_pinned_verified_source_and_matching_schema(self):
        q={'controllerReleaseId':previous.RID,'controllerDescriptorSha256':'d'*64}
        root=Path('/synthetic/releases')/previous.RID;entry=root/'deploy/scripts/release.py';module=root/'deploy/lib/activation_window.py'
        layout=mock.Mock();cm=manifest();layout.installed.return_value=(root,None,cm)
        runner=SimpleNamespace(__file__=str(entry))
        with mock.patch.object(window,'__file__',str(module)):
            self.assertEqual(window.reconciliation_controller(runner,layout,q,manifest()),entry)
            layout.installed.assert_called_with(q['controllerReleaseId'],q['controllerDescriptorSha256'])
            runner.__file__='/other/release.py'
            with self.assertRaisesRegex(c.Refused,'CONTROLLER_SELECTION'):window.reconciliation_controller(runner,layout,q,manifest())
            runner.__file__=str(entry);cm['sourceState']='candidate'
            with self.assertRaisesRegex(c.Refused,'CONTROLLER_SCHEMA'):window.reconciliation_controller(runner,layout,q,manifest())
            cm['sourceState']='committed';cm['schema']={'different':True}
            with self.assertRaisesRegex(c.Refused,'CONTROLLER_SCHEMA'):window.reconciliation_controller(runner,layout,q,manifest())
        layout.installed.return_value=(root,None,manifest())
        with self.assertRaisesRegex(c.Refused,'CONTROLLER_SELECTION'):window.reconciliation_controller(runner,layout,q,manifest())

    def test_environment_checks_reject_each_live_discrepancy(self):
        from test_activation_window import auth
        a=auth();layout=SimpleNamespace(app=Path('/synthetic/app'),web=Path('/synthetic/web'))
        raw=b'synthetic';sha=c.digest(raw);a['nginx']['before']={k:sha for k in contract.NGINX};a['nginx']['temporaryPageSha256']=sha
        def exists(p):return str(p) in contract.NGINX
        with contextlib.ExitStack() as stack:
            stopped=stack.enter_context(mock.patch.object(ops,'assert_stopped'))
            state=stack.enter_context(mock.patch.object(ops,'service_state',return_value={'ActiveState':'inactive','MainPID':'0'}))
            cmd=stack.enter_context(mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout='Enforcing',returncode=0)))
            cmd.side_effect=lambda argv,**kw: SimpleNamespace(stdout=timer_output(),returncode=0) if argv[:2]==['systemctl','show'] else cmd.return_value
            stack.enter_context(mock.patch.object(window,'checked_configs',return_value=a['configurationSha256']))
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
        account=mock.Mock();account.audit.return_value=database_fixture(m)['runtimeAudits'];account.state.return_value=[]
        source.rows.side_effect=lambda sql: [database_fixture(m)['serverIdentity']] if sql.startswith('SELECT JSON_ARRAY') else source.rows.return_value
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


class UnitContractTests(unittest.TestCase):
    def test_oci_timer_without_pid_passes_exact_readonly_query(self):
        self.assertNotIn('MainPID',TIMER_PROPERTIES)
        self.assertEqual(TIMER_EVIDENCE['officialServiceStateResult'],{'LoadState':'loaded','ActiveState':'inactive','SubState':'dead'})
        with mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=timer_output())) as command:
            value=window.reconciliation_timer_state(ops)
        self.assertEqual(value,timer_fixture());self.assertNotIn('pid',value)
        expected=['systemctl','show',TIMER_NAME]
        for field in TIMER_FIELDS:expected.extend(('-p',field))
        command.assert_called_once_with(expected,timeout=10)
        self.assertNotIn('MainPID',expected)

    def test_timer_rejects_active_unknown_disabled_and_trigger_discrepancies(self):
        cases={'LoadState':['not-found','masked','error',''],
               'ActiveState':['active','activating','failed','unknown',''],
               'SubState':['waiting','elapsed','running','failed',''],
               'UnitFileState':['enabled','enabled-runtime','static','masked',''],
               'Triggers':['other.service','traceflow-recovery-backup.service other.service','']}
        for key,values in cases.items():
            for value in values:
                rows={k:TIMER_PROPERTIES[k] for k in TIMER_FIELDS};rows[key]=value
                raw=''.join(k+'='+v+'\n' for k,v in rows.items())
                with self.subTest(key=key,value=value),mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=raw)):
                    with self.assertRaisesRegex(c.Refused,'RECONCILE_TIMER_STATE'):window.reconciliation_timer_state(ops)

    def test_timer_rejects_every_missing_property(self):
        for missing in TIMER_FIELDS:
            raw=''.join(k+'='+TIMER_PROPERTIES[k]+'\n' for k in TIMER_FIELDS if k!=missing)
            with self.subTest(missing=missing),mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=raw)):
                with self.assertRaisesRegex(c.Refused,'TIMER_PROPERTIES'):window.reconciliation_timer_state(ops)

    def test_timer_rejects_duplicate_extra_pid_and_malformed_output(self):
        for raw in ('',timer_output()+'ActiveState=inactive\n',timer_output()+'MainPID=0\n',timer_output()+'unknown=x\n',
                    timer_output()+'broken\n',timer_output()+'\n'):
            with self.subTest(raw=raw),mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout=raw)):
                with self.assertRaisesRegex(c.Refused,'TIMER_PROPERTIES'):window.reconciliation_timer_state(ops)

    def test_timer_query_failure_cannot_approve(self):
        for error in (c.Refused('COMMAND_FAILED_systemctl'),subprocess.TimeoutExpired('synthetic',10)):
            with self.subTest(error=type(error).__name__),mock.patch.object(ops,'command',side_effect=error):
                with self.assertRaises(type(error)):window.reconciliation_timer_state(ops)

    def test_services_require_demonstrable_zero_pid_and_stopped_state(self):
        for state in ('inactive','failed'):
            window.validate_reconciliation_unit('traceflow-api.service',{'type':'service','state':state,'pid':'0'})
        for value in (None,0,False,True,'','00','-1','1','123','0\n'):
            with self.subTest(pid=value),self.assertRaisesRegex(c.Refused,'UNIT_OBSERVATION'):
                window.validate_reconciliation_unit('traceflow-api.service',{'type':'service','state':'inactive','pid':value})
        for state in ('active','activating','deactivating','reloading','unknown',None):
            with self.subTest(state=state),self.assertRaisesRegex(c.Refused,'UNIT_OBSERVATION'):
                window.validate_reconciliation_unit('traceflow-api.service',{'type':'service','state':state,'pid':'0'})
        with self.assertRaisesRegex(c.Refused,'UNIT_OBSERVATION'):
            window.validate_reconciliation_unit('traceflow-api.service',{'type':'service','state':'inactive'})

    def test_unit_name_binds_type_no_generic_missing_pid_exception(self):
        for name,value in [('traceflow-api.service',timer_fixture()),(TIMER_NAME,{'type':'service','state':'inactive','pid':'0'}),
                           ('other.timer',timer_fixture()),('traceflow.socket',{'type':'service','state':'inactive','pid':'0'})]:
            with self.subTest(name=name),self.assertRaisesRegex(c.Refused,'UNIT_OBSERVATION'):
                window.validate_reconciliation_unit(name,value)

    def test_full_environment_collects_real_timer_without_querying_service_pid(self):
        a=previous.auth();raw=b'synthetic';sha=c.digest(raw)
        a['nginx']['before']={k:sha for k in contract.NGINX};a['nginx']['temporaryPageSha256']=sha
        layout=SimpleNamespace(app=Path('/synthetic/app'),web=Path('/synthetic/web'))
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(ops,'assert_stopped'))
            states=stack.enter_context(mock.patch.object(ops,'service_state',return_value={'ActiveState':'inactive','MainPID':'0'}))
            commands=stack.enter_context(mock.patch.object(ops,'command',side_effect=lambda argv,**kw:
                SimpleNamespace(stdout=timer_output() if argv[:2]==['systemctl','show'] else 'Enforcing',returncode=0)))
            stack.enter_context(mock.patch.object(window,'checked_configs',return_value=a['configurationSha256']))
            stack.enter_context(mock.patch.object(window.os.path,'lexists',side_effect=lambda p:str(p) in contract.NGINX))
            stack.enter_context(mock.patch.object(window,'secure_read',return_value=raw))
            stack.enter_context(mock.patch.object(window,'temporary_probe',return_value={'status':200,'sha256':sha,'bytes':356}))
            result=window.reconciliation_environment(ops,layout,a)
            self.assertEqual(result['units'][TIMER_NAME],timer_fixture())
            self.assertEqual(result['services']['traceflow-api.service'],{'type':'service','state':'inactive','pid':'0'})
            self.assertEqual(len(states.call_args_list),5)
            self.assertTrue(all(call.args[0].endswith('.service') for call in states.call_args_list))
            self.assertEqual([call.args[0] for call in commands.call_args_list][0][:3],['systemctl','show',TIMER_NAME])
            for bad in ({'ActiveState':'inactive'},{'ActiveState':'active','MainPID':'0'},
                        {'ActiveState':'inactive','MainPID':'19'},{'ActiveState':'inactive','MainPID':0}):
                states.return_value=bad;commands.reset_mock()
                with self.subTest(service=bad),self.assertRaisesRegex(c.Refused,'RECONCILE_UNIT_RUNNING'):
                    window.reconciliation_environment(ops,layout,a)
                commands.assert_not_called()


class AtomicReceiptTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp=tempfile.TemporaryDirectory(prefix='tf-reconcile-atomic-',dir=ROOT/'build');self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
    def test_success_is_exclusive_and_never_overwrites(self):
        p=self.root/'complete.json';window.publish_reconciliation(p,{'a':1});raw=p.read_bytes()
        self.assertEqual(p.stat().st_nlink,1);self.assertEqual(p.stat().st_mode&0o777,0o600)
        with self.assertRaises(FileExistsError):window.publish_reconciliation(p,{'a':2})
        self.assertEqual(p.read_bytes(),raw);self.assertTrue(list(self.root.glob('.pending-*')))
    def test_every_document_and_persistence_boundary(self):
        for name in ('authorization.json','intent.json','audit-'+'a'*32+'.json','complete.json','applied.json'):
            for boundary in ('before-create','empty','partial','before-file-fsync','before-link','after-link','after-unlink'):
                with self.subTest(name=name,boundary=boundary):
                    folder=self.root/(name+'-'+boundary);folder.mkdir(mode=0o700);dest=folder/name
                    raw=c.encoded({'synthetic':'complete-value'});original=window.private_write;original_link=os.link;original_unlink=Path.unlink
                    def writer(p,data):
                        if boundary=='before-create':raise OSError('synthetic')
                        if boundary in ('empty','partial'):
                            original(p,b'' if boundary=='empty' else data[:8]);raise OSError('synthetic')
                        original(p,data)
                    def link(src,dst,**kw):
                        if boundary=='before-link':raise OSError('synthetic')
                        original_link(src,dst,**kw)
                        if boundary=='after-link':raise OSError('synthetic')
                    def unlink(p,*args,**kw):
                        original_unlink(p,*args,**kw)
                        if boundary=='after-unlink':raise OSError('synthetic')
                    with contextlib.ExitStack() as stack:
                        stack.enter_context(mock.patch.object(window,'private_write',side_effect=writer))
                        stack.enter_context(mock.patch.object(window.os,'link',side_effect=link))
                        stack.enter_context(mock.patch.object(Path,'unlink',unlink))
                        if boundary=='before-file-fsync':stack.enter_context(mock.patch.object(os,'fsync',side_effect=OSError('synthetic')))
                        with self.assertRaises(OSError):window.publish_reconciliation(dest,{'synthetic':'complete-value'})
                    if dest.exists():self.assertEqual(dest.read_bytes(),raw)
                    leftovers=list(folder.glob('.pending-*'))
                    if boundary not in ('before-create','after-unlink'):self.assertTrue(leftovers)
                    if boundary=='after-link':self.assertEqual(dest.stat().st_nlink,2)
                    if boundary=='after-unlink':
                        self.assertEqual(dest.stat().st_nlink,1);window.reconciliation_inventory(folder)
                    elif boundary!='before-create':
                        with self.assertRaises(c.Refused):window.reconciliation_inventory(folder)
    def test_real_child_interruption_preserves_unpublished_partial_receipt(self):
        code="""import os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import activation_window as w
p=Path(sys.argv[2])
def interrupted(path,raw):
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    os.write(fd,raw[:5])
    os._exit(17)
w.private_write=interrupted
w.publish_reconciliation(p,{'synthetic':'not a production receipt'})
"""
        p=self.root/'complete.json'
        child=subprocess.run([sys.executable,'-I','-B','-c',code,str(ROOT/'deploy/lib'),str(p)],
                             capture_output=True,timeout=5,env={'PATH':'/usr/bin:/bin'})
        self.assertEqual(child.returncode,17);self.assertEqual(child.stdout+child.stderr,b'')
        self.assertFalse(p.exists());residue=list(self.root.glob('.pending-*'));self.assertEqual(len(residue),1)
        saved=residue[0].read_bytes()
        with self.assertRaisesRegex(c.Refused,'PUBLICATION_RESIDUE'):window.reconciliation_inventory(self.root)
        self.assertEqual(saved,residue[0].read_bytes())

    def test_final_directory_fsync_failure_is_revalidated(self):
        p=self.root/'complete.json';original=window.fsync_dir;calls=[]
        def sync(path):
            calls.append(path)
            if len(calls)==2:raise OSError('synthetic')
            original(path)
        with mock.patch.object(window,'fsync_dir',side_effect=sync),self.assertRaises(OSError):window.publish_reconciliation(p,{'a':1})
        self.assertEqual(json.loads(p.read_bytes()),{'a':1})
        with mock.patch.object(window,'fsync_dir',wraps=original) as check:window.reconciliation_inventory(self.root)
        check.assert_called_once_with(self.root)


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
