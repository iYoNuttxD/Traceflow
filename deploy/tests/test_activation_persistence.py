"""Interrupted state writes: local files/processes, mocked operational boundaries."""
import contextlib,copy,importlib.util,os,subprocess,sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import test_activation_ownership as ownership
import test_activation_reconciliation as reconciliation
from test_activation_window import ops,window,c,ROOT,manifest
from operational_io import private_write

class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.h=ownership.OwnershipTests();self.h.setUp();self.addCleanup(self.h.doCleanups)
        self.layout=self.h.layout;self.path=self.h.path;self.a=self.h.a
    def residue(self,scope):
        p=(self.layout.state if scope=='state' else self.layout.guard.parent)/'.write-synthetic'
        private_write(p,b'interrupted synthetic state, not an instruction');return p
    def state_bytes(self):return ((self.layout.state/'state.json').read_bytes(),self.layout.guard.read_bytes())
    def launch(self,module=window,char='4'):
        a=copy.deepcopy(self.a);a['runId']=char*32;a['nginx']['candidateDirectory']='/etc/traceflow/activation-candidates/'+a['runId']
        fixture=SimpleNamespace(h=self.h.h)
        with mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/a['releaseId'],None,manifest())):
            with reconciliation.ReconciliationTests.launch_fixture(fixture,module,a) as (args,cmd):module.launch(ops,self.layout,args)
        return a,cmd
    def test_launch_rejects_state_and_guard_residues_before_preparation(self):
        for scope,char in (('state','4'),('guard','5')):
            with self.subTest(scope=scope):
                p=self.residue(scope);raw=p.read_bytes();before=self.state_bytes()
                with self.assertRaisesRegex(c.Refused,'ACTIVATION_PERSISTENCE_RESIDUE'):self.launch(char=char)
                self.assertEqual(before,self.state_bytes());self.assertEqual(raw,p.read_bytes())
                self.assertFalse(window.run_directory(self.layout,char*32).exists())
                p.unlink()  # Fixture-only; no production cleanup path exists.
    def test_residue_created_after_submission_prevents_claim(self):
        p=self.residue('guard');before=self.state_bytes()
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.h.run_flow()
        self.h.h.account.unlock.assert_not_called();self.h.h.account.relock.assert_not_called()
        self.assertFalse((self.path/'claim.json').exists());self.assertEqual(before,self.state_bytes());self.assertTrue(p.exists())
    def test_proven_owner_containment_preserves_ambiguous_state_and_guard(self):
        for scope in ('state','guard'):
            child=PersistenceTests();child.setUp()
            try:
                child.h.claim();p=child.residue(scope);raw=p.read_bytes();before=child.state_bytes()
                with child.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):child.h.finalizer()
                effects['stop'].assert_called_once();effects['nginx_files'].assert_called_once();child.h.h.account.relock.assert_called_once()
                self.assertEqual(before,child.state_bytes());self.assertEqual(raw,p.read_bytes())
                r=c.private_json(child.path/'recovery.json');self.assertEqual(r['status'],'INTERVENTION_REQUIRED');self.assertFalse(r['formalRecovery'])
                self.assertEqual(r['failedControls'],['state-persistence']);self.assertIn(scope,r['persistence']['initial'])
                self.assertFalse((window.RUN_BASE/child.a['runId']).exists())
            finally:child.doCleanups()
    def test_repeat_containment_does_not_rewrite_original_recovery(self):
        self.h.claim();p=self.residue('state');before=self.state_bytes()
        with self.h.safety_mocks(),self.assertRaises(c.Refused):self.h.finalizer()
        original=(self.path/'recovery.json').read_bytes()
        with self.h.safety_mocks() as effects,self.assertRaises(c.Refused):self.h.finalizer()
        effects['stop'].assert_called_once();self.assertEqual(original,(self.path/'recovery.json').read_bytes())
        self.assertEqual(len(list(self.path.glob('containment-*.json'))),1);self.assertEqual(before,self.state_bytes());self.assertTrue(p.exists())
    def test_state_save_failure_does_not_suppress_containment(self):
        self.h.claim();before=self.state_bytes()
        with mock.patch.object(self.layout,'save',side_effect=OSError('synthetic persistence failure')),self.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'RECOVERY_INCOMPLETE'):
            self.h.finalizer()
        effects['stop'].assert_called_once();self.h.h.account.relock.assert_called_once();self.assertEqual(before,self.state_bytes())
        self.assertIn('state-persistence',c.private_json(self.path/'recovery.json')['failedControls'])
    def test_detector_failure_does_not_suppress_owner_containment(self):
        self.h.claim();before=self.state_bytes()
        with mock.patch.object(window,'persistence_residues',side_effect=OSError('synthetic unreadable directory')),self.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.finalizer()
        effects['stop'].assert_called_once();self.h.h.account.relock.assert_called_once();self.assertEqual(before,self.state_bytes())
        self.assertEqual(c.private_json(self.path/'recovery.json')['persistence']['initial'],{'unverified':True})
    def test_transient_scan_error_cannot_turn_into_formal_success(self):
        self.h.claim();before=self.state_bytes()
        scan=window.persistence_residues;calls=[]
        def transient(layout):
            calls.append(True)
            if len(calls)==1:raise OSError('synthetic first scan failure')
            return scan(layout)
        with mock.patch.object(window,'persistence_residues',side_effect=transient),self.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.finalizer()
        effects['stop'].assert_called_once();self.h.h.account.relock.assert_called_once();self.assertEqual(before,self.state_bytes())
        r=c.private_json(self.path/'recovery.json');self.assertFalse(r['formalRecovery']);self.assertEqual(r['persistence']['initial'],{'unverified':True})

    def test_residue_during_run_prevents_verified_and_contains(self):
        def hook(phase):
            if phase=='database-disconnected':self.residue('state')
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.h.run_flow(hook=hook)
        self.assertFalse((self.path/'verified.json').exists());self.assertFalse((self.path/'closed.json').exists())
        self.h.h.account.relock.assert_called_once();self.assertEqual(self.layout.load()['status'],'in-progress')
        self.assertEqual(c.private_json(self.path/'recovery.json')['status'],'INTERVENTION_REQUIRED')
    def test_residue_appearing_during_containment_prevents_state_completion(self):
        self.h.claim();observed=[]
        def stop():
            self.residue('guard');observed.append(self.state_bytes())
        with self.h.safety_mocks(),mock.patch.object(ops,'stop_services',side_effect=stop),self.assertRaisesRegex(c.Refused,'RECOVERY_INCOMPLETE'):self.h.finalizer()
        self.h.h.account.relock.assert_called_once();self.assertEqual(self.state_bytes(),observed[0])
        self.assertEqual(self.layout.load()['phase'],'recovering')
        self.assertEqual(c.private_json(self.path/'recovery.json')['failedControls'],['state-persistence'])

    def test_interrupted_final_state_before_guard_cannot_be_formally_approved(self):
        self.h.claim();save=self.layout.save
        def interrupted(state):
            if state.get('phase')=='first-activation-recovered':
                c.atomic_json(self.layout.state/'state.json',state);self.residue('guard')
                raise OSError('synthetic crash before guard rename')
            save(state)
        with self.h.safety_mocks(),mock.patch.object(self.layout,'save',side_effect=interrupted),self.assertRaises(OSError):self.h.finalizer()
        before=self.state_bytes();history=window.recovery_history(self.path)
        self.assertEqual(self.layout.load()['phase'],'first-activation-recovered')
        self.assertNotEqual(window.read_guard(self.layout),window.guard_projection(self.layout.load()))
        with self.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.finalizer()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.state_bytes());self.assertEqual(history,window.recovery_history(self.path))
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.launch()

    def test_nonowner_with_residue_and_busy_global_lock_only_cleans_own_secret(self):
        b=self.h.other();self.h.claim();p=self.residue('guard');before=self.h.snapshot()
        with c.exclusive_lock(self.layout.state/'operation.lock'),self.h.safety_mocks() as effects,mock.patch.object(window,'recover') as recover:
            self.h.finalizer(b)
        recover.assert_not_called()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.h.snapshot());self.assertTrue(p.exists());self.assertFalse((window.RUN_BASE/b.a['runId']).exists())
    def test_completed_recovery_with_residue_cannot_be_approved_again(self):
        self.h.claim()
        with self.h.safety_mocks():self.h.finalizer()
        before=self.state_bytes();history=window.recovery_history(self.path);self.residue('guard')
        with self.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.h.finalizer()
        for effect in effects.values():effect.assert_not_called()
        self.assertEqual(before,self.state_bytes());self.assertEqual(history,window.recovery_history(self.path))
    def test_completed_recovery_state_guard_split_is_not_approved(self):
        self.h.claim();guard=self.layout.guard.read_bytes()
        with self.h.safety_mocks():self.h.finalizer()
        self.layout.guard.write_bytes(guard);before=self.state_bytes()
        with self.assertRaisesRegex(c.Refused,'RECOVERY_STATE_INCOMPLETE'):self.h.finalizer()
        self.assertEqual(before,self.state_bytes())
    def test_symlink_directory_and_unrelated_name_are_not_interpreted(self):
        p=self.layout.state/'.write-link';p.symlink_to(self.layout.guard)
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):window.persistence_clean(self.layout)
        self.assertTrue(p.is_symlink());p.unlink();p.mkdir()
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):window.persistence_clean(self.layout)
        p.rmdir();private_write(self.layout.state/'unrelated.tmp',b'fixture')
        window.persistence_clean(self.layout)
    def test_actual_abrupt_exit_leaves_state_and_guard_residues(self):
        for scope in ('state','guard'):
            child=PersistenceTests();child.setUp()
            try:
                child.h.claim();old=child.state_bytes()
                program="""import sys,os,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import release_contract as c
state=Path(sys.argv[2]);guard=Path(sys.argv[3]);scope=sys.argv[4]
d=json.loads(state.read_bytes());d['phase']='accounts-enabled'
replace=c.os.replace
def interrupted(src,dst):
 if Path(dst)==(state if scope=='state' else guard):os._exit(23)
 return replace(src,dst)
c.os.replace=interrupted
c.atomic_json(state,d)
c.atomic_json(guard,{'synthetic':'not published'},0o644)
"""
                result=subprocess.run([sys.executable,'-I','-B','-c',program,str(ROOT/'deploy/lib'),str(child.layout.state/'state.json'),str(child.layout.guard),scope],capture_output=True,timeout=5)
                self.assertEqual(result.returncode,23);residue=list((child.layout.state if scope=='state' else child.layout.guard.parent).glob('.write-*'));self.assertEqual(len(residue),1)
                raw=residue[0].read_bytes();before=child.state_bytes()
                if scope=='state':self.assertEqual(old,before)
                else:self.assertNotEqual(old[0],before[0]);self.assertEqual(old[1],before[1])
                with child.h.safety_mocks() as effects,self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):child.h.finalizer()
                effects['stop'].assert_called_once();child.h.h.account.relock.assert_called_once()
                self.assertEqual(raw,residue[0].read_bytes());self.assertEqual(before,child.state_bytes())
            finally:child.doCleanups()
    def test_v2_completion_and_replay_refuse_residue_without_history_changes(self):
        h=reconciliation.ReconciliationTests();h.setUp()
        try:
            h.run_flow();state=h.layout.load();history=h.history()
            for directory in (h.layout.state,h.layout.guard.parent):
                p=directory/'.write-synthetic';private_write(p,b'partial')
                with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):window.reconciliation_closed(h.layout,state)
                with self.assertRaisesRegex(c.Refused,'RECONCILE_STATE_RESIDUE'):h.run_flow()
                self.assertEqual(state,h.layout.load());self.assertEqual(history,h.history());self.assertEqual(p.read_bytes(),b'partial')
                p.unlink()
            self.assertEqual(window.reconciliation_closed(h.layout,state),h.q)
        finally:h.doCleanups()
    def test_legacy_bypass_is_demonstrated_not_claimed_prevented(self):
        source=subprocess.check_output(['git','show','401f130461c87c254075f4b0a3a40e1a2feca40b:deploy/lib/activation_window.py'],cwd=ROOT)
        file=self.h.h.root/'legacy.py';private_write(file,source);spec=importlib.util.spec_from_file_location('legacy_residue_fixture',file);legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
        p=self.residue('state');before=self.state_bytes()
        # Intentionally demonstrate the old binary limitation, under mocked external IO.
        a,cmd=self.launch(legacy)
        self.assertTrue(any(call.args[0][0]=='systemd-run' for call in cmd.call_args_list))
        self.assertEqual(before,self.state_bytes());self.assertTrue(p.exists())
        with self.assertRaisesRegex(c.Refused,'PERSISTENCE_RESIDUE'):self.launch(char='5')

if __name__=='__main__':unittest.main()
