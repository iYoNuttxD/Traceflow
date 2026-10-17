"""No DB/service access: release journal, artifact, gates and recovery regressions."""
import datetime as dt
import json
import os
import subprocess
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock
import test_releases as fixtures
c=fixtures.c
ops=fixtures.ops

class InitialMigrationTests(unittest.TestCase):
    setUp=fixtures.ReleaseTests.setUp
    tearDown=fixtures.ReleaseTests.tearDown
    fixture=fixtures.ReleaseTests.fixture
    stage=fixtures.ReleaseTests.stage
    auth=fixtures.ReleaseTests.auth

    def prepared(self, initial=True, operation=None):
        rid,_,digest=self.stage()
        operation=operation or ("migrate-initial" if initial else "migrate")
        path=Path(self.auth(rid,digest,operation));auth=c.read_json(path)
        if initial:
            auth.update(authorizationId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",initialization={"formatVersion":1,"recovery":{"strategy":"stop-and-review-empty-initialization","planReference":"synthetic-recovery-plan","operatorId":"lab-operator"}})
        else:
            auth["gates"].update(backupVerified=True,restoreRehearsed=True);auth["backupReference"]="synthetic-backup"
        c.atomic_json(path,auth)
        return SimpleNamespace(action=operation,release_id=rid,digest=digest,authorization=str(path))

    def migration(self,args,failure=None):
        db=mock.MagicMock();db.__enter__.return_value=db
        def ask(action,**_):
            if action=="migrate":
                if failure:raise c.Refused(failure)
                return {"applied":["synthetic"],"fingerprint":"f"*64,"migrationCount":68,"migrationKind":"initial" if args.action=="migrate-initial" else "upgrade"}
            return {"fingerprint":"e"*64}
        db.ask.side_effect=ask
        with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"assert_stopped"),mock.patch.object(ops,"boot_id",return_value="lab-boot"),mock.patch.object(ops,"proc_start",return_value="lab-process"),mock.patch.object(ops,"Database",return_value=db):
            ops.migrate(self.layout,args)
        return db

    def test_initial_has_no_fake_backup_and_does_not_activate(self):
        args=self.prepared();db=self.migration(args);s=self.layout.load()
        self.assertEqual(s["phase"],"migration-complete");self.assertEqual(s["migrationKind"],"initial");self.assertIsNone(s["current"])
        self.assertEqual([x.args[0] for x in db.ask.call_args_list],["prepare-migration","migrate"])
        self.assertEqual(len(list(self.layout.state.glob("migration-*.json"))),1)
        self.assertFalse((self.layout.app/"current").exists())

    def test_initial_replay_is_refused(self):
        args=self.prepared();self.migration(args)
        with self.assertRaisesRegex(c.Refused,"INITIAL_RELEASE_STATE"):self.migration(args)

    def test_existing_activation_history_refuses_initial(self):
        args=self.prepared();s=self.layout.load();s["history"][args.release_id]={"lastActivated":1};self.layout.save(s)
        with self.assertRaisesRegex(c.Refused,"INITIAL_RELEASE_STATE"):self.migration(args)

    def test_partial_failure_quarantines_and_records_recovery_strategy(self):
        args=self.prepared()
        with self.assertRaisesRegex(c.Refused,"MIGRATION_FAILED"):self.migration(args,"MIGRATION_FAILED")
        s=self.layout.load();self.assertEqual(s["phase"],"migration-failed");self.assertEqual(s["status"],"intervention-required")
        self.assertEqual(s["initialRecovery"]["strategy"],"stop-and-review-empty-initialization")
        self.assertEqual(s["target"],args.release_id);self.assertEqual(s["descriptorSha256"],args.digest)
        with self.assertRaisesRegex(c.Refused,"RECOVERY_REQUIRED"):self.migration(args)

    def test_disconnect_failure_keeps_quarantine_without_success_receipt(self):
        args=self.prepared();db=mock.MagicMock();db.__enter__.return_value=db
        db.ask.return_value={"applied":[],"migrationCount":68}
        db.close.side_effect=c.Refused("DATABASE_CLOSE_FAILED")
        with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"assert_stopped"),mock.patch.object(ops,"boot_id",return_value="lab"),mock.patch.object(ops,"proc_start",return_value="lab"),mock.patch.object(ops,"Database",return_value=db):
            with self.assertRaisesRegex(c.Refused,"DATABASE_CLOSE_FAILED"):ops.migrate(self.layout,args)
        self.assertEqual(self.layout.load()["status"],"intervention-required")
        self.assertEqual(list(self.layout.state.glob("migration-*.json")),[])

    def test_bridge_disconnect_never_masks_primary_failure(self):
        db=object.__new__(ops.Database)
        with mock.patch.object(db,"close",side_effect=c.Refused("DATABASE_CLOSE_FAILED")):
            with self.assertRaisesRegex(c.Refused,"MIGRATION_FAILED"):
                with db:raise c.Refused("MIGRATION_FAILED")
            with self.assertRaisesRegex(c.Refused,"DATABASE_CLOSE_FAILED"):
                with db:pass

    def test_bridge_close_timeout_is_not_success(self):
        db=object.__new__(ops.Database);db.p=mock.MagicMock();db.p.poll.return_value=None
        db.p.wait.side_effect=[subprocess.TimeoutExpired("synthetic-bridge",10),-9]
        with self.assertRaisesRegex(c.Refused,"DATABASE_CLOSE_TIMEOUT"):db.close()
        db.p.kill.assert_called_once_with();db.p.stdin.close.assert_called_once_with()

    def test_bridge_only_inherits_credential_for_selected_role(self):
        for mode,key,other in (("migrate","MIGRATION_DATABASE_URL","RUNTIME_DATABASE_URL"),("read","RUNTIME_DATABASE_URL","MIGRATION_DATABASE_URL")):
            with self.subTest(mode=mode),mock.patch.dict(os.environ,{key:"synthetic-selected",other:"synthetic-other","DATABASE_URL":"","UNRELATED_SECRET":"must-not-inherit"},clear=True),mock.patch.object(ops.subprocess,"Popen") as process,mock.patch.object(ops.Database,"read",return_value={"ready":True}):
                ops.Database(self.root,self.root,self.root/"auth.json",mode)
                env=process.call_args.kwargs["env"]
                self.assertEqual(env[key],"synthetic-selected");self.assertNotIn(other,env);self.assertNotIn("UNRELATED_SECRET",env)
                self.assertNotIn("synthetic-selected",str(process.call_args.args))

    def test_expired_authorization_refused_before_connection(self):
        args=self.prepared();p=Path(args.authorization);a=c.read_json(p);a["expiresAt"]="2020-01-01T00:00:00Z";c.atomic_json(p,a)
        with self.assertRaisesRegex(c.Refused,"AUTHORIZATION_EXPIRED"):self.migration(args)
        self.assertEqual(self.layout.load()["status"],"idle")

    def test_no_backup_exemption_on_upgrade(self):
        args=self.prepared(initial=False);p=Path(args.authorization);a=c.read_json(p);a["gates"]["backupVerified"]=False;c.atomic_json(p,a)
        with self.assertRaisesRegex(c.Refused,"MIGRATION_AUTHORIZATION"):self.migration(args)

    def test_database_gates_do_not_require_frontend_gates(self):
        a={"gates":{"writersControlled":True,"heatwaveTlsHomologated":True,"deploymentAuthorized":True}}
        c.operation_gates(a,"inspect-schema")
        for operation in ("activate","rollback","recover","smoke"):
            with self.subTest(operation=operation),self.assertRaisesRegex(c.Refused,"PRODUCTION_GATE_restoreRehearsed"):c.operation_gates(a,operation)
        a["gates"].update(restoreRehearsed=True)
        with self.assertRaisesRegex(c.Refused,"PRODUCTION_GATE_uploadsResolved"):c.operation_gates(a,"activate")

    def test_initial_database_gates_accept_explicit_recovery_only(self):
        args=self.prepared();a=c.read_json(Path(args.authorization));a["gates"].update(heatwaveTlsHomologated=True,deploymentAuthorized=True)
        c.operation_gates(a,"migrate-initial")
        for key in ("restoreRehearsed","backupVerified"):
            bad=json.loads(json.dumps(a));bad["gates"][key]=True
            with self.assertRaisesRegex(c.Refused,"INITIAL_BACKUP_CLAIM_FORBIDDEN"):c.operation_gates(bad,"migrate-initial")

    def test_flock_blocks_first_initialization(self):
        args=self.prepared()
        with c.exclusive_lock(self.layout.state/"operation.lock"):
            with self.assertRaisesRegex(c.Refused,"OPERATION_LOCKED"):self.migration(args)

    def test_prepare_failure_does_not_open_migration_journal(self):
        args=self.prepared();db=mock.MagicMock();db.__enter__.return_value=db;db.ask.side_effect=c.Refused("INITIAL_SCHEMA_NOT_EMPTY")
        with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"assert_stopped"),mock.patch.object(ops,"Database",return_value=db):
            with self.assertRaisesRegex(c.Refused,"INITIAL_SCHEMA_NOT_EMPTY"):ops.migrate(self.layout,args)
        self.assertEqual(self.layout.load()["status"],"idle");self.assertEqual(db.ask.call_count,1)

    def interrupted(self):
        args=self.prepared()
        try:self.migration(args,"MIGRATION_FAILED")
        except c.Refused:pass
        a=c.read_json(Path(args.authorization));a["operation"]="recover-migration";a["migrationKind"]="initial";a["initialRecovery"]=a["initialization"]["recovery"]
        c.atomic_json(Path(args.authorization),a);return args

    def test_recovery_only_accepts_same_target_digest_kind_and_complete_schema(self):
        args=self.interrupted();db=mock.MagicMock();db.__enter__.return_value=db
        for failure in ("FAILED_MIGRATION_HISTORY","SCHEMA_NOT_EXACT","LIVE_SCHEMA_DRIFT","SCHEMA_FINGERPRINT"):
            db.ask.side_effect=c.Refused(failure)
            with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"assert_stopped"),mock.patch.object(ops,"Database",return_value=db):
                with self.assertRaisesRegex(c.Refused,failure):ops.recover_migration(self.layout,args)
            self.assertEqual(self.layout.load()["status"],"intervention-required")
        db.ask.side_effect=None;db.ask.return_value={"fingerprint":"f"*64}
        with mock.patch.object(ops,"native_context"),mock.patch.object(ops,"assert_stopped"),mock.patch.object(ops,"Database",return_value=db):ops.recover_migration(self.layout,args)
        self.assertEqual(self.layout.load()["phase"],"migration-recovered");self.assertIsNone(self.layout.load()["current"])
        self.assertEqual(db.ask.call_args.args,("compatible",))

    def test_recovery_does_not_acknowledge_other_target(self):
        args=self.interrupted();s=self.layout.load();s["target"]="different";self.layout.save(s)
        with mock.patch.object(ops,"native_context"):
            with self.assertRaisesRegex(c.Refused,"RECOVERY_TARGET"):ops.recover_migration(self.layout,args)

    def test_application_recover_cannot_bypass_migration_quarantine(self):
        args=self.interrupted();a=c.read_json(Path(args.authorization));a["operation"]="recover";c.atomic_json(Path(args.authorization),a)
        with mock.patch.object(ops,"native_context"):
            with self.assertRaisesRegex(c.Refused,"USE_MIGRATION_RECOVERY"):ops.activate(self.layout,args,"recover")

    def test_admin_chain_not_only_manifest_label_is_verified(self):
        rid,_,_=self.stage();root=self.layout.admin/rid
        (root/"prisma/migrations/20260101000000_fixture/migration.sql").write_text("SELECT 2;")
        m=c.read_json(root/"manifest.json");m["files"]=c.inventory(root);(root/"manifest.json").write_bytes(c.encoded(m))
        with self.assertRaisesRegex(c.Refused,"ADMIN_MIGRATION_INTEGRITY"):c.verify_tree(root,"admin")

    def test_migration_chain_duplicate_and_order_are_rejected(self):
        rid,_,_=self.stage();m=c.read_json(self.layout.releases/rid/"manifest.json")
        m["schema"]["migrations"]*=2;m["schema"]["chainSha256"]=c.digest(c.encoded(m["schema"]["migrations"]))
        with self.assertRaisesRegex(c.Refused,"INVALID_MIGRATION_CHAIN"):c.validate_manifest(m,"runtime")

    def test_duplicate_json_authorization_is_not_last_value_wins(self):
        path=self.root/"bad.json";path.write_text('{"operation":"migrate", "operation":"migrate-initial"}');path.chmod(0o600)
        with self.assertRaisesRegex(c.Refused,"DUPLICATE_JSON_FIELD"):c.private_json(path)

if __name__=="__main__":unittest.main()
