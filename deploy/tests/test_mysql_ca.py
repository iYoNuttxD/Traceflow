"""Only synthetic public certificates and disposable filesystem trees."""
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('mysql_ca', Path(__file__).resolve().parents[1] / 'scripts/prepare-mysql-ca.py')
ca = importlib.util.module_from_spec(spec); spec.loader.exec_module(ca)

class PublicCaTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='tf061-ca-')).resolve()
        (self.root / '.traceflow-runtime-test').touch()
        (self.root / 'etc/pki').mkdir(parents=True)
        self.source = self.root / 'source.pem'
        config = self.root / 'root.cnf'; config.write_text('[req]\ndistinguished_name=dn\nx509_extensions=root_ca\n[dn]\n[root_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
        subprocess.run(['openssl', 'req', '-config', str(config), '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(self.root / 'synthetic.key'), '-out', str(self.source), '-days', '1', '-subj', '/CN=Synthetic OCI061 CA'], check=True, capture_output=True)
        self.digest = hashlib.sha256(subprocess.check_output(['openssl', 'x509', '-in', str(self.source), '-outform', 'DER'])).hexdigest()
        self.target = self.root / 'etc/pki/traceflow/mysql-ca.pem'
    def tearDown(self): shutil.rmtree(self.root)
    def prepare(self, apply=False): return ca.prepare(self.root, self.source, self.digest, apply)
    def test_plan_then_idempotent_exclusive_install(self):
        self.assertEqual(self.prepare()['status'], 'PLAN'); self.assertFalse(self.target.exists())
        self.assertEqual(self.prepare(True)['status'], 'CREATED'); before = self.target.stat()
        self.assertEqual(self.prepare(True)['status'], 'UNCHANGED')
        self.assertEqual((before.st_ino, before.st_mtime_ns), (self.target.stat().st_ino, self.target.stat().st_mtime_ns))
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o644)
    def test_wrong_fingerprint_creates_nothing(self):
        self.digest = '0' * 64
        with self.assertRaises(ca.Refused): self.prepare(True)
        self.assertFalse(self.target.parent.exists())
    def test_existing_different_content_preserved(self):
        self.prepare(True); self.target.write_text('existing unrelated file')
        with self.assertRaises(ca.Refused): self.prepare(True)
        self.assertEqual(self.target.read_text(), 'existing unrelated file')
    def test_source_private_key_rejected(self):
        self.source = self.root / 'synthetic.key'
        with self.assertRaises(ca.Refused): self.prepare(True)
    def test_symlink_source_rejected(self):
        link = self.root / 'link.pem'; link.symlink_to(self.source); self.source = link
        with self.assertRaises(ca.Refused): self.prepare(True)
    def test_symlink_destination_preserved(self):
        self.target.parent.mkdir(); self.target.symlink_to(self.source)
        with self.assertRaises(ca.Refused): self.prepare(True)
        self.assertTrue(self.target.is_symlink())
    def test_writable_parent_rejected(self):
        (self.root / 'etc').chmod(0o777)
        with self.assertRaises(ca.Refused): self.prepare(True)
    def test_ancestor_symlink_rejected(self):
        (self.root / 'etc/pki').rmdir(); (self.root / 'etc/pki').symlink_to(self.root)
        with self.assertRaises(ca.Refused): self.prepare(True)
    def test_missing_marker_rejected(self):
        (self.root / '.traceflow-runtime-test').unlink()
        with self.assertRaises(ca.Refused): self.prepare(True)
    def test_public_ca_never_repairs_open_permissions(self):
        self.prepare(True); self.target.chmod(0o666)
        with self.assertRaises(ca.Refused): self.prepare(True)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o666)

if __name__ == '__main__': unittest.main()
