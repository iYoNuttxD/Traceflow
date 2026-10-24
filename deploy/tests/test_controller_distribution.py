"""Sources of the application must match before reusing a compiled artifact."""
import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
import release_contract as c
spec=importlib.util.spec_from_file_location('controller_package',ROOT/'scripts/package_release.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='tf0710-dist-',dir=ROOT/'build');self.root=Path(self.temp.name)
        for n in ('old','new'):
            d=self.root/n;d.mkdir();(d/'backend/src').mkdir(parents=True);(d/'backend/src/server.js').write_text('export {};')
            (d/'deploy/scripts').mkdir(parents=True);(d/'deploy/scripts/release.py').write_text(n)
            self.proof(d,n)
    def tearDown(self):self.temp.cleanup()
    def proof(self,d,state):
        v={'files':c.inventory(d),'sourceState':'committed' if state=='old' else 'candidate'};v['files'].pop('source.json',None)
        (d/'source.json').write_bytes(c.encoded(v))
    def validate(self):
        return p.validate_reuse_sources(self.root/'new',self.root/'old',c.file_digest(self.root/'new/source.json'),c.file_digest(self.root/'old/source.json'))
    def test_candidate_is_preserved_not_misrepresented(self):self.assertEqual(self.validate()['sourceState'],'candidate')
    def test_application_change_requires_real_rebuild(self):
        (self.root/'new/backend/src/server.js').write_text('changed');self.proof(self.root/'new','new')
        with self.assertRaisesRegex(c.Refused,'APPLICATION_REBUILD_REQUIRED'):self.validate()
    def test_source_tamper_is_refused(self):
        (self.root/'new/deploy/scripts/release.py').write_text('tampered')
        with self.assertRaisesRegex(c.Refused,'SOURCE_INTEGRITY'):self.validate()
    def test_all_operational_helpers_are_distributed(self):
        for name in ('activation_contract','activation_window','activation_accounts','runtime_grants','operational_io','recovery_policy','recovery_snapshot','recovery_archive','backup_maintenance','backup_runtime','backup_secrets'):
            self.assertIn('deploy/lib/'+name+'.py',p.RECIPES)
        self.assertIn('deploy/scripts/recovery-backup.py',p.RECIPES)
    def test_maintenance_and_recovery_cannot_write_release_parent(self):
        expected='/opt/traceflow/shared/release-state /opt/traceflow/shared/release-guard /var/lib/traceflow-recovery /run'
        for name in ('traceflow-recovery-backup.service','traceflow-recovery-reconcile.service'):
            text=(ROOT/'deploy/systemd'/name).read_text()
            with self.subTest(unit=name):
                self.assertIn('ProtectSystem=strict\n',text)
                self.assertIn('ReadWritePaths='+expected+'\n',text)
                self.assertNotIn('ReadWritePaths=/opt/traceflow ',text)
                self.assertIn('LimitCORE=0\n',text)
                self.assertIn('LoadCredentialEncrypted=oci-api-key:',text)
if __name__=='__main__':unittest.main()
