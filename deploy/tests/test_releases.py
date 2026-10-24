"""Filesystem and failure controls. Fixtures never target a real database or service."""
import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import tarfile
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"deploy/lib"))
import release_contract as c
spec=importlib.util.spec_from_file_location("release_ops",ROOT/"deploy/scripts/release.py")
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="tf05-test-",dir="/private/tmp" if sys.platform=="darwin" else "/tmp")
        self.root=Path(self.temp.name);self.token=secrets.token_hex(32)
        self.env=mock.patch.dict(os.environ,{"TF_RELEASE_LAB_TOKEN":self.token});self.env.start()
        c.atomic_json(self.root/".traceflow-release-lab.json",{"token":self.token})
        for d in ("opt/traceflow/releases","opt/traceflow/shared","var/www/traceflow"):
            (self.root/d).mkdir(parents=True,exist_ok=True)
        self.layout=ops.Layout(str(self.root));self.layout.initialize()
    def tearDown(self):
        self.env.stop();self.temp.cleanup()
    def test_dedicated_guard_is_atomic_and_legacy_preserved(self):
        state=self.layout.load();state['phase']='migration-complete';self.layout.save(state)
        self.assertEqual(self.layout.guard,self.layout.app/'shared/release-guard/release-guard.json')
        legacy=self.layout.app/'release-guard.json';legacy.write_bytes(self.layout.guard.read_bytes());legacy.chmod(0o644)
        before=legacy.read_bytes();self.layout.guard.unlink();self.layout.prepare_guard()
        self.assertEqual(legacy.read_bytes(),before);self.assertEqual(self.layout.guard.read_bytes(),before)
        self.layout.prepare_guard();self.assertEqual(legacy.read_bytes(),before)
        state['phase']='later';self.layout.save(state)
        self.assertEqual(legacy.read_bytes(),before);self.assertEqual(c.read_json(self.layout.guard)['phase'],'later')
    def historical_guard(self):
        state=self.layout.load();state['phase']='migration-complete';self.layout.save(state)
        expected=c.read_json(self.layout.guard)
        historical={k:v for k,v in expected.items() if k not in ('expiresAt','runId','operation')}
        self.layout.guard.unlink();self.layout.guard.parent.rmdir()
        legacy=self.layout.app/'release-guard.json';c.atomic_json(legacy,historical,0o644)
        return legacy,historical,expected
    def test_guard_relocation_accepts_exact_seven_field_historical_shape(self):
        legacy,historical,expected=self.historical_guard()
        before=legacy.read_bytes();state=(self.layout.state/'state.json').read_bytes()
        self.assertEqual(len(historical),7)
        self.assertEqual(self.layout.prepare_guard(),expected)
        self.assertEqual(c.read_json(self.layout.guard),expected)
        self.assertEqual(legacy.read_bytes(),before)
        self.assertEqual((self.layout.state/'state.json').read_bytes(),state)
        self.layout.prepare_guard();self.assertEqual(legacy.read_bytes(),before)
    def test_historical_guard_rejects_divergence_in_every_legacy_field(self):
        legacy,historical,_=self.historical_guard()
        for key in historical:
            with self.subTest(key=key):
                c.atomic_json(legacy,dict(historical,**{key:'unexpected'}),0o644)
                with self.assertRaisesRegex(c.Refused,'LEGACY_GUARD_DIVERGED'):self.layout.prepare_guard()
                self.assertFalse(self.layout.guard.parent.exists())
    def test_historical_guard_rejects_missing_extra_or_partial_shapes(self):
        legacy,historical,_=self.historical_guard()
        variants=[{k:v for k,v in historical.items() if k!=removed} for removed in historical]
        variants += [dict(historical,unknown=None)]
        variants += [dict(historical,**{key:None}) for key in ('expiresAt','runId','operation')]
        for value in variants:
            with self.subTest(value=value):
                c.atomic_json(legacy,value,0o644)
                with self.assertRaisesRegex(c.Refused,'LEGACY_GUARD_DIVERGED'):self.layout.prepare_guard()
                self.assertFalse(self.layout.guard.parent.exists())
    def test_historical_guard_cannot_hide_operation_fields(self):
        legacy,_,_=self.historical_guard();state=self.layout.load()
        for key,value in (('expiresAt','2026-10-18T03:00:00Z'),('runId','a'*32),('operation','backup-maintenance')):
            with self.subTest(key=key):
                c.atomic_json(self.layout.state/'state.json',dict(state,**{key:value}))
                with self.assertRaisesRegex(c.Refused,'LEGACY_GUARD_DIVERGED'):self.layout.prepare_guard()
                self.assertFalse(self.layout.guard.parent.exists())
    def test_historical_guard_refuses_conflicting_new_guard_without_overwrite(self):
        legacy,_,_=self.historical_guard();before=legacy.read_bytes()
        self.layout.guard.parent.mkdir(mode=0o755);c.atomic_json(self.layout.guard,{'status':'wrong'},0o644)
        new_before=self.layout.guard.read_bytes()
        with self.assertRaisesRegex(c.Refused,'GUARD_DIVERGED'):self.layout.prepare_guard()
        self.assertEqual(legacy.read_bytes(),before);self.assertEqual(self.layout.guard.read_bytes(),new_before)
    def test_guard_relocation_refuses_diverged_legacy(self):
        c.atomic_json(self.layout.app/'release-guard.json',{'status':'wrong'},0o644)
        with self.assertRaisesRegex(c.Refused,'LEGACY_GUARD_DIVERGED'):self.layout.prepare_guard()
    def test_guard_relocation_refuses_pending_operation(self):
        state=self.layout.load();state['status']='in-progress';self.layout.save(state)
        with self.assertRaisesRegex(c.Refused,'GUARD_OPERATION_ACTIVE'):self.layout.prepare_guard()
    def test_missing_guard_directory_never_changes_state(self):
        before=(self.layout.state/'state.json').read_bytes();self.layout.guard.unlink();self.layout.guard.parent.rmdir()
        with self.assertRaises(c.Refused):self.layout.save({'status':'unexpected'})
        self.assertEqual((self.layout.state/'state.json').read_bytes(),before)
    def test_guard_symlink_refused_before_state_write(self):
        before=(self.layout.state/'state.json').read_bytes();folder=self.layout.guard.parent;self.layout.guard.unlink();folder.rmdir()
        alternative=self.layout.app/'alternate';alternative.mkdir();folder.symlink_to(alternative)
        with self.assertRaisesRegex(c.Refused,'SYMLINK_PATH'):self.layout.save({'status':'unexpected'})
        self.assertEqual((self.layout.state/'state.json').read_bytes(),before)
    def fixture(self,n=1,asset=None):
        rid="20261014T210000Z-"+"a"*40+"-"+f"{n:012x}"
        source=self.root/f"fixture-{n}";runtime=source/"runtime";admin=source/"admin"
        for path,value in {
            "backend/package.json":"{}","backend/src/server.js":"export {};","backend/src/github-worker.js":"export {};",
            "backend/prisma/schema.prisma":"fixture schema",
            "backend/prisma/migrations/20260101000000_fixture/migration.sql":"SELECT 1;",
            "deploy/scripts/validate-service-environment.mjs":"export {};",
            "frontend/dist/index.html":"<html>"+str(n)+"</html>",
            "frontend/dist/assets/"+(asset or f"fixture-{n:08x}.js"):"asset-"+str(n),
        }.items():
            dest=runtime/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(value)
        (admin/"node_modules/prisma/build").mkdir(parents=True)
        (admin/"node_modules/prisma/build/index.js").write_text("// fixture")
        shutil.copytree(runtime/"backend/prisma",admin/"prisma")
        common={"formatVersion":1,"application":"TraceFlow","releaseId":rid,"commitSha":"a"*40,
            "platform":{"os":"linux","architecture":"arm64","distribution":"Oracle Linux 9.8","opensslMajor":3},
            "sourceState":"candidate","nodeVersion":"22.23.2","prismaVersion":"6.12.0","schema":c.schema_contract(runtime)}
        out=self.root/f"package-{n}";out.mkdir()
        artifacts={kind:c.pack(tree,out/(kind+".tar.gz"),dict(common,kind=kind)) for kind,tree in (("runtime",runtime),("admin",admin))}
        descriptor={"formatVersion":1,"releaseId":rid,"commitSha":"a"*40,"artifacts":artifacts}
        (out/"release.json").write_bytes(c.encoded(descriptor))
        return rid,out,c.file_digest(out/"release.json")
    def stage(self,n=1,asset=None):
        rid,out,digest=self.fixture(n,asset)
        ops.stage(self.layout,str(out/"release.json"),digest)
        return rid,out,digest
    def auth(self,rid,digest,operation="activate"):
        auth=self.root/(operation+"-auth.json")
        c.atomic_json(auth,{"formatVersion":1,"environment":"disposable","releaseId":rid,
            "descriptorSha256":digest,"operation":operation,
            "expiresAt":(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat(),
            "gates":{"writersControlled":True}})
        return str(auth)
    def fake_activation(self,rid,digest,operation="activate",fail_start=False,kill_switch=False):
        auth=self.auth(rid,digest,operation)
        db=mock.MagicMock();db.__enter__.return_value=db
        db.ask.return_value={"fingerprint":"approved"}
        calls=[]
        def start(*_):
            calls.append("start")
            if fail_start and len(calls)==1:raise c.Refused("READINESS_TIMEOUT")
        original=ops.switch_link
        def switch(link,target):
            original(link,target)
            if kill_switch and link==self.layout.app/"current":
                raise KeyboardInterrupt()
        with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"boot_id",return_value="test-boot"),\
             mock.patch.object(ops,"proc_start",return_value="123"),mock.patch.object(ops,"Database",return_value=db),\
             mock.patch.object(ops,"stop_services"),mock.patch.object(ops,"start_services",side_effect=start),\
             mock.patch.object(ops,"switch_link",side_effect=switch):
            ops.activate(self.layout,SimpleNamespace(release_id=rid,digest=digest,authorization=auth),operation)
        return calls
    def test_R1_stage_preserves_current_and_verifies_pair(self):
        rid,_,d=self.stage();self.layout.installed(rid,d)
        self.assertIsNone(self.layout.load()["current"]);self.assertFalse((self.layout.app/"current").exists())
    def test_R2_archive_checksum_rejected(self):
        _,out,d=self.fixture();(out/"runtime.tar.gz").write_bytes(b"corrupt")
        with self.assertRaisesRegex(c.Refused,"ARCHIVE_DIGEST"):ops.stage(self.layout,str(out/"release.json"),d)
    def test_descriptor_substitution_rejected(self):
        _,out,d=self.fixture();(out/"release.json").write_text("{}")
        with self.assertRaisesRegex(c.Refused,"DESCRIPTOR_DIGEST"):c.descriptor(out/"release.json",d)
    def test_R3_missing_manifest_rejected(self):
        rid,_,_=self.stage();(self.layout.releases/rid/"manifest.json").unlink()
        with self.assertRaises(c.Refused):self.layout.installed(rid)
    def test_R4_wrong_architecture_rejected(self):
        _,out,_=self.fixture()
        m=json.loads((self.root/"fixture-1/runtime/manifest.json").read_text());m["platform"]["architecture"]="x64"
        with self.assertRaisesRegex(c.Refused,"PLATFORM"):c.validate_manifest(m,"runtime")
    def test_R6_existing_release_never_overwritten(self):
        rid,out,d=self.stage();before=c.file_digest(self.layout.releases/rid/"manifest.json")
        with self.assertRaisesRegex(c.Refused,"ALREADY_EXISTS"):ops.stage(self.layout,str(out/"release.json"),d)
        self.assertEqual(before,c.file_digest(self.layout.releases/rid/"manifest.json"))
    def test_R7_extraction_failure_never_activates(self):
        _,out,d=self.fixture()
        with mock.patch.object(ops,"extract_verified",side_effect=OSError("fixture failure")):
            with self.assertRaises(OSError):ops.stage(self.layout,str(out/"release.json"),d)
        self.assertIsNone(self.layout.load()["current"]);self.assertEqual(list(self.layout.releases.iterdir()),[])
    def test_archive_traversal_symlink_hardlink_duplicate_refused(self):
        for kind in ("traversal","symlink","hardlink","duplicate"):
            with self.subTest(kind=kind):
                archive=self.root/(kind+".tar.gz")
                with tarfile.open(archive,"w:gz") as tar:
                    ent=tarfile.TarInfo("../escape" if kind=="traversal" else "x");ent.mode=0o644
                    if kind=="symlink":ent.type=tarfile.SYMTYPE;ent.linkname="/etc/passwd"
                    if kind=="hardlink":ent.type=tarfile.LNKTYPE;ent.linkname="x"
                    tar.addfile(ent,io.BytesIO())
                    if kind=="duplicate":tar.addfile(ent,io.BytesIO())
                dest=self.root/(kind+"-extract");dest.mkdir()
                with self.assertRaises(c.Refused):c.extract_verified(archive,dest,"runtime","0"*64)
                self.assertFalse((self.root/"escape").exists())
    def test_negative_secret_and_data_fixtures(self):
        for name,body in [(".env","local"),("config.txt","-----BEGIN "+"PRIVATE KEY-----"),
            ("token.txt","ghp_"+"a"*40),("test-evidence/file.txt","private"),("dump.sql","dump"),("backup.bak","backup")]:
            with self.subTest(name=name):
                p=self.root/"unsafe"/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
                with self.assertRaises(c.Refused):c.content_policy(name,p)
                p.unlink()
    def test_public_certificate_not_blanket_rejected(self):
        p=self.root/"public.pem";p.write_text("-----BEGIN CERTIFICATE-----\npublic\n-----END CERTIFICATE-----")
        c.content_policy("public.pem",p)
    def test_R8_preflight_failure_preserves_links(self):
        a,_,ad=self.stage(1);self.fake_activation(a,ad)
        b,_,bd=self.stage(2);(self.layout.releases/b/"backend/src/server.js").write_text("tamper")
        with self.assertRaisesRegex(c.Refused,"INTEGRITY"):self.fake_activation(b,bd)
        self.assertEqual(self.layout.load()["current"],a)
        self.assertEqual(os.readlink(self.layout.app/"current"),str(self.layout.releases/a))
    def test_R9_R10_R12_failed_start_compensates(self):
        a,_,ad=self.stage(1);self.fake_activation(a,ad)
        b,_,bd=self.stage(2)
        with self.assertRaisesRegex(c.Refused,"READINESS_TIMEOUT"):self.fake_activation(b,bd,fail_start=True)
        self.assertEqual(self.layout.load()["status"],"idle");self.assertEqual(self.layout.load()["current"],a)
    def test_first_failure_requires_intervention(self):
        a,_,ad=self.stage()
        with self.assertRaises(c.Refused):self.fake_activation(a,ad,fail_start=True)
        self.assertEqual(self.layout.load()["status"],"intervention-required")
    def test_R13_unknown_schema_blocks_before_switch(self):
        a,_,ad=self.stage(1);self.fake_activation(a,ad)
        b,_,bd=self.stage(2)
        original=self.layout.installed
        def altered(rid,expected=None):
            r,admin,m=original(rid,expected)
            if rid==a:m["schema"]=dict(m["schema"],policy="unknown")
            return r,admin,m
        with mock.patch.object(self.layout,"installed",side_effect=altered):
            with self.assertRaisesRegex(c.Refused,"SCHEMA_NOT_PROVEN"):self.fake_activation(b,bd)
        self.assertEqual(self.layout.load()["current"],a)
    def test_R18_private_storage_preserved(self):
        evidence=self.root/"var/lib/traceflow/test-evidence/item";evidence.parent.mkdir(parents=True);evidence.write_text("private")
        a,_,ad=self.stage(1);self.fake_activation(a,ad);b,_,bd=self.stage(2);self.fake_activation(b,bd)
        self.assertEqual(evidence.read_text(),"private")
    def test_R20_lock_rejects_second_operation(self):
        with c.exclusive_lock(self.layout.state/"operation.lock"):
            with self.assertRaisesRegex(c.Refused,"OPERATION_LOCKED"):
                with c.exclusive_lock(self.layout.state/"operation.lock"):pass
        self.assertTrue((self.layout.state/"operation.lock").is_file())
    def test_R22_old_assets_and_rollback(self):
        a,_,ad=self.stage(1);self.fake_activation(a,ad)
        b,_,bd=self.stage(2);self.fake_activation(b,bd)
        web=self.layout.web/"current"
        self.assertEqual((web/"index.html").read_text(),"<html>2</html>")
        self.assertEqual((web/"assets/fixture-00000001.js").read_text(),"asset-1")
        self.fake_activation(a,ad,"rollback")
        self.assertEqual((web/"index.html").read_text(),"<html>1</html>")
        self.assertEqual((web/"assets/fixture-00000002.js").read_text(),"asset-2")
    def test_asset_collision_is_refused(self):
        a,_,ad=self.stage(1,"collision-12345678.js");self.fake_activation(a,ad)
        b,_,bd=self.stage(2,"collision-12345678.js")
        with self.assertRaisesRegex(c.Refused,"COLLISION"):self.fake_activation(b,bd)
        self.assertEqual(self.layout.load()["current"],a)
    def test_R23_partial_extraction_not_prepared(self):
        path=self.layout.releases/".stage-abandoned";path.mkdir();(path/"backend").mkdir()
        with self.assertRaises(c.Refused):self.layout.installed("20261014T210000Z-"+"a"*40+"-"+"1"*12)
    def test_R24_writable_parent_refused_without_chmod(self):
        self.layout.app.chmod(0o777)
        with self.assertRaisesRegex(c.Refused,"WRITABLE"):self.layout.initialize()
        self.assertEqual(self.layout.app.stat().st_mode&0o777,0o777)
        self.layout.app.chmod(0o755)
    def test_external_root_without_ownership_refused(self):
        other=self.root/"other";other.mkdir()
        with self.assertRaises(c.Refused):ops.Layout(str(other))
    def test_release_traversal_refused(self):
        for value in ("../x","/tmp/x","latest","x"*100):
            with self.assertRaises(c.Refused):c.release_id(value)
    def test_R21_prune_protects_active_previous_recent_process_and_storage(self):
        entries=[self.stage(i) for i in range(1,7)]
        for rid,_,d in entries:self.fake_activation(rid,d)
        state=self.layout.load()
        for i,(rid,_,_) in enumerate(entries):state["history"][rid]["lastActivated"]=ops.now()-20*86400+i
        self.layout.save(state)
        args=SimpleNamespace(days=7,keep=3,apply=True)
        with mock.patch.object(ops,"used_releases",return_value={entries[0][0]}):ops.prune(self.layout,args)
        self.assertTrue((self.layout.releases/entries[0][0]).exists())
        self.assertFalse((self.layout.releases/entries[1][0]).exists())
        self.assertTrue((self.layout.releases/entries[-1][0]).exists())
        self.assertTrue((self.layout.releases/entries[-2][0]).exists())
        self.assertTrue((self.layout.web/"current/assets/fixture-00000002.js").exists())
        with mock.patch.object(ops,"used_releases",return_value={entries[0][0]}):ops.prune(self.layout,args)
    def test_prune_unknown_symlink_and_short_retention(self):
        external=self.root/"outside";external.mkdir();(external/"keep").write_text("safe")
        (self.layout.releases/"unmanaged").symlink_to(external)
        ops.prune(self.layout,SimpleNamespace(days=7,keep=3,apply=True))
        self.assertTrue((external/"keep").exists())
        with self.assertRaises(c.Refused):ops.prune(self.layout,SimpleNamespace(days=1,keep=1,apply=True))
    def test_unfinished_journal_blocks_new_activation_and_prune(self):
        a,_,ad=self.stage();state=self.layout.load();state["status"]="in-progress";self.layout.save(state)
        with self.assertRaisesRegex(c.Refused,"RECOVERY"):self.fake_activation(a,ad)
        with self.assertRaisesRegex(c.Refused,"RECOVERY"):ops.prune(self.layout,SimpleNamespace(days=7,keep=3,apply=True))
    def test_writable_tree_directory_refused(self):
        rid,_,_=self.stage()
        folder=self.layout.releases/rid/"backend/src";folder.chmod(0o777)
        with self.assertRaisesRegex(c.Refused,"DIRECTORY_MODE"):self.layout.installed(rid)
        folder.chmod(0o755)
    def test_archive_oversized_header_refused_before_read(self):
        archive=self.root/"oversized.tar"
        info=tarfile.TarInfo("large");info.size=4*1024**3;info.mode=0o644
        import gzip
        with gzip.open(archive,"wb") as f:f.write(info.tobuf()+b"\\0"*1024)
        out=self.root/"oversize";out.mkdir()
        with self.assertRaisesRegex(c.Refused,"TOO_LARGE"):c.extract_verified(archive,out,"runtime","0"*64)
    def test_migration_completion_requires_explicit_activation_before_boot(self):
        for phase in ("migration-complete","migration-recovered"):
            with mock.patch.object(ops,"read_json",return_value={"status":"idle","phase":phase}):
                with self.assertRaisesRegex(c.Refused,"POST_MIGRATION_ACTIVATION_REQUIRED"):
                    ops.active_guard("traceflow-api.service")
    def test_same_release_can_be_explicitly_reactivated_after_migration(self):
        rid,_,d=self.stage();self.fake_activation(rid,d)
        state=self.layout.load();state["phase"]="migration-complete";self.layout.save(state)
        self.fake_activation(rid,d)
        self.assertEqual(self.layout.load()["phase"],"complete")
    def test_interruption_between_symlinks_requires_recovery(self):
        rid,_,d=self.stage()
        with self.assertRaises(KeyboardInterrupt):self.fake_activation(rid,d,kill_switch=True)
        self.assertEqual(self.layout.load()["status"],"intervention-required")
        self.fake_activation(rid,d,operation="recover")
        self.layout.current_matches(self.layout.load())
    def test_lab_database_url_round_trips_generated_credentials(self):
        from urllib.parse import urlsplit, unquote
        spec=importlib.util.spec_from_file_location("lab_url_contract",ROOT/"deploy/tests/run-release-linux.py")
        harness=importlib.util.module_from_spec(spec);spec.loader.exec_module(harness)
        for password in (secrets.token_hex(32),secrets.token_urlsafe(24)+":/@%?#"):
            user="tf_m_"+secrets.token_hex(6);schema="tf_oci_"+secrets.token_hex(6)+"_test"
            parsed=urlsplit(harness.owned_database_url(user,password,55291,schema))
            self.assertEqual((parsed.scheme,parsed.hostname,parsed.port,parsed.path),("mysql","127.0.0.1",55291,"/"+schema))
            self.assertEqual((unquote(parsed.username),unquote(parsed.password)),(user,password))
            self.assertEqual((parsed.query,parsed.fragment),("",""))
    def test_build_tar_is_deterministic(self):
        _,out,_=self.fixture();tree=self.root/"fixture-1/runtime";m=c.read_json(tree/"manifest.json")
        second=out/"second.tar.gz";c.pack(tree,second,m)
        self.assertEqual(c.file_digest(out/"runtime.tar.gz"),c.file_digest(second))

if __name__=="__main__":unittest.main()
