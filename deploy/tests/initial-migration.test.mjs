import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as contract from "../scripts/lib/migration-contract.mjs";

const clock = Date.parse("2026-10-17T12:00:00.000Z");
function fixture() {
  const manifest = {
    schema: {
      chainSha256: "a".repeat(64),
      schemaSha256: "b".repeat(64),
      migrations: Array.from({ length: 68 }, (_, i) => ({ name: String(i) })),
    },
  };
  const auth = {
    authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    operation: "migrate-initial",
    environment: "disposable",
    releaseId: "20261017T120000Z-" + "c".repeat(40) + "-" + "d".repeat(12),
    descriptorSha256: "e".repeat(64),
    expiresAt: "2026-10-17T12:09:00.000Z",
    gates: { writersControlled: true },
    target: {
      host: "127.0.0.1",
      port: 55281,
      schema: "tf_oci_123456789abc_test",
      serverUuid: "uuid-test",
      version: "26.7.0",
      migrationUser: "tf_migration",
      migrationAccount: "tf_migration@127.0.0.1",
      runtimeAccount: "tf_runtime@127.0.0.1",
    },
    initialization: {
      formatVersion: 1,
      chainSha256: "a".repeat(64),
      schemaSha256: "b".repeat(64),
      inspection: {
        path: "/private/tmp/fixture-transcript",
        sha256: "f".repeat(64),
        inspectorAccount: "tf_inspector@127.0.0.1",
        inspectorRoles: [],
        catalogVisibilityReview: "synthetic-review-001",
      },
      recovery: {
        strategy: contract.INITIAL_RECOVERY,
        planReference: "synthetic-initial-plan",
        operatorId: "synthetic-operator",
      },
    },
  };
  const row = [
    "traceflow-initial-schema-v1",
    auth.authorizationId,
    auth.releaseId,
    auth.descriptorSha256,
    manifest.schema.chainSha256,
    clock - 1000,
    auth.target.serverUuid,
    "26.7.0",
    55281,
    auth.target.schema,
    auth.initialization.inspection.inspectorAccount,
    61,
    "utf8mb4",
    "utf8mb4_unicode_ci",
    "public",
    0,
    "tf_migration",
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    "TLS_AES_128_GCM_SHA256",
    "TLSv1.3",
    auth.target.migrationAccount,
    1,
    0,
    "NONE",
  ];
  const bytes = () => {
    const b = Buffer.from(
      JSON.stringify(row) +
        "\n0\nGRANT SELECT, EVENT, TRIGGER, SHOW_ROUTINE ON *.* TO `tf_inspector`@`127.0.0.1`\n0\n",
    );
    auth.initialization.inspection.sha256 = contract.sha256(b);
    return b;
  };
  return { auth, manifest, row, bytes };
}
const empty = () => ({
  historyTablePresent: false,
  applied: [],
  tableCount: 0,
  objectCounts: { tables: 0, views: 0, routines: 0, triggers: 0, events: 0 },
});
const fails = (f, code) => assert.throws(f, code ? { code } : undefined);

test("initialization requires no invented backup claims", () => {
  const { auth, manifest, bytes } = fixture();
  bytes();
  contract.validateMigrationPolicy(auth, manifest);
  assert.equal(
    contract.validateInitialTranscript(bytes(), auth, manifest, clock)
      .mandatoryRoles,
    "public",
  );
  contract.assertInitialSnapshot(empty());
});
for (const field of ["backupVerified", "restoreRehearsed", "backupReference"])
  for (const value of [true, false, "invented-backup"])
    test("initial rejects backup claim " + field + " " + value, () => {
      const { auth, manifest } = fixture();
      if (field === "backupReference") auth[field] = value;
      else auth.gates[field] = value;
      fails(
        () => contract.validateMigrationPolicy(auth, manifest),
        "INITIAL_BACKUP_CLAIM_FORBIDDEN",
      );
    });
for (const [name, edit] of [
  ["unknown version", (a) => (a.initialization.formatVersion = 2)],
  ["chain mismatch", (a) => (a.initialization.chainSha256 = "0".repeat(64))],
  ["schema mismatch", (a) => (a.initialization.schemaSha256 = "0".repeat(64))],
  ["missing recovery", (a) => delete a.initialization.recovery],
  [
    "destructive recovery",
    (a) => (a.initialization.recovery.strategy = "reset-automatically"),
  ],
  ["missing inspection", (a) => delete a.initialization.inspection],
  [
    "unreviewed visibility",
    (a) => delete a.initialization.inspection.catalogVisibilityReview,
  ],
  ["extra field", (a) => (a.initialization.force = true)],
  ["missing authorization id", (a) => delete a.authorizationId],
  ["writers not controlled", (a) => (a.gates.writersControlled = false)],
])
  test("initial refuses " + name, () => {
    const { auth, manifest } = fixture();
    edit(auth);
    fails(() => contract.validateMigrationPolicy(auth, manifest));
  });
test("initial chain must contain precisely the 68 approved files", () => {
  const { auth, manifest } = fixture();
  manifest.schema.migrations.pop();
  fails(
    () => contract.validateMigrationPolicy(auth, manifest),
    "INITIAL_CHAIN_COUNT",
  );
});
for (const field of ["tables", "views", "routines", "triggers", "events"])
  test("initial rejects preexisting " + field, () => {
    const s = empty();
    s.objectCounts[field] = 1;
    fails(() => contract.assertInitialSnapshot(s), "INITIAL_SCHEMA_NOT_EMPTY");
  });
test("empty Prisma history table is not a pristine schema", () => {
  const s = empty();
  s.historyTablePresent = true;
  fails(() => contract.assertInitialSnapshot(s), "INITIAL_SCHEMA_NOT_EMPTY");
});
test("existing history is never initial", () => {
  const s = empty();
  s.applied.push({ name: "applied" });
  fails(() => contract.assertInitialSnapshot(s), "INITIAL_SCHEMA_NOT_EMPTY");
});
test("missing inventory is not zero", () => {
  const s = empty();
  delete s.objectCounts.events;
  fails(() => contract.assertInitialSnapshot(s), "INITIAL_SCHEMA_NOT_EMPTY");
});
test("upgrade requires history and real backup/restore gates", () => {
  const { auth, manifest } = fixture();
  auth.operation = "migrate";
  delete auth.initialization;
  fails(
    () => contract.validateMigrationPolicy(auth, manifest),
    "MIGRATION_AUTHORIZATION",
  );
  auth.gates.backupVerified = true;
  auth.gates.restoreRehearsed = true;
  auth.backupReference = "synthetic-backup-reference";
  contract.validateMigrationPolicy(auth, manifest);
  fails(
    () => contract.assertUpgradeSnapshot(empty()),
    "INITIAL_MIGRATION_REQUIRED",
  );
  contract.assertUpgradeSnapshot({ historyTablePresent: true, applied: [{}] });
});
for (const zone of ["UTC", "+00:00"])
  for (const zero of [0, 0n, "0"])
    test("effective UTC accepts " + zone + " " + typeof zero, () =>
      contract.validateUtc({
        globalTimeZone: zone,
        sessionTimeZone: zone,
        utcOffsetSeconds: zero,
      }),
    );
for (const row of [
  { globalTimeZone: "SYSTEM", sessionTimeZone: "+00:00", utcOffsetSeconds: 0 },
  {
    globalTimeZone: "UTC",
    sessionTimeZone: "-03:00",
    utcOffsetSeconds: -10800,
  },
  { globalTimeZone: "UTC", sessionTimeZone: "UTC", utcOffsetSeconds: 1 },
  { globalTimeZone: "UTC", sessionTimeZone: "UTC", utcOffsetSeconds: null },
  { globalTimeZone: "UTC", sessionTimeZone: "UTC", utcOffsetSeconds: "" },
  {
    globalTimeZone: "Europe/London",
    sessionTimeZone: "Europe/London",
    utcOffsetSeconds: 0,
  },
])
  test("refuse non-proven UTC " + JSON.stringify(row), () =>
    fails(() => contract.validateUtc(row), "MIGRATION_UTC_REQUIRED"),
  );
for (const [name, index, value] of [
  ["other authorization", 1, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  ["other release", 2, "other"],
  ["other digest", 3, "0".repeat(64)],
  ["other chain", 4, "0".repeat(64)],
  ["future", 5, clock + 1],
  ["expired", 5, clock - 600000],
  ["wrong uuid", 6, "other"],
  ["wrong version", 7, "8.4.8"],
  ["wrong port", 8, 3306],
  ["wrong schema", 9, "other"],
  ["wrong inspector", 10, "other@%"],
  ["charset", 12, "latin1"],
  ["collation", 13, "utf8mb4_0900_ai_ci"],
  ["unknown mandatory role", 14, "other"],
  ["public exists", 15, 1],
  ["wrong migration user", 16, "other"],
  ["extra host identity", 17, 2],
  ["explicit role", 18, 1],
  ["default role", 19, 1],
  ["table", 20, 1],
  ["routine", 21, 1],
  ["trigger", 22, 1],
  ["event", 23, 1],
  ["history table", 24, 1],
  ["notes disabled", 25, 0],
  ["TLS not required", 26, 0],
  ["no cipher", 27, ""],
  ["old TLS", 28, "TLSv1.1"],
  ["wrong migration host", 29, "tf_migration@%"],
  ["partial revokes mismatch", 30, 0],
  ["activate all roles", 31, 1],
])
  test("inspection refuses " + name, () => {
    const f = fixture();
    f.row[index] = value;
    fails(() =>
      contract.validateInitialTranscript(f.bytes(), f.auth, f.manifest, clock),
    );
  });
for (const [name, text] of [
  ["warning", "[]\n1\n"],
  ["missing counter", "[]\n"],
  ["extra result", "[]\n0\n0\n"],
  ["malformed", "not-json\n0\n"],
  ["object rather than array", "{}\n0\n"],
  ["truncated", "[]\n0"],
])
  test("transcript refuses " + name, () => {
    const f = fixture(),
      b = Buffer.from(text);
    f.auth.initialization.inspection.sha256 = contract.sha256(b);
    fails(() =>
      contract.validateInitialTranscript(b, f.auth, f.manifest, clock),
    );
  });
test("inspection hash cannot be replaced", () => {
  const f = fixture(),
    b = f.bytes();
  f.auth.initialization.inspection.sha256 = "0".repeat(64);
  fails(
    () => contract.validateInitialTranscript(b, f.auth, f.manifest, clock),
    "INITIAL_EVIDENCE_HASH",
  );
});
test("inspection cannot outlive authorization", () => {
  const f = fixture();
  f.auth.expiresAt = new Date(clock).toISOString();
  fails(
    () =>
      contract.validateInitialTranscript(f.bytes(), f.auth, f.manifest, clock),
    "INITIAL_EVIDENCE_EXPIRED",
  );
});
test("protected evidence refuses symlink and broad mode", () => {
  const dir = mkdtempSync(
    (process.platform === "darwin" ? "/private/tmp" : tmpdir()) +
      "/tf07-custody-",
  );
  try {
    const file = dir + "/evidence";
    writeFileSync(file, "fixture", { mode: 0o600 });
    assert.equal(contract.protectedBytes(file, true).toString(), "fixture");
    symlinkSync(file, dir + "/link");
    fails(() => contract.protectedBytes(dir + "/link", true));
    chmodSync(file, 0o644);
    fails(() => contract.protectedBytes(file, true));
    chmodSync(file, 0o600);
    mkdirSync(dir + "/unsafe", { mode: 0o777 });
    chmodSync(dir + "/unsafe", 0o777);
    writeFileSync(dir + "/unsafe/evidence", "fixture", { mode: 0o600 });
    fails(() => contract.protectedBytes(dir + "/unsafe/evidence", true));
  } finally {
    rmSync(dir, { recursive: true });
  }
});
const required = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "INDEX",
  "REFERENCES",
];
function grants(rights = required, column = "f0") {
  return [
    { [column]: "GRANT USAGE ON *.* TO `tf_migration`@`127.0.0.1`" },
    {
      [column]:
        "GRANT " +
        rights.join(", ") +
        " ON `tf_oci_123456789abc_test`.* TO `tf_migration`@`127.0.0.1`",
    },
  ];
}
for (const column of ["f0", "Grants for tf_migration@127.0.0.1"])
  test("migrator exact nine grants accepted " + column, () =>
    contract.validateReleaseGrants(
      grants(required, column),
      fixture().auth.target,
      "migrate",
      "tf_migration@127.0.0.1",
      true,
    ),
  );
for (const right of required)
  test("migration refuses missing privilege " + right, () =>
    fails(
      () =>
        contract.validateReleaseGrants(
          grants(required.filter((x) => x !== right)),
          fixture().auth.target,
          "migrate",
          "tf_migration@127.0.0.1",
          true,
        ),
      "MIGRATION_DDL_PRIVILEGE",
    ),
  );
for (const grant of [
  "GRANT ALL PRIVILEGES ON `tf_oci_123456789abc_test`.* TO `tf_migration`@`127.0.0.1`",
  "GRANT SELECT ON *.* TO `tf_migration`@`127.0.0.1`",
  "GRANT `public`@`%` TO `tf_migration`@`127.0.0.1`",
  "GRANT SELECT ON `other`.* TO `tf_migration`@`127.0.0.1`",
  "GRANT SELECT ON `tf_oci_123456789abc_test`.* TO `tf_migration`@`127.0.0.1` WITH GRANT OPTION",
  "GRANT USAGE ON *.* TO `tf_migration`@`%`",
])
  test("refuse excessive/ambiguous migration grant " + grant, () =>
    fails(() =>
      contract.validateReleaseGrants(
        [...grants(), { f0: grant }],
        fixture().auth.target,
        "migrate",
        "tf_migration@127.0.0.1",
        true,
      ),
    ),
  );
for (const rows of [
  [{ wrong: "hidden" }],
  [],
  [{ f0: 1 }],
  [{ f0: "x", extra: "x" }],
  [
    Object.defineProperty({}, "f0", {
      get() {
        throw Error("must-not-run");
      },
    }),
  ],
])
  test("refuse malformed grant shape " + JSON.stringify(rows), () =>
    fails(
      () =>
        contract.validateReleaseGrants(
          rows,
          fixture().auth.target,
          "migrate",
          "tf_migration@127.0.0.1",
          true,
        ),
      "MALFORMED_DATABASE_GRANTS",
    ),
  );
test("inspection SQL uses fixed read statements and immediate warning counter", () => {
  const f = fixture();
  const sql = contract.initialInspectionSql(f.auth, f.manifest);
  assert.match(sql, /^SELECT JSON_ARRAY\(/);
  assert.match(sql, /;\nSHOW COUNT\(\*\) WARNINGS;\n$/);
  assert.equal(sql.split(";").length, 5);
  for (const source of [
    "TABLES",
    "ROUTINES",
    "TRIGGERS",
    "EVENTS",
    "mysql.user",
    "mysql.role_edges",
    "mysql.default_roles",
  ])
    assert.ok(sql.includes(source));
  f.auth.target.schema = "x'; DROP DATABASE x";
  fails(() => contract.initialInspectionSql(f.auth, f.manifest));
});

for (const absent of ["SELECT", "EVENT", "TRIGGER"])
  test("administrative metadata proof refuses missing " + absent, () => {
    const f = fixture();
    const rights = ["SELECT", "EVENT", "TRIGGER", "SHOW_ROUTINE"].filter(
      (x) => x !== absent,
    );
    fails(
      () =>
        contract.validateMetadataVisibility(
          [
            "GRANT " +
              rights.join(", ") +
              " ON *.* TO `tf_inspector`@`127.0.0.1`",
          ],
          f.auth.initialization.inspection,
          f.auth.target.schema,
          "NONE",
        ),
      "INITIAL_METADATA_VISIBILITY",
    );
  });
test("schema SELECT alone does not prove routine visibility", () => {
  const f = fixture();
  fails(
    () =>
      contract.validateMetadataVisibility(
        [
          "GRANT SELECT, EVENT, TRIGGER ON `" +
            f.auth.target.schema +
            "`.* TO `tf_inspector`@`127.0.0.1`",
        ],
        f.auth.initialization.inspection,
        f.auth.target.schema,
        "NONE",
      ),
    "INITIAL_METADATA_VISIBILITY",
  );
});
test("active administrative role must really expand and permit visibility", () => {
  const f = fixture(),
    spec = f.auth.initialization.inspection;
  spec.inspectorRoles = [{ user: "inspector_role", host: "%" }];
  const assignment = "GRANT `inspector_role`@`%` TO `tf_inspector`@`127.0.0.1`";
  fails(
    () =>
      contract.validateMetadataVisibility(
        [assignment],
        spec,
        f.auth.target.schema,
        "`inspector_role`@`%`",
      ),
    "INITIAL_METADATA_VISIBILITY",
  );
  const rights =
    "GRANT SELECT, EVENT, TRIGGER ON *.* TO `tf_inspector`@`127.0.0.1`";
  contract.validateMetadataVisibility(
    [rights, assignment],
    spec,
    f.auth.target.schema,
    "`inspector_role`@`%`",
  );
  fails(
    () =>
      contract.validateMetadataVisibility(
        [rights, assignment],
        spec,
        f.auth.target.schema,
        "NONE",
      ),
    "INITIAL_INSPECTOR_ROLES",
  );
});
test("partial revoke on authorized schema invalidates metadata coverage", () => {
  const f = fixture(),
    spec = f.auth.initialization.inspection;
  fails(
    () =>
      contract.validateMetadataVisibility(
        [
          "GRANT SELECT, EVENT, TRIGGER ON *.* TO `tf_inspector`@`127.0.0.1`",
          "REVOKE SELECT ON `" +
            f.auth.target.schema +
            "`.* FROM `tf_inspector`@`127.0.0.1`",
        ],
        spec,
        f.auth.target.schema,
        "NONE",
      ),
    "INITIAL_METADATA_VISIBILITY",
  );
});

test("MySQL binary JSON role encoding is not accepted as a textual role", () => {
  const f = fixture();
  f.row[32] = "base64:type15:Tk9ORQ==";
  fails(
    () =>
      contract.validateInitialTranscript(f.bytes(), f.auth, f.manifest, clock),
    "INITIAL_INSPECTOR_ROLES",
  );
  assert.ok(
    contract
      .initialInspectionSql(f.auth, f.manifest)
      .includes("CAST(CURRENT_ROLE() AS CHAR CHARACTER SET utf8mb4)"),
  );
});

// Exact non-secret SHOW GRANTS lines supplied by the operator for OCI-07.4.
// Other evidence values remain synthetic; these tests never open a connection.
const HEATWAVE_PROXY =
  "GRANT PROXY ON ``@`` TO `traceflow_admin`@`%` WITH GRANT OPTION";
const HEATWAVE_ROLE =
  "GRANT `administrator`@`%` TO `traceflow_admin`@`%` WITH ADMIN OPTION";
const HEATWAVE_METADATA =
  "GRANT SELECT, EVENT, TRIGGER ON *.* TO `traceflow_admin`@`%` WITH GRANT OPTION";
function heatwaveInspector() {
  const f = fixture(),
    spec = f.auth.initialization.inspection;
  spec.inspectorAccount = "traceflow_admin@%";
  spec.inspectorRoles = [{ user: "administrator", host: "%" }];
  f.auth.target.schema = f.row[9] = "traceflow";
  f.row[10] = spec.inspectorAccount;
  f.row[32] = "`administrator`@`%`";
  const validate = (grants) =>
    contract.validateMetadataVisibility(grants, spec, "traceflow", f.row[32]);
  const transcript = (grants) => {
    const bytes = Buffer.from(
      JSON.stringify(f.row) + "\n0\n" + grants.join("\n") + "\n0\n",
    );
    spec.sha256 = contract.sha256(bytes);
    return bytes;
  };
  return { ...f, spec, validate, transcript };
}

test("HeatWave proxy and ADMIN OPTION preserve the initial inspection contract", () => {
  const f = heatwaveInspector();
  const bytes = f.transcript([
    HEATWAVE_METADATA,
    HEATWAVE_PROXY,
    HEATWAVE_ROLE,
    "REVOKE INSERT, UPDATE, DELETE ON `mysql`.* FROM `traceflow_admin`@`%`",
  ]);
  contract.validateMigrationPolicy(f.auth, f.manifest);
  const proof = contract.validateInitialTranscript(
    bytes,
    f.auth,
    f.manifest,
    clock,
  );
  assert.equal(proof.sha256, f.spec.sha256);
  const sql = contract.initialInspectionSql(f.auth, f.manifest);
  assert.match(
    sql,
    /SHOW GRANTS FOR CURRENT_USER USING `administrator`@`%`;\nSHOW COUNT\(\*\) WARNINGS;\n$/,
  );
  assert.equal(sql.split(";").length, 5);
});

for (const grants of [
  [HEATWAVE_PROXY],
  [HEATWAVE_ROLE],
  [HEATWAVE_PROXY, HEATWAVE_ROLE],
  [
    "GRANT USAGE ON *.* TO `traceflow_admin`@`%`",
    HEATWAVE_PROXY,
    HEATWAVE_ROLE,
  ],
])
  test(
    "delegation never proves metadata visibility: " +
      grants.length +
      " lines " +
      grants[0],
    () => {
      fails(
        () => heatwaveInspector().validate(grants),
        "INITIAL_METADATA_VISIBILITY",
      );
    },
  );

for (const absent of ["SELECT", "EVENT", "TRIGGER"])
  test("authorized HeatWave delegations do not replace " + absent, () => {
    const rights = ["SELECT", "EVENT", "TRIGGER", "SHOW_ROUTINE"].filter(
      (p) => p !== absent,
    );
    fails(
      () =>
        heatwaveInspector().validate([
          "GRANT " + rights.join(", ") + " ON *.* TO `traceflow_admin`@`%`",
          HEATWAVE_PROXY,
          HEATWAVE_ROLE,
        ]),
      "INITIAL_METADATA_VISIBILITY",
    );
  });

test("delegation does not replace routine visibility; compact dynamic lists are parsed", () => {
  const f = heatwaveInspector();
  const grants = [
    "GRANT SELECT, EVENT, TRIGGER ON `traceflow`.* TO `traceflow_admin`@`%`",
    HEATWAVE_PROXY,
    HEATWAVE_ROLE,
  ];
  fails(() => f.validate(grants), "INITIAL_METADATA_VISIBILITY");
  f.validate([
    ...grants,
    "GRANT ROLE_ADMIN,SHOW_ROUTINE ON *.* TO `traceflow_admin`@`%` WITH GRANT OPTION",
  ]);
});

test("documented HeatWave administrative grant lists remain compatible", () => {
  const f = heatwaveInspector();
  // Documented profile, not a claim that these other lines were collected here.
  const staticRights =
    "SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, PROCESS, REFERENCES, INDEX, ALTER, SHOW DATABASES, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, REPLICATION SLAVE, REPLICATION CLIENT, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, ALTER ROUTINE, CREATE USER, EVENT, TRIGGER, CREATE ROLE, DROP ROLE";
  const dynamicRights =
    "APPLICATION_PASSWORD_ADMIN,AUDIT_ADMIN,BACKUP_ADMIN,CONNECTION_ADMIN,EXPORT_QUERY_RESULTS,FLUSH_OPTIMIZER_COSTS,FLUSH_PRIVILEGES,FLUSH_STATUS,FLUSH_TABLES,FLUSH_USER_RESOURCES,OPTION_TRACKER_OBSERVER,REPLICATION_APPLIER,ROLE_ADMIN,SET_ANY_DEFINER,SHOW_ROUTINE,TRANSACTION_GTID_TAG,VECTOR_STORE_LOAD_EXEC,XA_RECOVER_ADMIN";
  f.validate([
    "GRANT " +
      staticRights +
      " ON *.* TO `traceflow_admin`@`%` WITH GRANT OPTION",
    "GRANT " +
      dynamicRights +
      " ON *.* TO `traceflow_admin`@`%` WITH GRANT OPTION",
    "GRANT CREATE TEMPORARY TABLES ON `sys`.* TO `traceflow_admin`@`%` WITH GRANT OPTION",
    "REVOKE INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, CREATE TEMPORARY TABLES, LOCK TABLES, EXECUTE, CREATE VIEW, CREATE ROUTINE, ALTER ROUTINE, EVENT, TRIGGER ON `mysql`.* FROM `traceflow_admin`@`%`",
    "REVOKE CREATE, DROP, REFERENCES, INDEX, ALTER, LOCK TABLES, CREATE VIEW, CREATE ROUTINE, ALTER ROUTINE, EVENT, TRIGGER ON `sys`.* FROM `traceflow_admin`@`%`",
    HEATWAVE_PROXY,
    HEATWAVE_ROLE,
  ]);
  f.validate([
    HEATWAVE_METADATA,
    HEATWAVE_PROXY,
    HEATWAVE_ROLE.replace(" WITH ADMIN OPTION", ""),
  ]);
});

for (const right of ["CREATE ROUTINE", "ALTER ROUTINE", "EXECUTE"])
  test(
    "routine visibility through schema privilege remains supported: " + right,
    () => {
      heatwaveInspector().validate([
        "GRANT SELECT, EVENT, TRIGGER, " +
          right +
          " ON `traceflow`.* TO `traceflow_admin`@`%`",
        HEATWAVE_PROXY,
        HEATWAVE_ROLE,
      ]);
    },
  );

for (const [name, grant] of [
  ["proxy account", HEATWAVE_PROXY.replace("``@``", "`other`@`%`")],
  ["proxy host", HEATWAVE_PROXY.replace("``@``", "``@`%`")],
  ["proxy recipient", HEATWAVE_PROXY.replace("`traceflow_admin`", "`other`")],
  [
    "proxy recipient host",
    HEATWAVE_PROXY.replace(
      "TO `traceflow_admin`@`%`",
      "TO `traceflow_admin`@`localhost`",
    ),
  ],
  [
    "proxy without approved option",
    HEATWAVE_PROXY.replace(" WITH GRANT OPTION", ""),
  ],
  [
    "proxy ADMIN OPTION",
    HEATWAVE_PROXY.replace("GRANT OPTION", "ADMIN OPTION"),
  ],
  ["role name", HEATWAVE_ROLE.replace("`administrator`", "`other`")],
  [
    "role host",
    HEATWAVE_ROLE.replace("`administrator`@`%`", "`administrator`@`localhost`"),
  ],
  ["role recipient", HEATWAVE_ROLE.replace("`traceflow_admin`", "`other`")],
  [
    "role recipient host",
    HEATWAVE_ROLE.replace(
      "TO `traceflow_admin`@`%`",
      "TO `traceflow_admin`@`localhost`",
    ),
  ],
  [
    "additional role",
    HEATWAVE_ROLE.replace(
      "`administrator`@`%`",
      "`administrator`@`%`,`other`@`%`",
    ),
  ],
  ["role GRANT OPTION", HEATWAVE_ROLE.replace("ADMIN OPTION", "GRANT OPTION")],
  [
    "privilege ADMIN OPTION",
    HEATWAVE_METADATA.replace("GRANT OPTION", "ADMIN OPTION"),
  ],
  ["trailing SQL", HEATWAVE_PROXY + "; SELECT 1"],
  ["trailing delimiter", HEATWAVE_ROLE + ";"],
  ["newline", HEATWAVE_PROXY + "\n"],
  ["comment", HEATWAVE_ROLE + " /* synthetic */"],
  ["unknown concession", "GRANT SOMETHING TO `traceflow_admin`@`%`"],
  [
    "unknown privilege",
    "GRANT UNKNOWN_PRIVILEGE ON *.* TO `traceflow_admin`@`%`",
  ],
  [
    "unknown revoked privilege",
    "REVOKE UNKNOWN_PRIVILEGE ON `mysql`.* FROM `traceflow_admin`@`%`",
  ],
  ["empty privilege", "GRANT SELECT,, EVENT ON *.* TO `traceflow_admin`@`%`"],
  [
    "duplicate privilege",
    "GRANT SELECT,SELECT ON *.* TO `traceflow_admin`@`%`",
  ],
  ["mixed ALL", "GRANT ALL PRIVILEGES, SELECT ON *.* TO `traceflow_admin`@`%`"],
  [
    "dynamic privilege on schema",
    "GRANT SHOW_ROUTINE ON `traceflow`.* TO `traceflow_admin`@`%`",
  ],
  [
    "revoked target",
    "REVOKE SELECT ON `traceflow`.* FROM `traceflow_admin`@`%`",
  ],
  ["revoke recipient", "REVOKE SELECT ON `mysql`.* FROM `other`@`%`"],
])
  test(
    "metadata parser refuses " + name + " despite sufficient other grants",
    () => {
      fails(
        () => heatwaveInspector().validate([HEATWAVE_METADATA, grant]),
        "INITIAL_METADATA_VISIBILITY",
      );
    },
  );

test("HeatWave proxy requires the exact authorized and active administrator role", () => {
  const f = heatwaveInspector();
  for (const roles of [[], [{ user: "other", host: "%" }]]) {
    f.spec.inspectorRoles = roles;
    f.row[32] = roles.length ? "`other`@`%`" : "NONE";
    fails(
      () => f.validate([HEATWAVE_METADATA, HEATWAVE_PROXY]),
      "INITIAL_METADATA_VISIBILITY",
    );
  }
  f.spec.inspectorRoles = [{ user: "administrator", host: "%" }];
  for (const active of [
    "NONE",
    "`administrator`@`localhost`",
    "`administrator`@`%`,`other`@`%`",
  ]) {
    f.row[32] = active;
    fails(
      () => f.validate([HEATWAVE_METADATA, HEATWAVE_PROXY, HEATWAVE_ROLE]),
      "INITIAL_INSPECTOR_ROLES",
    );
  }
});

test("duplicate delegations and malformed types are refused", () => {
  for (const grant of [HEATWAVE_PROXY, HEATWAVE_ROLE, null, {}, 1]) {
    fails(
      () => heatwaveInspector().validate([HEATWAVE_METADATA, grant, grant]),
      "INITIAL_METADATA_VISIBILITY",
    );
  }
});

test("HeatWave metadata exceptions never apply to migration or runtime account grants", () => {
  const target = fixture().auth.target;
  for (const mode of ["migrate", "read"]) {
    const account =
      mode === "migrate" ? target.migrationAccount : target.runtimeAccount;
    const recipient = "`" + account.replace("@", "`@`") + "`";
    for (const grant of [HEATWAVE_PROXY, HEATWAVE_ROLE]) {
      fails(
        () =>
          contract.validateReleaseGrants(
            [
              {
                f0: grant.replace(
                  "TO `traceflow_admin`@`%`",
                  "TO " + recipient,
                ),
              },
            ],
            target,
            mode,
            account,
            true,
          ),
        "EXCESSIVE_DATABASE_PRIVILEGES",
      );
    }
  }
});
