import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as admin from "../../backend/scripts/lib/heatwave-admin-audit.js";
import * as audit from "../../backend/scripts/lib/heatwave-audit-evidence.js";
import {
  completeAuditedSession,
  AUDITED_SETTINGS_SQL,
  AUDITED_FINAL_SQL,
} from "../../backend/scripts/lib/heatwave-prisma-audit.js";
import { parseRoleAttestationJson } from "../../backend/scripts/lib/heatwave-role-attestation.js";
import { diagnosticFailure } from "../../backend/scripts/lib/heatwave-connection.js";
import { sanitizedResult } from "../scripts/diagnostic-launcher.mjs";
import {
  auditFixture,
  transcript,
} from "./helpers/administrative-audit-fixture.mjs";

const row = (f, name) => f.observations.find((o) => o.queryId === name);
const validate = (f) =>
  admin.validateAdministrativeObservations(
    f.observations,
    f.authorization.target,
  );
const consolidate = (f) =>
  audit.consolidateEvidence(f, f.authorization, f.binding, f.now);
test("synthetic complete collection, evidence chain and qualified consolidated contract", () => {
  const f = auditFixture();
  const text = transcript(f.observations);
  const parsed = admin.validateAdministrativeCollection(
    { exitCode: 0, signal: null, stderrBytes: 0, stdout: text },
    f.authorization.target,
  );
  assert.deepEqual(parsed, f.observations);
  const result = consolidate(f);
  assert.equal(result.status, "PASS");
  assert.equal(result.final, true);
  assert.equal(result.writes, false);
  assert.equal(result.payload.atomicSnapshot, false);
  assert.equal(result.payload.continuousAudit, false);
  assert.equal(result.payload.operationalPolicy, "operator-controlled-v1");
  assert.equal(
    result.payload.residualLimitation,
    "TRANSIENT_ACL_CHANGES_NOT_AUTOMATICALLY_DETECTED",
  );
  assert.deepEqual(result.previous, audit.reference(f.final));
});
test("deployed path is deliberately closed before file/credential/network access", async () => {
  assert.throws(() => audit.requireValidatedAdministrativeRuntime(), {
    code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
  });
  await assert.rejects(audit.loadInitialAudit({}, "/untrusted"), {
    code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
  });
});
test("approved fixed SQL pairs each source with an immediate textual count", () => {
  const sql = admin.administrativeSql();
  assert.equal(
    (sql.match(/SHOW COUNT\(\*\) WARNINGS;/g) || []).length,
    admin.ADMIN_PLAN.length,
  );
  for (const spec of admin.ADMIN_PLAN)
    assert.ok(sql.includes(spec.sql + ";\nSHOW COUNT(*) WARNINGS;"));
  assert.ok(
    !/SELECT \*|SHOW WARNINGS;|SET |USING 'public'|authentication_string\)/.test(
      sql,
    ),
  );
  assert.ok(!sql.includes("JSON_ARRAY(User_attributes)"));
  assert.ok(sql.includes("JSON_EXTRACT(User_attributes, '$.Restrictions')"));
  for (const spec of admin.ADMIN_PLAN.filter((q) =>
    ["DYNAMIC", "SCHEMA", "TABLE", "COLUMN", "ROUTINE", "PROXY"].includes(q.id),
  )) {
    assert.ok(spec.sql.includes("User = 'traceflow_diag'"));
    assert.ok(!spec.sql.includes("Host =") && !spec.sql.includes("Db ="));
  }
});
test("grant representation preserves full scope/identity/options and original digest reversibly", () => {
  for (const sql of admin.GRANTS) {
    const evidence = admin.grantEvidence(sql);
    assert.equal(admin.restoreGrantEvidence(evidence), sql);
    assert.equal(evidence.sourceSha256, admin.byteHash(sql));
    assert.equal(evidence.granteeHost, "10.20.1.184");
    assert.equal(evidence.grantOption, false);
    assert.equal(evidence.adminOption, false);
    for (const key of Object.keys(evidence)) {
      const changed = { ...evidence, [key]: "tampered" };
      assert.throws(() => admin.restoreGrantEvidence(changed));
    }
  }
  const f = auditFixture();
  assert.deepEqual(
    admin.decodeAdministrativeObservations(f.initial.payload.observations),
    f.observations,
  );
  const stored = JSON.stringify(f.initial);
  assert.ok(
    !stored.includes("GRANT ") &&
      !stored.includes("SELECT JSON") &&
      !stored.includes("mysql://"),
  );
  assert.ok(Buffer.byteLength(stored) < 16384);
  assert.throws(() => admin.grantEvidence("GRANT INSERT ON *.* TO x"));
});
for (const [name, mutate] of [
  ["missing source", (f) => f.observations.pop()],
  ["source order", (f) => f.observations.reverse()],
  ["SQL failure", (f) => (row(f, "USER").status = "FAIL")],
  ["warning", (f) => (row(f, "USER").warningCount = 1)],
  ["missing counter", (f) => delete row(f, "USER").warningCount],
  ["counter string", (f) => (row(f, "USER").warningCount = "0")],
  ["source extra field", (f) => (row(f, "USER").sql = "private")],
  ["row count mismatch", (f) => (row(f, "USER").rowCount = 0)],
  ["truncated row", (f) => row(f, "USER").rows[0].pop()],
  [
    "second identity",
    (f) => {
      row(f, "USER").rows.push([...row(f, "USER").rows[0]]);
      row(f, "USER").rowCount++;
    },
  ],
  ["host pattern", (f) => (row(f, "USER").rows[0][0] = "%")],
  ["another host", (f) => (row(f, "USER").rows[0][0] = "10.20.1.1")],
  [
    "wrong TLS",
    (f) => (row(f, "USER").rows[0][2 + admin.globalPrivileges.length] = ""),
  ],
  [
    "unlocked account",
    (f) => (row(f, "USER").rows[0][3 + admin.globalPrivileges.length] = "N"),
  ],
  [
    "partial revoke",
    (f) =>
      (row(f, "USER").rows[0][4 + admin.globalPrivileges.length] =
        "restricted"),
  ],
  ["other schema", (f) => (row(f, "SCHEMA").rows[0][1] = "mysql")],
  ["schema host pattern", (f) => (row(f, "SCHEMA").rows[0][0] = "%")],
  [
    "public exists",
    (f) => {
      row(f, "PUBLIC").rows = [["public", "%"]];
      row(f, "PUBLIC").rowCount = 1;
    },
  ],
  ["unknown column", (f) => (row(f, "MODEL").rows[0][1] = "Future_priv")],
  [
    "missing model column",
    (f) => {
      row(f, "MODEL").rows.pop();
      row(f, "MODEL").rowCount--;
    },
  ],
  ["malformed column value", (f) => (row(f, "MODEL").rows[0][0] = ["user"])],
  ["changed session", (f) => (row(f, "DYNAMIC").connectionId = "999")],
  ["changed server", (f) => (row(f, "IDENTITY_END").rows[0][0] = "other")],
  [
    "notes suppressed",
    (f) => {
      row(f, "IDENTITY_START").rows[0][8] = 0;
      row(f, "IDENTITY_END").rows[0][8] = 0;
    },
  ],
  [
    "mandatory unknown",
    (f) => {
      row(f, "IDENTITY_START").rows[0][5] = "other";
      row(f, "IDENTITY_END").rows[0][5] = "other";
    },
  ],
  [
    "active on login",
    (f) => {
      row(f, "IDENTITY_START").rows[0][6] = 1;
      row(f, "IDENTITY_END").rows[0][6] = 1;
    },
  ],
  [
    "wrong admin",
    (f) => {
      row(f, "IDENTITY_START").rows[0][3] = "traceflow_diag@%";
      row(f, "IDENTITY_END").rows[0][3] = "traceflow_diag@%";
    },
  ],
  [
    "TLS absent",
    (f) => {
      row(f, "SESSION_TLS").rows = [];
      row(f, "SESSION_TLS").rowCount = 0;
    },
  ],
  [
    "duplicate TLS field",
    (f) => (row(f, "SESSION_TLS").rows[1] = row(f, "SESSION_TLS").rows[0]),
  ],
  [
    "GRANT OPTION",
    (f) => (row(f, "GRANTS").rows[0][0] += " WITH GRANT OPTION"),
  ],
  [
    "ADMIN OPTION",
    (f) => (row(f, "GRANTS").rows[0][0] += " WITH ADMIN OPTION"),
  ],
  [
    "explicit role",
    (f) =>
      (row(f, "GRANTS").rows[0][0] =
        "GRANT `public`@`%` TO `traceflow_diag`@`10.20.1.184`"),
  ],
  [
    "malformed SHOW GRANTS",
    (f) => (row(f, "GRANTS").rows[0][0] = "unexpected"),
  ],
  [
    "duplicate SHOW GRANTS",
    (f) => (row(f, "GRANTS").rows[1] = row(f, "GRANTS").rows[0]),
  ],
])
  test("collection refuses " + name, () => {
    const f = auditFixture();
    mutate(f);
    assert.throws(() => validate(f));
  });
for (const [id, width] of [
  ["DYNAMIC", 4],
  ["TABLE", 6],
  ["COLUMN", 6],
  ["ROUTINE", 6],
  ["EDGES", 5],
  ["DEFAULTS", 4],
  ["PROXY", 5],
])
  test(
    "collection rejects any unapproved " + id + " including other hosts/scopes",
    () => {
      const f = auditFixture();
      row(f, id).rows = [Array(width).fill("unexpected")];
      row(f, id).rowCount = 1;
      assert.throws(() => validate(f));
    },
  );
for (const privilege of admin.globalPrivileges)
  test("no global static privilege: " + privilege, () => {
    const f = auditFixture();
    row(f, "USER").rows[0][2 + admin.globalPrivileges.indexOf(privilege)] = "Y";
    assert.throws(() => validate(f), { code: "ADMIN_GLOBAL_PRIVILEGE" });
  });
for (const privilege of admin.schemaPrivileges.filter(
  (x) => x !== "Select_priv",
))
  test("no extra schema privilege: " + privilege, () => {
    const f = auditFixture();
    row(f, "SCHEMA").rows[0][3 + admin.schemaPrivileges.indexOf(privilege)] =
      "Y";
    assert.throws(() => validate(f), { code: "ADMIN_SCHEMA_PRIVILEGE" });
  });
for (const [name, change] of [
  ["truncation", (x) => x.slice(0, -10)],
  ["extra stdout", (x) => x + "private\n"],
  [
    "counter wrong query",
    (x) =>
      x.replace("\n0\nTF_W02_USER_END", "\nTF_W02_EXTRA\n0\nTF_W02_USER_END"),
  ],
  [
    "missing counter",
    (x) => x.replace("\n0\nTF_W02_USER_END", "\nTF_W02_USER_END"),
  ],
  [
    "positive counter",
    (x) => x.replace("\n0\nTF_W02_USER_END", "\n3\nTF_W02_USER_END"),
  ],
  [
    "session changed",
    (x) => x.replace("TF_W02_USER_END\t101", "TF_W02_USER_END\t102"),
  ],
  ["bad begin", (x) => x.replace("TF_W02_USER_BEGIN", "TF_W02_WRONG_BEGIN")],
  [
    "notes/count not a number",
    (x) => x.replace("\n0\nTF_W02_USER_END", "\nNULL\nTF_W02_USER_END"),
  ],
  ["multiple reports", (x) => x + x],
  ["oversize", () => "x".repeat(65537) + "\n"],
])
  test("transcript refuses " + name, () =>
    assert.throws(() =>
      admin.parseAdministrativeTranscript(
        change(transcript(auditFixture().observations)),
      ),
    ),
  );
for (const mutation of [
  { exitCode: 1 },
  { signal: "SIGTERM" },
  { stderrBytes: 1 },
])
  test("collection refuses process failure " + JSON.stringify(mutation), () => {
    const f = auditFixture();
    assert.throws(
      () =>
        admin.validateAdministrativeCollection(
          {
            exitCode: 0,
            signal: null,
            stderrBytes: 0,
            stdout: transcript(f.observations),
            ...mutation,
          },
          f.authorization.target,
        ),
      { code: "ADMIN_SQL_FAILED" },
    );
  });

function setPath(object, path, value) {
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce((x, k) => x[k], object);
  parent[keys.at(-1)] = value;
}
for (const [path, value] of [
  ["authorization.approved", false],
  ["authorization.extra", true],
  ["authorization.target.serverUuid", "00000000-0000-0000-0000-000000000000"],
  ["authorization.target.account", "traceflow_diag@%"],
  ["authorization.administrativeAudit.window.policy", "continuous-required"],
  ["authorization.administrativeAudit.window.noKnownAutomation", false],
  [
    "authorization.administrativeAudit.window.noPrivilegeChangesAuthorized",
    false,
  ],
  ["authorization.administrativeAudit.window.riskAcceptanceId", null],
  ["authorization.administrativeAudit.initialSha256", "0".repeat(64)],
  ["binding.packageId", "traceflow-prisma-diagnostic-" + "f".repeat(16)],
  ["initial.formatVersion", 1],
  ["initial.extra", true],
  ["initial.runId", "00000000-0000-4000-8000-000000000000"],
  ["initial.target.account", "traceflow_diag@%"],
  ["initial.producer", "manual"],
  ["initial.payload.planSha256", "0".repeat(64)],
  ["initial.payload.stateSha256", "0".repeat(64)],
  ["prisma.status", "PASS"],
  ["prisma.final", true],
  ["prisma.payload.disconnected", false],
  ["prisma.payload.checks.tls", false],
  ["prisma.payload.checks.roles", false],
  ["prisma.payload.checks.extra", true],
  ["prisma.previous.sha256", "0".repeat(64)],
  ["prisma.package.manifestSha256", "0".repeat(64)],
  ["final.stage", "ADMIN_INITIAL"],
  ["final.previous.sha256", "0".repeat(64)],
  ["final.payload.stateSha256", "0".repeat(64)],
  ["final.status", "FAIL"],
  ["closure", null],
  ["closure.noChangesReported", false],
  ["closure.noUnexpectedAutomationReported", false],
  ["closure.residualRiskAccepted", false],
  ["closure.operatorId", "another-operator"],
  ["closure.extra", true],
])
  test("chain refuses " + path, () => {
    const f = auditFixture();
    setPath(f, path, value);
    assert.throws(() => consolidate(f));
  });
for (const [name, mutate] of [
  [
    "future",
    (f) => (f.initial.completedAt = new Date(f.now + 1).toISOString()),
  ],
  ["expired", (f) => (f.now += 400000)],
  ["reused initial", (f) => (f.final = structuredClone(f.initial))],
  ["missing final", (f) => delete f.final],
  [
    "same collection",
    (f) => (f.final.payload.collectionId = f.initial.payload.collectionId),
  ],
  ["reverse order", (f) => (f.prisma.startedAt = f.initial.startedAt)],
  [
    "excessive stage gap",
    (f) => (f.prisma.startedAt = new Date(f.now + 120000).toISOString()),
  ],
  [
    "closure before final",
    (f) => (f.closure.confirmedAt = f.initial.completedAt),
  ],
  [
    "window over ten minutes",
    (f) => {
      f.authorization.expiresAt = new Date(f.now + 600001).toISOString();
      f.authorization.administrativeAudit.window.expiresAt =
        f.authorization.expiresAt;
    },
  ],
  [
    "unapproved expiry extension",
    (f) => (f.final.expiresAt = new Date(f.now + 600001).toISOString()),
  ],
  [
    "SQL evidence forged source",
    (f) => (f.initial.payload.observations[0].queryId = "OTHER"),
  ],
  [
    "grant fact altered",
    (f) =>
      (f.initial.payload.observations.find(
        (x) => x.queryId === "GRANTS",
      ).rows[0][0].grantOption = true),
  ],
  [
    "duplicate evidence IDs",
    (f) =>
      (f.authorization.administrativeAudit.evidenceIds.PRISMA =
        f.authorization.administrativeAudit.evidenceIds.ADMIN_INITIAL),
  ],
])
  test("chain refuses " + name, () => {
    const f = auditFixture();
    mutate(f);
    assert.throws(() => consolidate(f));
  });
test("JSON duplicates, malformed documents and size limits fail", () => {
  for (const value of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":}',
    "null trailing",
    "x".repeat(16385),
  ])
    assert.throws(() => parseRoleAttestationJson(value));
});
test("no arbitrary SQL or credential is copied into consolidated output", () => {
  const f = auditFixture();
  const output = JSON.stringify(consolidate(f));
  for (const forbidden of [
    "GRANT ",
    "SELECT ",
    "mysql://",
    "password",
    "authentication_string",
  ])
    assert.ok(!output.includes(forbidden));
});
test("intermediate JSON is strictly validated and cannot become early PASS", () => {
  const f = auditFixture(),
    context = {
      authorization: f.authorization,
      initial: f.initial,
      binding: f.binding,
    };
  const result = { code: 0, output: JSON.stringify(f.prisma) };
  assert.deepEqual(
    sanitizedResult(result, "synthetic-secret", context),
    f.prisma,
  );
  assert.throws(() => sanitizedResult(result, "synthetic-secret"));
  for (const mutation of [
    { status: "PASS" },
    { final: true },
    { extra: true },
    { payload: { ...f.prisma.payload, disconnected: false } },
  ])
    assert.throws(() =>
      sanitizedResult(
        { code: 0, output: JSON.stringify({ ...f.prisma, ...mutation }) },
        "synthetic-secret",
        context,
      ),
    );
  assert.throws(() =>
    sanitizedResult({ ...result, code: 1 }, "synthetic-secret", context),
  );
});
test("both operational entrypoints validate initial evidence before credential/database use", async () => {
  const launcher = await readFile(
    new URL("../scripts/diagnostic-launcher.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    launcher.indexOf("initialAudit = await loadInitialAudit") <
      launcher.indexOf("const secret ="),
  );
  const diagnostic = await readFile(
    new URL(
      "../../backend/scripts/validate-oci-heatwave-connection.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    diagnostic.indexOf("initialAudit = await loadInitialAudit") <
      diagnostic.indexOf("await mysqlTlsProbe"),
  );
});

async function sessionScenario(change = () => {}, failIndex = -1) {
  const f = auditFixture(),
    target = f.authorization.target,
    phases = [],
    queries = [];
  const identity = {
    uuid: target.serverUuid,
    version: target.version,
    db: target.schema,
    port: 3306,
    currentUser: target.account,
  };
  const direct = {
    recipient: target.account,
    publicAssigned: false,
    privileges: ["SELECT"],
  };
  const parameters = {
    mandatoryRoles: "public",
    activeRoles: "NONE",
    requireSecureTransport: 1n,
  };
  const responses = [
    [{ activateAllRolesOnLogin: 0n, partialRevokes: 1n, connectionId: 201n }],
    [{ 1: 1n }],
    [
      {
        ...identity,
        activeRoles: "NONE",
        mandatoryRoles: "public",
        activateAllRolesOnLogin: 0n,
        partialRevokes: 1n,
        connectionId: 201n,
      },
    ],
    admin.GRANTS.map((g) => ({ "Grants for traceflow_diag@10.20.1.184": g })),
  ];
  change({ identity, direct, parameters, responses });
  const client = {
    $queryRawUnsafe: async (sql) => {
      queries.push(sql);
      const index = queries.length - 1;
      if (index === failIndex)
        throw Object.assign(
          new Error("synthetic-secret mysql://unsafe SELECT private"),
          { code: "P2010", meta: { code: "3530", message: "private" } },
        );
      return responses[index];
    },
  };
  try {
    const result = await completeAuditedSession(client, {
      authorization: f.authorization,
      initial: f.initial,
      identity,
      parameters,
      direct,
      setPhase: (p) => phases.push(p),
    });
    return { result, queries, phases };
  } catch (error) {
    return {
      failure: diagnosticFailure(error, phases.at(-1)),
      queries,
      phases,
    };
  }
}
test("Prisma session only uses supported-path fixed queries and rechecks before returning", async () => {
  const r = await sessionScenario();
  assert.deepEqual(r.queries, [
    AUDITED_SETTINGS_SQL,
    "SELECT 1",
    AUDITED_FINAL_SQL,
    "SHOW GRANTS FOR CURRENT_USER",
  ]);
  assert.equal(r.result.prisma, "6.12.0");
  assert.ok(
    !r.queries.some(
      (q) =>
        q.includes("WARNINGS") ||
        q.includes("USING") ||
        q.includes("APPLICABLE_ROLES"),
    ),
  );
});
for (const [name, change] of [
  ["identity", (x) => (x.identity.currentUser = "traceflow_diag@%")],
  ["active role", (x) => (x.parameters.activeRoles = "public")],
  ["mandatory role", (x) => (x.parameters.mandatoryRoles = "other")],
  ["TLS transport", (x) => (x.parameters.requireSecureTransport = 0n)],
  ["extra direct grant", (x) => x.direct.privileges.push("INSERT")],
  ["role assignment", (x) => (x.direct.publicAssigned = true)],
  ["login roles", (x) => (x.responses[0][0].activateAllRolesOnLogin = 1n)],
  ["partial revokes", (x) => (x.responses[0][0].partialRevokes = 0n)],
  ["SELECT result", (x) => (x.responses[1] = [])],
  ["connection changed", (x) => (x.responses[2][0].connectionId = 202n)],
  ["final server", (x) => (x.responses[2][0].uuid = "other")],
  ["final roles", (x) => (x.responses[2][0].activeRoles = "public")],
  [
    "final grant",
    (x) =>
      (x.responses[3][0] = {
        "Grants for traceflow_diag@10.20.1.184": "GRANT INSERT ON *.* TO x",
      }),
  ],
])
  test("Prisma recheck refuses " + name, async () =>
    assert.equal((await sessionScenario(change)).failure.status, "FAIL"),
  );
for (let i = 0; i < 4; i++)
  test(
    "Prisma SQL failure " + i + " remains P2010/3530, never success",
    async () => {
      const r = await sessionScenario(() => {}, i);
      assert.equal(r.failure.status, "FAIL");
      assert.equal(r.failure.code, "P2010");
      assert.equal(r.failure.mysqlCode, "3530");
      assert.equal(
        r.failure.phase,
        [
          "SQL_ROLE_SETTINGS",
          "SQL_SELECT_ONE",
          "SQL_SESSION_CONSISTENCY",
          "SQL_FINAL_GRANTS",
        ][i],
      );
      assert.ok(!JSON.stringify(r.failure).includes("private"));
    },
  );
