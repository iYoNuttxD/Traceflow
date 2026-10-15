"""Host-safe tests: only tempfile trees and controlled environment subprocesses."""
import importlib.util
import json
import os
from pathlib import Path
import pwd
import grp
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

BASE = Path(__file__).resolve().parents[1]

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE / "scripts" / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

prepare = module("prepare", "prepare-runtime-directories.py")
cloudflare = module("cloudflare", "update-cloudflare-ips.py")

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="tf04-storage-")).resolve()
        (self.root / ".traceflow-runtime-test").touch()
        self.user = pwd.getpwuid(os.geteuid()).pw_name
        self.group = grp.getgrgid(os.getegid()).gr_name
    def tearDown(self):
        shutil.rmtree(self.root)
    def run_prepare(self, apply=True):
        return prepare.prepare(self.root, self.user, self.group, apply)
    def test_dry_run_writes_nothing(self):
        self.run_prepare(False)
        self.assertEqual([p.name for p in self.root.iterdir()], [".traceflow-runtime-test"])
    def test_idempotence_and_existing_evidence_preserved(self):
        self.run_prepare()
        evidence = self.root / "var/lib/traceflow/test-evidence/existing.bin"
        evidence.write_bytes(b"unchanged evidence")
        (self.root / "etc/traceflow/runtime.env").write_text("TEST_ONLY=untouched\n")
        self.run_prepare()
        self.assertEqual(evidence.read_bytes(), b"unchanged evidence")
        self.assertEqual((self.root / "etc/traceflow/runtime.env").read_text(), "TEST_ONLY=untouched\n")
        self.assertEqual(evidence.parent.stat().st_mode & 0o777, 0o700)
        self.assertFalse((self.root / "opt/traceflow/current").exists())
    def test_missing_user_before_changes(self):
        with self.assertRaises(KeyError): prepare.prepare(self.root, "tf04_no_such_account", self.group, True)
        self.assertFalse((self.root / "opt").exists())
    def test_missing_marker(self):
        (self.root / ".traceflow-runtime-test").unlink()
        with self.assertRaises(ValueError): self.run_prepare()
    def test_relative_and_traversal_roots(self):
        for root in (Path("relative"), self.root / ".." / self.root.name):
            with self.subTest(root=root), self.assertRaises(ValueError): prepare.prepare(root, self.user, self.group, True)
    def test_symlink_root(self):
        link = self.root / "link"
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): prepare.prepare(link, self.user, self.group, True)
    def test_ancestor_symlink_full_preflight(self):
        (self.root / "var").mkdir()
        (self.root / "var/lib").symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): self.run_prepare()
        self.assertFalse((self.root / "opt").exists())
    def test_leaf_symlink_never_followed(self):
        self.run_prepare()
        p = self.root / "var/lib/traceflow/test-evidence"
        p.rmdir(); p.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError): self.run_prepare()
        self.assertTrue(p.is_symlink())
    def test_file_instead_of_directory(self):
        (self.root / "etc").write_text("preserve")
        with self.assertRaises(ValueError): self.run_prepare()
        self.assertEqual((self.root / "etc").read_text(), "preserve")
    def test_writable_parent_refused(self):
        (self.root / "var").mkdir(mode=0o777); (self.root / "var").chmod(0o777)
        with self.assertRaises(ValueError): self.run_prepare()
        self.assertFalse((self.root / "opt").exists())
    def test_leaf_permissions_repaired_without_recursive_change(self):
        self.run_prepare(); leaf = self.root / "var/lib/traceflow/test-evidence"
        sentinel = leaf / "sentinel"; sentinel.write_text("keep"); sentinel.chmod(0o640); leaf.chmod(0o755)
        self.run_prepare()
        self.assertEqual(leaf.stat().st_mode & 0o777, 0o700)
        self.assertEqual(sentinel.stat().st_mode & 0o777, 0o640)
    def test_interrupted_preparation_is_nondestructive_and_recoverable(self):
        original = os.fchmod
        calls = []
        def interrupted(fd, mode):
            calls.append(mode)
            if len(calls) == 3: raise PermissionError("synthetic failure")
            original(fd, mode)
        with patch.object(os, "fchmod", interrupted), self.assertRaises(PermissionError): self.run_prepare()
        self.assertTrue((self.root / "opt/traceflow/releases").is_dir())
        self.run_prepare()
        self.assertTrue((self.root / "var/lib/traceflow/test-evidence").is_dir())

class CloudflareTests(unittest.TestCase):
    def test_official_snapshot_has_both_families(self):
        snapshot = (BASE / "nginx/snippets/cloudflare.conf").read_text()
        self.assertIn("set_real_ip_from 173.245.48.0/20;", snapshot)
        self.assertIn("set_real_ip_from 2606:4700::/32;", snapshot)
        trusted = [s.split()[1].strip(";") for s in snapshot.splitlines() if s.startswith("set_real_ip_from")]
        geo = [s.split()[0] for s in snapshot.splitlines() if s.strip().endswith(" 1;")]
        self.assertEqual(trusted, geo)
        self.assertNotIn("127.0.0", snapshot)
    def test_rejects_empty_invalid_private_global_trust_and_injection(self):
        for value in ("", "0.0.0.0/0", "127.0.0.1/32", "10.0.0.0/8", "173.245.48.0/20;\ninclude /tmp/evil;", "173.245.48.1/20", "::/0", "2606:4700::/32"):
            with self.subTest(value=value), self.assertRaises(ValueError): cloudflare.parse_list(value, 4)
    def test_duplicate_refused(self):
        with self.assertRaises(ValueError): cloudflare.parse_list("173.245.48.0/20\n173.245.48.0/20", 4)
    def test_render_does_not_add_local_trust(self):
        result = cloudflare.render("173.245.48.0/20", "2606:4700::/32", "test")
        self.assertIn("geo $realip_remote_addr", result)
        self.assertNotIn("0.0.0.0/0", result)

class ServiceEnvironmentTests(unittest.TestCase):
    def check(self, role="api", **overrides):
        env = {"NODE_ENV":"production", "HTTP_HOST":"127.0.0.1", "PORT":"3001", "TRUST_PROXY":"loopback", "SHUTDOWN_TIMEOUT_MS":"30000", "GITHUB_SCHEDULER_ENABLED":"false" if role == "api" else "true", "TEST_EVIDENCE_STORAGE_DIR":"/var/lib/traceflow/test-evidence"}
        # Synthetic process-only credential; never a database connection.
        import secrets
        from urllib.parse import urlencode
        env["DATABASE_URL"] = "mysql://synthetic:" + secrets.token_hex(32) + "@db.invalid/unused?" + urlencode({"sslaccept":"strict", "sslcert":"/etc/pki/traceflow/mysql-ca.pem", "connection_limit":"3", "connect_timeout":"5", "pool_timeout":"10", "socket_timeout":"30"})
        env.update(overrides)
        return subprocess.run([shutil.which("node"), str(BASE / "scripts/validate-service-environment.mjs"), role], env=env, text=True, capture_output=True)
    def test_valid_roles(self):
        for role in ("api", "worker"):
            with self.subTest(role=role): self.assertEqual(self.check(role).returncode, 0)
    def test_invalid_override_refused_and_values_not_logged(self):
        for key in ("NODE_ENV", "HTTP_HOST", "PORT", "TRUST_PROXY", "SHUTDOWN_TIMEOUT_MS", "GITHUB_SCHEDULER_ENABLED", "TEST_EVIDENCE_STORAGE_DIR", "TEST_DATABASE_URL", "DATABASE_URL"):
            with self.subTest(key=key):
                result = self.check(**{key:"sensitive-sentinel"})
                self.assertEqual(result.returncode, 1)
                self.assertNotIn("sensitive-sentinel", result.stderr)
                self.assertIn(key, json.loads(result.stderr)["variables"])
    def test_worker_disabled_rejected(self):
        self.assertEqual(self.check("worker", GITHUB_SCHEDULER_ENABLED="false").returncode, 1)
    def test_longer_shutdown_requires_unit_review(self):
        self.assertEqual(self.check(SHUTDOWN_TIMEOUT_MS="45000").returncode, 1)
    def test_invalid_role(self):
        self.assertEqual(self.check("unknown").returncode, 1)

class DatabaseBridgeUrlTests(unittest.TestCase):
    def test_duplicate_parameters_refused_before_prisma_import_or_connection(self):
        import datetime as dt
        import secrets
        from urllib.parse import urlencode, urlunsplit
        with tempfile.TemporaryDirectory(prefix="tf06-bridge-") as directory:
            root=Path(directory).resolve();release=root/"release";release.mkdir()
            (release/"manifest.json").write_text(json.dumps({"releaseId":"synthetic","sourceState":"committed"}))
            target={"host":"database.invalid","port":3306,"schema":"tfproduction","runtimeUser":"tf06_reader","migrationUser":"tf06_migrator"}
            auth=root/"authorization.json"
            auth.write_text(json.dumps({"formatVersion":1,"releaseId":"synthetic","environment":"staging",
                "expiresAt":(dt.datetime.now(dt.timezone.utc)+dt.timedelta(minutes=10)).isoformat(),"target":target,
                "gates":{"heatwaveTlsHomologated":True,"restoreRehearsed":True,"deploymentAuthorized":True}}));auth.chmod(0o600)
            options={"sslaccept":"strict","sslcert":"/synthetic/public-ca.pem","connection_limit":"1","connect_timeout":"5","pool_timeout":"10","socket_timeout":"30"}
            password=secrets.token_hex(32)
            for key in options:
                with self.subTest(parameter=key):
                    query=urlencode([*options.items(),(key,"accept_invalid_certs" if key=="sslaccept" else "unreviewed")])
                    value=urlunsplit(("mysql",target["runtimeUser"]+":"+password+"@database.invalid:3306","/tfproduction",query,""))
                    env={"PATH":os.environ["PATH"],"HOME":str(root),"RUNTIME_DATABASE_URL":value}
                    result=subprocess.run([shutil.which("node"),str(BASE/"scripts/release-database.mjs"),str(release),str(root/"admin"),str(auth),"read"],env=env,capture_output=True,text=True,timeout=5)
                    self.assertEqual(result.returncode,1)
                    self.assertEqual(json.loads(result.stdout),{"ok":False,"code":"UNREVIEWED_CONNECTION_OPTION"})
                    self.assertNotIn(password,result.stdout+result.stderr)

if __name__ == "__main__": unittest.main(verbosity=2)
