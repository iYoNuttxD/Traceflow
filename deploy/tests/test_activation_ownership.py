"""Local ownership protocol: real files/flock, simulated systemd/MySQL/HTTPS."""
import contextlib,copy,os,select,subprocess,sys,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_activation_window as base
import test_activation_reconciliation as reconciliation
from test_activation_window import ops,window,c,contract,manifest,stamp,ROOT
from operational_io import private_write,secure_read

class OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.h=base.WindowTests();self.h.setUp();self.addCleanup(self.h.tearDown)
        self.layout=self.h.layout;self.a=self.h.a;self.path=self.h.path
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(mock.patch.object(ops,'native_context'))
        self.stack.enter_context(mock.patch.object(ops,'emit'))
        self.stack.enter_context(mock.patch.object(window,'RUN_BASE',self.h.root/'volatile'))
        self.stack.enter_context(mock.patch.object(window,'trusted_path',side_effect=lambda p,**k:c.trusted_path(p,directory=k.get('directory'),uid=os.geteuid())))
        self.stack.enter_context(mock.patch.object(window,'secure_read',side_effect=lambda p,uid=0,*v:secure_read(p,os.geteuid(),*v)))
        self.cleanup=window.cleanup_credential
        self.credential(self.a)
    def credential(self,a):
        p=window.RUN_BASE/a['runId'];p.mkdir(mode=0o700,parents=True,exist_ok=True)
        if not (p/'admin.cnf').exists():private_write(p/'admin.cnf',b'[client]\npassword="synthetic-exclusive"\n')
        return p
    def other(self):
        h=base.WindowTests();h.__dict__.update(self.h.__dict__)
        h.a=copy.deepcopy(self.a);h.a['runId']='2'*32;h.a['nonce']='3'*32
        h.a['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+h.a['runId']
        h.path=window.run_directory(self.layout,h.a['runId']);h.path.mkdir(mode=0o700)
        private_write(h.path/'authorization.json',c.encoded(h.a));private_write(h.path/'prior-state.json',c.encoded(self.layout.load()))
        window.receipt(h.path,'prepared',h.a,expiresAt=h.a['expiresAt']);window.receipt(h.path,'submission',h.a,status='SUBMISSION_REQUESTED')
        h.account=mock.Mock();h.db=mock.Mock();h.events=[];self.credential(h.a)
        return h
    def snapshot(self,path=None):
        return {'state':(self.layout.state/'state.json').read_bytes(),'guard':self.layout.guard.read_bytes(),
            'links':{str(p):os.readlink(p) if p.is_symlink() else None for p in (self.layout.app/'current',self.layout.web/'current')},
            'history':{p.relative_to(path or self.path).as_posix():p.read_bytes() for p in (path or self.path).rglob('*') if p.is_file()},
            'credential':(window.RUN_BASE/self.a['runId']/'admin.cnf').read_bytes()}
    def finalizer(self,h=None):
        h=h or self.h
        with mock.patch.object(window,'load',return_value=(h.path,h.a)),mock.patch.object(window,'cleanup_credential',side_effect=self.cleanup):
            window.finalize(ops,self.layout,h.a['runId'])
    @contextlib.contextmanager
    def safety_mocks(self):
        with contextlib.ExitStack() as stack:
            mocks={name:stack.enter_context(mock.patch.object(window,name)) for name in ('nginx_files','nginx_reload','temporary_probe')}
            mocks['stop']=stack.enter_context(mock.patch.object(ops,'stop_services'))
            mocks['accounts']=stack.enter_context(mock.patch.object(window,'Accounts',return_value=self.h.account))
            yield mocks
    def claim(self,armed=True):
        original=window.receipt
        def write(path,event,a,**fields):
            if event=='armed' and not armed:raise c.Refused('TEST_BEFORE_ARMED')
            return original(path,event,a,**fields)
        with mock.patch.object(ops,'boot_id',return_value='test-boot'),mock.patch.object(ops,'proc_start',return_value='123'),mock.patch.object(window,'receipt',side_effect=write):
            with window.attempt_lock(self.layout,self.a['runId']),c.exclusive_lock(self.layout.state/'operation.lock'):
                window.claim_activation(ops,self.layout,self.path,self.a,self.layout.load())

    def test_two_jobs_rejected_finalizer_during_owner_run_and_after_success(self):
        b=self.other();seen=[]
        def interleave(phase):
            if phase!='postchecks-pending':return
            before=self.snapshot()
            with self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):b.run_flow()
            with mock.patch.object(window,'recover') as recovery,self.safety_mocks() as effects:
                self.finalizer(b)
                recovery.assert_not_called()
                for effect in effects.values():effect.assert_not_called()
            self.assertEqual(before,self.snapshot());self.assertFalse((window.RUN_BASE/b.a['runId']).exists())
            b.account.unlock.assert_not_called();b.account.relock.assert_not_called();seen.append(True)
        self.h.run_flow(hook=interleave)
        self.assertEqual(seen,[True]);self.assertEqual(self.layout.load()['phase'],'complete')
        before=self.snapshot();history={p.name:p.read_bytes() for p in b.path.iterdir() if p.is_file()}
        with self.safety_mocks() as effects,mock.patch.object(window,'recover') as recovery:
            self.finalizer(b);self.finalizer(b)
            recovery.assert_not_called()
            for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.snapshot());self.assertEqual(history,{p.name:p.read_bytes() for p in b.path.iterdir() if p.is_file()})
        with self.assertRaisesRegex(c.Refused,'ATTEMPT_CONSUMED'):b.run_flow()

    def test_delayed_second_start_refused_after_first_success(self):
        b=self.other();self.h.run_flow();before=self.snapshot()
        with self.assertRaisesRegex(c.Refused,'ACTIVATION_STATE_CHANGED'):b.run_flow()
        b.account.unlock.assert_not_called();b.account.relock.assert_not_called()
        with mock.patch.object(window,'recover') as recovery,self.safety_mocks() as effects:self.finalizer(b)
        recovery.assert_not_called()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.snapshot());self.assertFalse((window.RUN_BASE/b.a['runId']).exists())
        self.assertFalse((b.path/'claim.json').exists());self.assertFalse((b.path/'armed.json').exists())

    def test_successful_owner_finalizer_only_closes_credential_and_is_idempotent(self):
        self.h.run_flow();state=self.layout.load();guard=self.layout.guard.read_bytes()
        with mock.patch.object(contract,'ref',side_effect=lambda r:base.observation(c.private_json(self.path/(r['path'].split('/')[-1]+'.json')))),\
             mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/base.RID,None,manifest())),self.safety_mocks() as effects:
            self.finalizer()
            history={p.relative_to(self.path).as_posix():p.read_bytes() for p in self.path.rglob('*') if p.is_file()}
            self.finalizer()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(state,self.layout.load());self.assertEqual(guard,self.layout.guard.read_bytes())
        self.assertFalse((window.RUN_BASE/self.a['runId']).exists());self.assertTrue((self.path/'closed.json').exists())
        self.assertEqual(history,{p.relative_to(self.path).as_posix():p.read_bytes() for p in self.path.rglob('*') if p.is_file()})

    def test_two_launches_prepared_before_either_claims(self):
        fixture=SimpleNamespace(h=self.h)
        attempts=[]
        with mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/base.RID,None,manifest())):
            for char in ('4','5'):
                a=copy.deepcopy(self.a);a['runId']=char*32;a['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+a['runId']
                with reconciliation.ReconciliationTests.launch_fixture(fixture,window,a) as (args,cmd):window.launch(ops,self.layout,args)
                self.assertEqual(sum(call.args[0][0]=='systemd-run' for call in cmd.call_args_list),1)
                path=window.run_directory(self.layout,a['runId']);self.assertTrue((path/'submission.json').exists());self.assertFalse((path/'claim.json').exists())
                attempts.append(a)
        self.assertEqual(self.layout.load()['phase'],'migration-complete')
        first=base.WindowTests();first.__dict__.update(self.h.__dict__);first.a=attempts[0];first.path=window.run_directory(self.layout,first.a['runId'])
        second=base.WindowTests();second.__dict__.update(self.h.__dict__);second.a=attempts[1];second.path=window.run_directory(self.layout,second.a['runId'])
        def interleave(phase):
            if phase=='postchecks-pending':
                with self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):second.run_flow()
                before=(self.layout.state/'state.json').read_bytes()
                self.finalizer(second)
                self.assertEqual(before,(self.layout.state/'state.json').read_bytes())
        first.run_flow(hook=interleave)
        self.assertEqual(self.layout.load()['runId'],first.a['runId'])
        self.assertFalse((window.RUN_BASE/second.a['runId']).exists())
        self.assertTrue((window.RUN_BASE/first.a['runId']/'admin.cnf').exists())

    def test_claim_receipt_alone_is_not_ownership(self):
        before=self.snapshot()
        with mock.patch.object(self.layout,'save',side_effect=c.Refused('TEST_BEFORE_STATE')):
            with self.assertRaisesRegex(c.Refused,'TEST_BEFORE_STATE'):self.claim()
        self.assertTrue((self.path/'claim.json').exists());self.assertFalse(window.owns_activation(self.layout,self.path,self.a))
        with self.safety_mocks() as effects,mock.patch.object(window,'recover') as recovery:self.finalizer()
        recovery.assert_not_called()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before['state'],(self.layout.state/'state.json').read_bytes());self.assertEqual(before['guard'],self.layout.guard.read_bytes())
        self.assertFalse((window.RUN_BASE/self.a['runId']).exists())

    def test_independent_recovery_before_armed_and_after_armed(self):
        for armed in (False,True):
            child=OwnershipTests();child.setUp()
            try:
                if armed:child.claim()
                else:
                    with child.assertRaisesRegex(c.Refused,'TEST_BEFORE_ARMED'):child.claim(False)
                self.assertEqual((child.path/'armed.json').exists(),armed)
                with child.safety_mocks() as effects:
                    child.finalizer();effects['stop'].assert_called_once();child.h.account.relock.assert_called_once()
                self.assertEqual(child.layout.load()['phase'],'first-activation-recovered')
                f=c.private_json(child.path/'failure.json');self.assertEqual(f['code'],'ACTIVATION_INTERRUPTED')
                r=window.validate_recovery_receipts(child.path,child.a);self.assertEqual(r['failureSha256'],c.file_digest(child.path/'failure.json'))
                before=(child.layout.state/'state.json').read_bytes();history={p.name:p.read_bytes() for p in child.path.iterdir() if p.is_file()}
                with child.safety_mocks() as effects:child.finalizer()
                for effect in effects.values():effect.assert_not_called()
                self.assertEqual(before,(child.layout.state/'state.json').read_bytes());self.assertEqual(history,{p.name:p.read_bytes() for p in child.path.iterdir() if p.is_file()})
            finally:child.doCleanups()

    def test_state_persisted_guard_interrupted_still_recovers_owner(self):
        def split(state):
            c.atomic_json(self.layout.state/'state.json',state);raise c.Refused('TEST_GUARD_INTERRUPTED')
        with mock.patch.object(self.layout,'save',side_effect=split),self.assertRaisesRegex(c.Refused,'TEST_GUARD_INTERRUPTED'):self.claim()
        self.assertNotEqual(window.read_guard(self.layout),window.guard_projection(self.layout.load()))
        with self.safety_mocks():self.finalizer()
        self.assertEqual(window.read_guard(self.layout),window.guard_projection(self.layout.load()))
        self.assertEqual(self.layout.load()['phase'],'first-activation-recovered')

    def test_recover_directly_refuses_nonowner_before_any_effect(self):
        b=self.other();self.claim();before=self.snapshot()
        with self.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'ACTIVATION_NOT_OWNER'):
            window.recover(ops,self.layout,b.path,b.a,b.account)
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.snapshot());b.account.relock.assert_not_called()

    def test_owner_binding_tamper_refused_without_effects_or_secret_removal(self):
        self.claim();saved=self.layout.load()
        for key,value in [('activationClaimSha256','0'*64),('target','wrong'),('pid',123456),('operation','migrate')]:
            with self.subTest(key=key):
                self.layout.save(dict(saved,**{key:value}));before=self.snapshot()
                with self.safety_mocks() as effects,self.assertRaises(c.Refused):self.finalizer()
                for effect in effects.values():effect.assert_not_called()
                self.assertEqual(before,self.snapshot())
        self.layout.save(saved)

    def test_live_owner_attempt_lock_prevents_premature_finalizer(self):
        self.claim();before=self.snapshot()
        with window.attempt_lock(self.layout,self.a['runId']),self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):self.finalizer()
        self.assertEqual(before,self.snapshot())

    def test_no_owner_cleanup_symlink_cannot_touch_other_credential(self):
        b=self.other();self.claim();target=window.RUN_BASE/self.a['runId']/'admin.cnf';p=window.RUN_BASE/b.a['runId']/'admin.cnf';p.unlink();p.symlink_to(target)
        before=self.snapshot()
        with self.assertRaises(c.Refused):self.finalizer(b)
        self.assertEqual(before,self.snapshot());self.assertTrue(p.is_symlink())

    def test_cleanup_interrupted_is_retryable_without_global_recovery(self):
        b=self.other();self.claim();before=self.snapshot()
        with mock.patch.object(window,'load',return_value=(b.path,b.a)),mock.patch.object(window,'cleanup_credential',side_effect=c.Refused('TEST_CLEANUP')):
            with self.assertRaisesRegex(c.Refused,'TEST_CLEANUP'):window.finalize(ops,self.layout,b.a['runId'])
        raw=(b.path/'unowned.json').read_bytes()
        self.finalizer(b);self.assertEqual(raw,(b.path/'unowned.json').read_bytes());self.assertEqual(before,self.snapshot())

    def test_expired_preclaim_run_only_cleans_its_own_credential(self):
        b=self.other();b.a['expiresAt']=stamp(time.time()-1);(b.path/'authorization.json').write_bytes(c.encoded(b.a))
        before=self.snapshot()
        with self.assertRaises(c.Refused):b.run_flow()
        with mock.patch.object(window,'recover') as recovery:self.finalizer(b)
        recovery.assert_not_called();self.assertEqual(before,self.snapshot())

    def test_missing_submission_cannot_assume_or_mutate_global_state(self):
        (self.path/'submission.json').unlink();before=(self.layout.state/'state.json').read_bytes()
        with self.assertRaises(FileNotFoundError):self.h.run_flow()
        self.h.account.unlock.assert_not_called();self.h.account.relock.assert_not_called()
        with mock.patch.object(window,'recover') as recovery:self.finalizer()
        recovery.assert_not_called();self.assertEqual(before,(self.layout.state/'state.json').read_bytes())

    def test_completed_history_not_appended_by_late_finalizer(self):
        self.claim()
        with self.safety_mocks():self.finalizer()
        history={p.relative_to(self.path).as_posix():p.read_bytes() for p in self.path.rglob('*') if p.is_file()}
        state=self.layout.load();state.update(runId='9'*32,phase='complete',status='idle',current=base.RID);self.layout.save(state)
        with mock.patch.object(window,'recover') as recover:self.finalizer()
        recover.assert_not_called();self.assertEqual(history,{p.relative_to(self.path).as_posix():p.read_bytes() for p in self.path.rglob('*') if p.is_file()})
        self.assertEqual(state,self.layout.load())

    def test_failure_receipt_tamper_refuses_repeat_recovery(self):
        self.claim()
        with self.safety_mocks():self.finalizer()
        file=self.path/'failure.json';raw=file.read_bytes();file.write_bytes(raw+b' ')
        state=self.layout.load()
        with self.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'FAILURE_PROVENANCE'):self.finalizer()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(state,self.layout.load())

    def test_corrupt_failure_preserved_and_safety_actions_still_attempted(self):
        self.claim();private_write(self.path/'failure.json',b'{');original=(self.path/'failure.json').read_bytes()
        with self.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'RECOVERY_INCOMPLETE'):self.finalizer()
        effects['stop'].assert_called_once();self.h.account.relock.assert_called_once()
        self.assertEqual(self.layout.load()['phase'],'recovery-incomplete');self.assertEqual((self.path/'failure.json').read_bytes(),original)
        self.assertIn('failure-evidence',c.private_json(self.path/'recovery.json')['failedControls'])

    def test_failures_before_claim_before_armed_and_after_armed(self):
        for boundary in ('before-claim','before-armed','after-armed'):
            child=OwnershipTests();child.setUp();write=window.receipt
            try:
                def receipt(path,event,a,**fields):
                    if (boundary,event) in (('before-claim','claim'),('before-armed','armed')):raise c.Refused('TEST_RECEIPT_BOUNDARY')
                    result=write(path,event,a,**fields)
                    if boundary=='after-armed' and event=='armed':raise c.Refused('TEST_RECEIPT_BOUNDARY')
                    return result
                with mock.patch.object(window,'receipt',side_effect=receipt),self.assertRaisesRegex(c.Refused,'TEST_RECEIPT_BOUNDARY'):
                    child.h.run_flow()
                child.h.account.unlock.assert_not_called()
                if boundary=='before-claim':
                    child.h.account.relock.assert_not_called();self.assertEqual(child.layout.load()['phase'],'migration-complete')
                    with mock.patch.object(window,'recover') as recover:child.finalizer()
                    recover.assert_not_called()
                else:
                    child.h.account.relock.assert_called_once();self.assertEqual(child.layout.load()['phase'],'first-activation-recovered')
                    self.assertEqual(c.private_json(child.path/'failure.json')['code'],'TEST_RECEIPT_BOUNDARY')
                    self.assertEqual((child.path/'armed.json').exists(),boundary=='after-armed')
            finally:child.doCleanups()

    def test_independent_process_locks_do_not_block_nonowner_cleanup(self):
        b=self.other();self.claim();before=self.snapshot()
        program="""import sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from release_contract import exclusive_lock
with exclusive_lock(Path(sys.argv[2])),exclusive_lock(Path(sys.argv[3])):
 print('LOCKED',flush=True)
 sys.stdin.readline()
"""
        child=subprocess.Popen([sys.executable,'-I','-B','-c',program,str(ROOT/'deploy/lib'),
            str(self.layout.state/'activation-locks'/(self.a['runId']+'.lock')),str(self.layout.state/'operation.lock')],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            self.assertTrue(select.select([child.stdout],[],[],5)[0]);self.assertEqual(child.stdout.readline().strip(),'LOCKED')
            with self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):b.run_flow()
            self.finalizer(b)
            with self.assertRaisesRegex(c.Refused,'OPERATION_LOCKED'):self.finalizer()
            self.assertEqual(before,self.snapshot());self.assertFalse((window.RUN_BASE/b.a['runId']).exists())
            out,err=child.communicate('release\n',timeout=5);self.assertEqual(child.returncode,0)
        finally:
            if child.poll() is None:child.kill();child.communicate(timeout=5)

if __name__=='__main__':unittest.main()
