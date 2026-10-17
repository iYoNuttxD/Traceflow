import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as heatwave from "../../backend/scripts/lib/heatwave-connection.js";
import { requireCondition } from "../../backend/scripts/lib/oci-compatibility-safety.js";
import * as roleAttestation from "../../backend/scripts/lib/heatwave-role-attestation.js";
import * as auditEvidence from "../../backend/scripts/lib/heatwave-audit-evidence.js";
import * as prismaAudit from "../../backend/scripts/lib/heatwave-prisma-audit.js";
import { attestationFixture } from "./helpers/role-attestation-fixture.mjs";
import { auditFixture } from "./helpers/administrative-audit-fixture.mjs";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";
import { sanitizedResult } from "../scripts/diagnostic-launcher.mjs";
const source = await readFile(
  new URL(
    "../../backend/scripts/validate-oci-heatwave-connection.js",
    import.meta.url,
  ),
  "utf8",
);
// Historical SQL fixtures preserve identity/TLS/parameters. No role expansion is
// executed in the attested-absence path. Mocks cannot certify MySQL warning semantics.
const originalSql = [
  "SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, @@datadir AS datadir, VERSION() AS version, CURRENT_USER() AS currentUser",
  "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')",
  "SELECT @@version_comment AS versionComment, @@sql_mode AS sqlMode, @@transaction_isolation AS transactionIsolation, @@time_zone AS timeZone, @@system_time_zone AS systemTimeZone, @@character_set_server AS characterSet, @@collation_server AS collation, @@lower_case_table_names AS lowerCaseTableNames, @@max_connections AS maxConnections, @@wait_timeout AS waitTimeout, @@connect_timeout AS connectTimeout, @@require_secure_transport AS requireSecureTransport, @@default_storage_engine AS engine, @@mandatory_roles AS mandatoryRoles, CURRENT_ROLE() AS activeRoles",
  "SHOW GRANTS FOR CURRENT_USER",
  "SHOW GRANTS FOR CURRENT_USER USING 'public'@'%'",
  "SELECT 1",
];
const roleGraphSql =
  "SELECT USER, HOST, GRANTEE, GRANTEE_HOST, ROLE_NAME, ROLE_HOST, IS_GRANTABLE, IS_MANDATORY FROM information_schema.APPLICABLE_ROLES";
const currentSql = [
  ...originalSql.slice(0, 4),
  "SELECT @@GLOBAL.activate_all_roles_on_login AS activateAllRolesOnLogin",
  roleGraphSql,
  originalSql[5],
];
const sqlPhases = [
  "SQL_IDENTITY",
  "SQL_SESSION_TLS",
  "SQL_SERVER_PARAMETERS",
  "SQL_DIRECT_GRANTS",
  "SQL_ROLE_SETTINGS",
  "SQL_ROLE_GRAPH",
  "SQL_SELECT_ONE",
];
const syntheticPassword = "synthetic-test-only:@/";
const recipient = "`traceflow_diag`@`10.20.1.184`";
const publicAssignment = "GRANT `public`@`%` TO " + recipient;
const publicGraph = {
  USER: "traceflow_diag",
  HOST: "10.20.1.184",
  GRANTEE: "traceflow_diag",
  GRANTEE_HOST: "10.20.1.184",
  ROLE_NAME: "public",
  ROLE_HOST: "%",
  IS_GRANTABLE: "NO",
  IS_MANDATORY: "YES",
};
const grantRows = (values, column = "Grants for traceflow_diag@10.20.1.184") =>
  values.map((grant) => ({ [column]: grant }));
const unsafeDetail =
  syntheticPassword +
  " mysql://synthetic.invalid/private SELECT private_payload";
const fault = (code = "P2010", mysqlCode = "1227") =>
  Object.assign(new Error(unsafeDetail), {
    code,
    meta: { code: mysqlCode, message: unsafeDetail, sql: originalSql[0] },
  });

// Run the actual entrypoint in an isolated JS context. Only explicit synthetic imports
// are linkable: neither the canonical Prisma module nor a network client can be loaded.
async function scenario(options = {}) {
  const local = options.local === true;
  const fixture = attestationFixture({
    mode: local ? "local-isolated" : "oci-read-only",
  });
  if (options.evidenceCount !== undefined)
    fixture.evidence.observations.existence.accountCount =
      options.evidenceCount;
  const administrativeFixture = options.audited ? auditFixture() : null;
  const authorization =
    administrativeFixture?.authorization ?? fixture.authorization;
  const target = authorization.target;
  if (options.attested === false || (local && options.publicRole === false))
    delete authorization.roleAttestation;
  if (options.authorizationExpired)
    authorization.expiresAt = "2000-01-01T00:00:00.000Z";
  let evidenceLoads = 0;
  const url = new URL("mysql://" + target.host);
  url.port = String(target.port);
  url.pathname = "/" + target.schema;
  url.username = target.user;
  url.password = encodeURIComponent(syntheticPassword);
  for (const [key, value] of Object.entries({
    sslaccept: "strict",
    sslcert: heatwave.managedCaPath,
    connection_limit: "1",
    connect_timeout: "5",
    pool_timeout: "5",
    socket_timeout: "10",
  }))
    url.searchParams.set(key, value);
  const environment = {
    [local ? "TEST_DATABASE_URL" : "HEATWAVE_DIAGNOSTIC_DATABASE_URL"]:
      url.toString(),
  };
  if (options.ambiguousEnvironment)
    environment.DATABASE_URL = "refused-synthetic-input";
  const stdout = [],
    stderr = [],
    queries = [],
    events = [],
    timers = [],
    exits = [];
  const mockProcess = {
    env: environment,
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    exitCode: undefined,
    // Returning permits testing the single-emission guard even if execution resumes.
    exit: (code) => {
      exits.push(code);
      mockProcess.exitCode = code;
    },
  };
  const identity = {
    db: target.schema,
    uuid: target.serverUuid,
    port: target.port,
    datadir: target.datadir,
    version: target.version,
    currentUser: target.user + "@10.20.1.184",
    ...options.identity,
  };
  const grants = [
    "GRANT USAGE ON *.* TO `traceflow_diag`@`10.20.1.184`",
    "GRANT SELECT ON `" +
      target.schema +
      "`.* TO `traceflow_diag`@`10.20.1.184`",
  ];
  const activePublic = options.activePublic === true;
  const responsesSql = [...currentSql];
  if (options.audited)
    responsesSql.push(
      prismaAudit.AUDITED_SETTINGS_SQL,
      prismaAudit.AUDITED_FINAL_SQL,
    );

  const responses = [
    [identity],
    options.session ?? [
      { Variable_name: "Ssl_cipher", Value: "TLS_AES_128_GCM_SHA256" },
      { Variable_name: "Ssl_version", Value: "TLSv1.3" },
    ],
    [
      {
        mandatoryRoles: options.publicRole === false ? "" : "public",
        activeRoles: activePublic ? "`public`@`%`" : "NONE",
        maxConnections: 200n,
        ...(options.audited ? { requireSecureTransport: 1n } : {}),
        ...options.parameters,
      },
    ],
    Object.hasOwn(options, "directGrants")
      ? options.directGrants
      : grantRows(
          [...grants, ...(options.explicitPublic ? [publicAssignment] : [])],
          options.grantColumn,
        ),
    options.settings ?? [{ activateAllRolesOnLogin: 0n }],
    Object.hasOwn(options, "roleGraph") ? options.roleGraph : [],
    [{ 1: 1n }],
  ];
  if (options.audited)
    responses.push(
      [{ activateAllRolesOnLogin: 0n, partialRevokes: 1n, connectionId: 201n }],
      [
        {
          db: identity.db,
          uuid: identity.uuid,
          port: identity.port,
          version: identity.version,
          currentUser: identity.currentUser,
          activeRoles: "NONE",
          mandatoryRoles: "public",
          activateAllRolesOnLogin: 0n,
          partialRevokes: 1n,
          connectionId: 201n,
        },
      ],
    );
  const sessionClient = {
    async $queryRawUnsafe(sql) {
      assert.equal(events.includes("SESSION_START"), true);
      queries.push(sql);
      const index = responsesSql.indexOf(sql);
      assert.ok(index >= 0, "Unreviewed SQL refused by the test double");
      events.push(sqlPhases[index]);
      if (options.timeoutSql === index) {
        timers[0].callback();
        throw fault("SIMULATED_EXIT");
      }
      if (options.failSql === index) throw options.error ?? fault();
      if (
        sql === originalSql[3] &&
        queries.filter((query) => query === originalSql[3]).length === 2 &&
        Object.hasOwn(options, "finalGrants")
      )
        return options.finalGrants;
      return responses[index];
    },
  };
  const prisma = {
    async $queryRawUnsafe() {
      assert.fail("SQL outside the pinned session is forbidden");
    },
    async $transaction(callback, limits) {
      assert.equal(limits.maxWait, 5000);
      assert.equal(limits.timeout, 30000);
      events.push("SESSION_START");
      if (options.transactionError) throw options.transactionError;
      try {
        const result = await callback(sessionClient);
        events.push("SESSION_END");
        if (options.transactionEndError) throw options.transactionEndError;
        return result;
      } catch (error) {
        events.push("SESSION_ABORT");
        if (options.timeoutAbort) timers[0].callback();
        if (options.abortError) throw options.abortError;
        throw error;
      }
    },
    async $disconnect() {
      events.push("DISCONNECT");
      assert.equal(
        stdout.length,
        options.timeoutSql === undefined && !options.timeoutAbort ? 0 : 1,
        "Output must wait for cleanup unless the deadline fired",
      );
      if (options.timeoutDisconnect) timers[0].callback();
      if (options.disconnectError) throw options.disconnectError;
    },
  };
  const helpers = {
    ...heatwave,
    async protectedFile(path, flags) {
      events.push("FILE");
      if (path === "/synthetic-authorization.json") {
        assert.equal(flags.privateFile, true);
        assert.equal(Object.keys(flags).join(","), "privateFile");
        if (options.authorizationError) throw options.authorizationError;
        return options.authorizationText ?? JSON.stringify(authorization);
      }
      assert.equal(path, heatwave.managedCaPath);
      assert.equal(flags.rootOwned, !local);
      return "synthetic-public-ca";
    },
    publicCaContract(pem, pin) {
      assert.equal(pem, "synthetic-public-ca");
      assert.equal(pin, target.caSha256);
      if (options.caError) throw options.caError;
      return { sha256: target.caSha256 };
    },
    async verifyManagedDns() {
      events.push("DNS");
      if (options.dnsError) throw options.dnsError;
    },
    async mysqlTlsProbe() {
      events.push("TLS_PROBE");
      if (options.tlsError) throw options.tlsError;
      return { verified: true, identityVerified: true, protocol: "TLSv1.3" };
    },
  };
  const context = createContext({
    process: mockProcess,
    console: {
      log: (...values) => stdout.push(values.join(" ") + "\n"),
      error: (...values) => stderr.push(values.join(" ") + "\n"),
      warn: (...values) => stderr.push(values.join(" ") + "\n"),
    },
    setTimeout: (callback, ms) => {
      const timer = { callback, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timer.cleared = true;
    },
  });
  const exportsBySpecifier = {
    "./lib/heatwave-audit-evidence.js": {
      ...auditEvidence,
      async loadInitialAudit(auth, root) {
        if (!options.audited || options.operationalGate)
          return auditEvidence.loadInitialAudit(auth, root);
        events.push("ADMIN_INITIAL_TEST_DOUBLE");
        if (
          events.filter((x) => x === "ADMIN_INITIAL_TEST_DOUBLE").length > 1 &&
          options.finalEvidenceError
        )
          throw options.finalEvidenceError;
        auditEvidence.validateAdministrativeEvidence(
          administrativeFixture.initial,
          auth,
          "ADMIN_INITIAL",
          administrativeFixture.binding,
        );
        return administrativeFixture.initial;
      },
    },
    "./lib/heatwave-prisma-audit.js": prismaAudit,
    "node:path": nodePath,
    "node:url": nodeUrl,
    "./lib/heatwave-role-attestation.js": {
      ...roleAttestation,
      async loadRoleAttestation(auth) {
        evidenceLoads++;
        events.push("ATTESTATION:" + evidenceLoads);
        if (options.attestationError) throw options.attestationError;
        if (evidenceLoads > 1 && options.finalEvidenceError)
          throw options.finalEvidenceError;
        return roleAttestation.validateRoleAttestation(
          fixture.evidence,
          auth,
          fixture.binding,
        );
      },
    },
    "node:util": {
      parseArgs: () => ({
        values: {
          authorization: "/synthetic-authorization.json",
          "validate-only": options.validateOnly,
        },
      }),
    },
    "./lib/heatwave-connection.js": helpers,
    "./lib/oci-compatibility-safety.js": { requireCondition },
    "@prisma/client": {
      Prisma: { prismaVersion: { client: options.prismaVersion ?? "6.12.0" } },
    },
    "../src/database/prismaClient.js": { prisma },
  };
  async function link(specifier) {
    assert.ok(
      Object.hasOwn(exportsBySpecifier, specifier),
      "Unexpected import refused",
    );
    events.push("IMPORT:" + specifier);
    if (options.importError && specifier === "../src/database/prismaClient.js")
      throw options.importError;
    const values = exportsBySpecifier[specifier];
    const module = new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values))
          this.setExport(key, value);
      },
      { context },
    );
    await module.link(() => {
      throw new Error("TRANSITIVE_IMPORT_REFUSED");
    });
    await module.evaluate();
    return module;
  }
  const module = new SourceTextModule(source, {
    context,
    initializeImportMeta(meta) {
      meta.url = new URL(
        "../../backend/scripts/validate-oci-heatwave-connection.js",
        import.meta.url,
      ).href;
    },
    importModuleDynamically: link,
  });
  await module.link(link);
  await module.evaluate();
  assert.equal(
    stdout.length,
    1,
    "Exactly one operational JSON must be emitted",
  );
  assert.equal(
    stderr.length,
    0,
    "No raw errors or stack traces may be emitted",
  );
  const output = stdout[0];
  for (const secret of [
    syntheticPassword,
    encodeURIComponent(syntheticPassword),
    "mysql://",
    unsafeDetail,
    ...originalSql,
    ...currentSql,
  ])
    assert.ok(
      !output.includes(secret),
      "Sensitive content leaked into the operational output",
    );
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 30000);
  assert.equal(timers[0].cleared, true);
  const value = JSON.parse(output);
  assert.deepEqual(
    sanitizedResult(
      { code: mockProcess.exitCode ?? 0, output },
      syntheticPassword,
      administrativeFixture
        ? {
            authorization,
            initial: administrativeFixture.initial,
            binding: administrativeFixture.binding,
          }
        : undefined,
    ),
    value,
  );
  return { value, queries, events, exits, exitCode: mockProcess.exitCode ?? 0 };
}

function sameQueries(actual, expected) {
  assert.equal(actual.length, expected.length);
  assert.ok(
    actual.every((sql, index) => sql === expected[index]),
    "Original SQL text/order changed",
  );
}

test("numeric MySQL codes accept only canonical positive unsigned 16-bit values", () => {
  for (const code of [1, "1", 1227, "1227", 1295, "3530", 65535, "65535"]) {
    const value = heatwave.diagnosticFailure(
      fault("P2010", code),
      "SQL_IDENTITY",
    );
    assert.equal(value.code, "P2010");
    assert.equal(value.mysqlCode, String(code));
  }
  const invalid = [
    undefined,
    null,
    "",
    "N/A",
    0,
    "0",
    -1,
    "-1",
    65536,
    "65536",
    1.5,
    NaN,
    Infinity,
    true,
    1227n,
    {},
    ["1227"],
    new String("1227"),
    "01227",
    "+1227",
    " 1227",
    "1227 ",
    "1227\n",
    "1227\r\n",
    "1227\0",
    "1e3",
    "0x4cb",
    unsafeDetail,
    "9".repeat(1000),
    {
      toString() {
        throw new Error("COERCION_MUST_NOT_RUN");
      },
    },
  ];
  for (const code of invalid) {
    const error = fault();
    error.meta.code = code;
    const value = heatwave.diagnosticFailure(error, "SQL_IDENTITY");
    assert.equal(value.code, "P2010");
    assert.ok(!Object.hasOwn(value, "mysqlCode"));
    assert.deepEqual(Object.keys(value).sort(), [
      "code",
      "phase",
      "status",
      "writes",
    ]);
  }
});

test("malicious error properties, getters, cycles and toJSON never escape", async () => {
  let invoked = 0;
  const trap = () => {
    invoked++;
    throw new Error(unsafeDetail);
  };
  const metadata = { message: unsafeDetail, toJSON: trap };
  metadata.self = metadata;
  Object.defineProperty(metadata, "code", { get: trap });
  const error = Object.assign(new Error(unsafeDetail), {
    code: "P2010",
    meta: metadata,
    toJSON: trap,
  });
  const result = await scenario({ failSql: 2, error });
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "P2010",
    phase: "SQL_SERVER_PARAMETERS",
    writes: false,
  });
  for (const key of ["meta", "code"]) {
    const hostile = Object.defineProperty({}, key, { get: trap });
    assert.equal(
      heatwave.diagnosticFailure(hostile, "SQL_IDENTITY").code,
      "DIAGNOSTIC_FAILED",
    );
  }
  assert.equal(invoked, 0);
  const proxy = new Proxy({}, { getOwnPropertyDescriptor: trap });
  assert.equal(
    heatwave.diagnosticFailure(proxy, "SQL_IDENTITY").code,
    "DIAGNOSTIC_FAILED",
  );
  assert.equal(invoked, 2); // The code/meta descriptor traps are caught; getters never ran.
});

test("preserves Prisma codes and refuses unstructured codes/phases", () => {
  for (const code of ["P1000", "P1017", "P2010", "P2024", "P6001"])
    assert.equal(
      heatwave.diagnosticFailure({ code }, "PRISMA_INIT").code,
      code,
    );
  for (const code of [
    unsafeDetail,
    "P2010\n",
    "A".repeat(65),
    {},
    ["P2010"],
    null,
  ])
    assert.equal(
      heatwave.diagnosticFailure({ code }, "SQL_IDENTITY").code,
      "DIAGNOSTIC_FAILED",
    );
  assert.equal(
    heatwave.diagnosticFailure(fault(), unsafeDetail).phase,
    "UNKNOWN",
  );
});

for (let index = 0; index < sqlPhases.length; index++)
  test("SQL fault retains phase " + sqlPhases[index], async () => {
    const local = index === 6;
    const result = await scenario({
      failSql: index,
      ...(local ? { local: true, publicRole: false } : {}),
    });
    assert.deepEqual(result.value, {
      status: "FAIL",
      code: "P2010",
      phase: sqlPhases[index],
      mysqlCode: "1227",
      writes: false,
    });
    sameQueries(
      result.queries,
      local
        ? [...currentSql.slice(0, 4), originalSql[5]]
        : currentSql.slice(0, index + 1),
    );
    assert.equal(result.events.filter((x) => x === "DISCONNECT").length, 1);
  });
test("ABSENT is audited but cannot PASS with unproven warning completeness", async () => {
  const result = await scenario();
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "ROLE_WARNINGS_UNVERIFIED",
    phase: "ROLE_WARNINGS",
    writes: false,
  });
  sameQueries(result.queries, currentSql.slice(0, 6));
  assert.ok(
    !result.queries.includes(originalSql[4]) &&
      !result.queries.includes("SHOW GRANTS"),
  );
  assert.equal(
    result.events.filter((x) => x.startsWith("ATTESTATION:")).length,
    2,
  );
  assert.equal(result.events.at(-2), "DISCONNECT");
});
test("local-isolated without roles preserves direct-only PASS", async () => {
  const result = await scenario({ local: true, publicRole: false });
  assert.equal(result.value.status, "PASS");
  assert.deepEqual(result.value.grants, ["SELECT"]);
  assert.deepEqual(result.value.roleVerification, {
    mandatoryPublic: false,
    activePublic: false,
    expanded: false,
    graphVerified: false,
    strategy: "direct-only",
  });
  sameQueries(result.queries, [...currentSql.slice(0, 4), originalSql[5]]);
  assert.equal(result.value.disconnected, true);
});
test("identity, TLS and server parameters remain byte-for-byte unchanged", () => {
  for (const sql of originalSql.slice(0, 4)) assert.ok(source.includes(sql));
  assert.ok(source.includes(originalSql[5]));
});
for (const count of [1, 2])
  test("PRESENT fails before SQL, count=" + count, async () => {
    const result = await scenario({ evidenceCount: count });
    assert.equal(result.value.code, "ROLE_PRESENT_UNVERIFIED");
    assert.equal(result.value.phase, "ADMIN_ROLE_ATTESTATION");
    assert.equal(result.queries.length, 0);
  });
for (const [name, options, phase, expected, count] of [
  [
    "missing attestation",
    { attested: false },
    "ADMIN_ROLE_ATTESTATION",
    "ROLE_ATTESTATION_REQUIRED",
    0,
  ],
  [
    "expired evidence",
    { attestationError: fault("ROLE_ATTESTATION_EXPIRED") },
    "ADMIN_ROLE_ATTESTATION",
    "ROLE_ATTESTATION_EXPIRED",
    0,
  ],
  [
    "bad evidence hash",
    { attestationError: fault("ROLE_ATTESTATION_HASH_MISMATCH") },
    "ADMIN_ROLE_ATTESTATION",
    "ROLE_ATTESTATION_HASH_MISMATCH",
    0,
  ],
  [
    "invalid authorization",
    { authorizationText: "{" + unsafeDetail },
    "PREVALIDATION",
    "DIAGNOSTIC_FAILED",
    0,
  ],
  [
    "authorization file",
    { authorizationError: fault("PRIVATE_FILE_REQUIRED") },
    "PREVALIDATION",
    "PRIVATE_FILE_REQUIRED",
    0,
  ],
  [
    "expired authorization",
    { authorizationExpired: true },
    "PREVALIDATION",
    "AUTHORIZATION_EXPIRED",
    0,
  ],
  [
    "ambiguous env",
    { ambiguousEnvironment: true },
    "PREVALIDATION",
    "AMBIGUOUS_DATABASE_URL",
    0,
  ],
  [
    "CA",
    { caError: fault("CA_FINGERPRINT_MISMATCH") },
    "TLS_CA",
    "CA_FINGERPRINT_MISMATCH",
    0,
  ],
  [
    "DNS",
    { dnsError: fault("DNS_IDENTITY_MISMATCH") },
    "DNS_IDENTITY",
    "DNS_IDENTITY_MISMATCH",
    0,
  ],
  [
    "hostname TLS",
    { tlsError: fault("ERR_TLS_CERT_ALTNAME_INVALID") },
    "TLS_PROBE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    0,
  ],
  [
    "Prisma version",
    { prismaVersion: "other" },
    "PRISMA_INIT",
    "PRISMA_VERSION",
    0,
  ],
  ["connection", { importError: fault("P1000") }, "PRISMA_INIT", "P1000", 0],
  [
    "UUID",
    { identity: { uuid: "wrong" } },
    "SERVER_IDENTITY",
    "SERVER_IDENTITY_MISMATCH",
    1,
  ],
  [
    "full account",
    { identity: { currentUser: "traceflow_diag@%" } },
    "SERVER_IDENTITY",
    "SERVER_IDENTITY_MISMATCH",
    1,
  ],
  [
    "local datadir",
    { local: true, publicRole: false, identity: { datadir: "/wrong" } },
    "SERVER_IDENTITY",
    "SERVER_IDENTITY_MISMATCH",
    1,
  ],
  ["TLS session", { session: [] }, "SESSION_TLS", "PRISMA_TLS_REQUIRED", 2],
  [
    "unknown mandatory",
    { parameters: { mandatoryRoles: "administrator" } },
    "ROLES",
    "UNREVIEWED_MANDATORY_ROLE",
    3,
  ],
  [
    "unknown active",
    { parameters: { activeRoles: "administrator" } },
    "ROLES",
    "UNREVIEWED_ACTIVE_ROLE",
    3,
  ],
  [
    "configuration contradiction",
    { parameters: { mandatoryRoles: "" } },
    "ROLES",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    3,
  ],
  [
    "active public contradiction",
    { activePublic: true },
    "ROLES",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    3,
  ],
  [
    "global activation contradiction",
    { settings: [{ activateAllRolesOnLogin: 1n }] },
    "ROLES",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    5,
  ],
  [
    "malformed settings",
    { settings: [] },
    "ROLES",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    5,
  ],
  [
    "extra settings",
    { settings: [{ activateAllRolesOnLogin: 0, unexpected: true }] },
    "ROLES",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    5,
  ],
  [
    "unresolved public",
    { roleGraph: [publicGraph] },
    "ROLE_GRAPH",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    6,
  ],
  [
    "additional role",
    { roleGraph: [{ ...publicGraph, ROLE_NAME: "admin" }] },
    "ROLE_GRAPH",
    "ROLE_ATTESTATION_SESSION_MISMATCH",
    6,
  ],
  [
    "malformed inventory",
    { roleGraph: null },
    "ROLE_GRAPH",
    "MALFORMED_ROLE_GRAPH",
    6,
  ],
])
  test("fail-closed " + name, async () => {
    const result = await scenario(options);
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.value.phase, phase);
    assert.equal(result.value.code, expected);
    sameQueries(result.queries, currentSql.slice(0, count));
  });
for (const grant of [
  publicAssignment,
  "GRANT `other`@`%` TO " + recipient,
  ...["INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"].map(
    (p) => "GRANT " + p + " ON `traceflow`.* TO " + recipient,
  ),
  ...["SELECT", "SUPER", "FILE", "SYSTEM_USER", "ROLE_ADMIN"].map(
    (p) => "GRANT " + p + " ON *.* TO " + recipient,
  ),
  "GRANT SELECT ON `other`.* TO " + recipient,
  "GRANT SELECT ON `traceflow`.* TO " + recipient + " WITH GRANT OPTION",
  publicAssignment + " WITH ADMIN OPTION",
  "REVOKE SELECT ON `other`.* FROM " + recipient,
])
  test(
    "ABSENT never ignores direct privilege/assignment " + grant,
    async () => {
      const result = await scenario({
        directGrants: grantRows([
          "GRANT SELECT ON `traceflow`.* TO " + recipient,
          grant,
        ]),
      });
      assert.equal(result.value.status, "FAIL");
      assert.equal(result.value.phase, "DIRECT_GRANTS");
      assert.equal(result.value.code, "EXCESSIVE_OR_UNRESOLVED_GRANTS");
      assert.equal(result.queries.length, 4);
    },
  );
for (const grants of [
  null,
  {},
  [],
  [null],
  [42],
  [["invalid"]],
  [{ unexpected: unsafeDetail }],
  [
    {
      "Grants for traceflow_diag@10.20.1.184":
        "GRANT SELECT ON `traceflow`.* TO " + recipient,
      extra: unsafeDetail,
    },
  ],
  ["GRANT SELECT ON `traceflow`.* TO " + recipient + "\n"],
  ["GRANT SELECT, SELECT ON `traceflow`.* TO " + recipient],
  ["GRANT SELECT ON `traceflow`.* TO `other`@`%`"],
])
  test("malformed direct grants " + JSON.stringify(grants), async () => {
    const result = await scenario({ directGrants: grants });
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.value.phase, "DIRECT_GRANTS");
  });
test("administrative SELECT evidence cannot authorize additional SHOW VIEW", async () => {
  const result = await scenario({
    directGrants: ["GRANT SELECT, SHOW VIEW ON `traceflow`.* TO " + recipient],
  });
  assert.equal(result.value.code, "ROLE_ATTESTATION_GRANTS_MISMATCH");
});
test("grant getter cannot execute or leak", async () => {
  let invoked = 0;
  const grant = Object.defineProperty(
    {},
    "Grants for traceflow_diag@10.20.1.184",
    {
      get() {
        invoked++;
        throw Error(unsafeDetail);
      },
    },
  );
  const result = await scenario({ directGrants: [grant] });
  assert.equal(result.value.code, "MALFORMED_GRANTS");
  assert.equal(invoked, 0);
});
for (const mysqlCode of ["3530", "1141", "1295", undefined])
  test("SQL error never becomes absence: " + mysqlCode, async () => {
    const error = fault("P2010", mysqlCode);
    if (mysqlCode === undefined) delete error.meta.code;
    const result = await scenario({
      failSql: 5,
      error,
      disconnectError: fault("P1017", "2013"),
    });
    assert.deepEqual(result.value, {
      status: "FAIL",
      code: "P2010",
      phase: "SQL_ROLE_GRAPH",
      ...(mysqlCode === undefined ? {} : { mysqlCode }),
      writes: false,
    });
  });
test("validate-only validates evidence twice and performs no network/Prisma operations", async () => {
  const result = await scenario({ validateOnly: true });
  assert.equal(result.value.status, "CONFIG_VALID");
  assert.equal(result.value.connected, false);
  assert.equal(result.queries.length, 0);
  for (const event of [
    "DNS",
    "TLS_PROBE",
    "SESSION_START",
    "DISCONNECT",
    "IMPORT:@prisma/client",
    "IMPORT:../src/database/prismaClient.js",
  ])
    assert.ok(!result.events.includes(event));
  assert.equal(
    result.events.filter((x) => x.startsWith("ATTESTATION:")).length,
    2,
  );
});
test("expiry/replacement at final revalidation prevents CONFIG_VALID", async () => {
  for (const code of [
    "ROLE_ATTESTATION_EXPIRED",
    "ROLE_ATTESTATION_FILE_CHANGED",
  ]) {
    const result = await scenario({
      validateOnly: true,
      finalEvidenceError: fault(code),
    });
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.value.phase, "ROLE_ATTESTATION_FINAL");
    assert.equal(result.value.code, code);
  }
});
test("final evidence error preserves earlier failure", async () => {
  const result = await scenario({
    failSql: 0,
    error: fault("P2010", "1141"),
    finalEvidenceError: fault("ROLE_ATTESTATION_EXPIRED"),
  });
  assert.equal(result.value.code, "P2010");
  assert.equal(result.value.phase, "SQL_IDENTITY");
});
for (const [option, phase] of [
  ["transactionError", "SESSION_START"],
  ["transactionEndError", "SESSION_END"],
])
  test("transaction failure " + phase, async () => {
    const result = await scenario({
      local: true,
      publicRole: false,
      [option]: fault("P2028"),
      disconnectError: fault("P1017"),
    });
    assert.equal(result.value.code, "P2028");
    assert.equal(result.value.phase, phase);
  });
test("disconnect failure after direct-only success is FAIL", async () => {
  const result = await scenario({
    local: true,
    publicRole: false,
    disconnectError: fault("P1017", undefined),
  });
  assert.equal(result.value.phase, "DISCONNECT");
  assert.equal(result.value.code, "P1017");
});
test("warning blocker survives disconnect and rollback failures", async () => {
  const result = await scenario({
    disconnectError: fault("P1017"),
    abortError: fault("P2028"),
  });
  assert.equal(result.value.code, "ROLE_WARNINGS_UNVERIFIED");
  assert.equal(result.events.filter((x) => x === "DISCONNECT").length, 1);
});
test("rollback deadline preserves primary SQL failure", async () => {
  const result = await scenario({
    failSql: 5,
    error: fault("P2010", "3530"),
    timeoutAbort: true,
    abortError: fault("P2028"),
    disconnectError: fault("P1017"),
  });
  assert.equal(result.value.code, "P2010");
  assert.equal(result.value.mysqlCode, "3530");
  assert.deepEqual(result.exits, [1]);
});
for (const [options, phase, code] of [
  [{ timeoutSql: 1 }, "SQL_SESSION_TLS", "DIAGNOSTIC_DEADLINE"],
  [
    { local: true, publicRole: false, timeoutDisconnect: true },
    "DISCONNECT",
    "DIAGNOSTIC_DEADLINE",
  ],
  [
    { failSql: 0, timeoutDisconnect: true, disconnectError: fault("P1017") },
    "SQL_IDENTITY",
    "P2010",
  ],
])
  test("deadline retains single JSON " + phase, async () => {
    const result = await scenario(options);
    assert.equal(result.value.phase, phase);
    assert.equal(result.value.code, code);
    assert.deepEqual(result.exits, [1]);
  });

test("v2 entrypoint emits only intermediate evidence after disconnect (simulated collector)", async () => {
  const r = await scenario({ audited: true });
  assert.equal(r.value.status, "PRISMA_VERIFIED");
  assert.equal(r.value.final, false);
  assert.equal(r.value.payload.disconnected, true);
  assert.equal(r.events.filter((x) => x === "DISCONNECT").length, 1);
  assert.ok(
    !r.queries.includes(roleGraphSql) && !r.queries.includes(originalSql[4]),
  );
  sameQueries(r.queries, [
    ...originalSql.slice(0, 4),
    prismaAudit.AUDITED_SETTINGS_SQL,
    "SELECT 1",
    prismaAudit.AUDITED_FINAL_SQL,
    originalSql[3],
  ]);
});
test("v2 runtime gate rejects before TLS, credential connection or SQL", async () => {
  const r = await scenario({ audited: true, operationalGate: true });
  assert.equal(r.value.code, "ADMIN_COLLECTION_RUNTIME_UNVERIFIED");
  assert.equal(r.value.phase, "ADMIN_AUDIT_INITIAL");
  assert.equal(r.queries.length, 0);
  assert.ok(!r.events.includes("TLS_PROBE"));
});
test("v2 validate-only with simulated custody remains disconnected and non-final", async () => {
  const r = await scenario({ audited: true, validateOnly: true });
  assert.equal(r.value.status, "CONFIG_VALID");
  assert.equal(r.value.connected, false);
  assert.equal(r.queries.length, 0);
});
for (const [name, options, code, phase] of [
  ["disconnect", { disconnectError: fault("P1001") }, "P1001", "DISCONNECT"],
  [
    "transaction end",
    { transactionEndError: fault("P2028") },
    "P2028",
    "SESSION_END",
  ],
  [
    "primary survives disconnect",
    { failSql: 7, disconnectError: fault("P1001") },
    "P2010",
    "SQL_ROLE_SETTINGS",
  ],
  [
    "initial evidence expires",
    { finalEvidenceError: fault("AUDIT_WINDOW_EXPIRED") },
    "AUDIT_WINDOW_EXPIRED",
    "ADMIN_AUDIT_RECHECK",
  ],
  [
    "primary survives final evidence",
    { failSql: 7, finalEvidenceError: fault("AUDIT_WINDOW_EXPIRED") },
    "P2010",
    "SQL_ROLE_SETTINGS",
  ],
  ["TLS", { tlsError: fault("TLS_INVALID") }, "TLS_INVALID", "TLS_PROBE"],
])
  test("v2 " + name + " prevents intermediate approval", async () => {
    const r = await scenario({ audited: true, ...options });
    assert.equal(r.value.status, "FAIL");
    assert.equal(r.value.code, code);
    assert.equal(r.value.phase, phase);
  });

// Observed with Prisma 6.12.0 + MySQL Community 26.7.0 on 2026-10-17:
// prepared SHOW GRANTS FOR CURRENT_USER returns one string column named f0;
// the textual client returns "Grants for <account>". These are row-format
// regression fixtures, not evidence of managed role absence or final approval.
const preparedAccount = "traceflow_diag@10.20.1.184";
const preparedGrants = [
  "GRANT USAGE ON *.* TO " + recipient,
  "GRANT SELECT ON `traceflow`.* TO " + recipient,
];
const preparedRows = (grants = preparedGrants) => grantRows(grants, "f0");
const validatePrepared = (rows, account = preparedAccount) =>
  heatwave.validateDirectGrants(rows, "traceflow", "diagnostic", {}, account);

for (const column of ["f0", "Grants for " + preparedAccount])
  test("MySQL 26.7 grant format accepts only audited SELECT: " + column, () => {
    assert.deepEqual(validatePrepared(grantRows(preparedGrants, column)), {
      privileges: ["SELECT"],
      publicAssigned: false,
      recipient: preparedAccount,
    });
  });

for (const [name, rows] of [
  ["unknown column", grantRows(preparedGrants, "f1")],
  ["case variation", grantRows(preparedGrants, "F0")],
  ["padded column", grantRows(preparedGrants, "f0 ")],
  ["empty column", grantRows(preparedGrants, "")],
  ["foreign named account", grantRows(preparedGrants, "Grants for other@%")],
  ["extra column", [{ f0: preparedGrants[1], extra: unsafeDetail }]],
  [
    "two recognized columns",
    [
      {
        f0: preparedGrants[1],
        ["Grants for " + preparedAccount]: preparedGrants[1],
      },
    ],
  ],
  [
    "symbol column",
    [{ f0: preparedGrants[1], [Symbol("extra")]: unsafeDetail }],
  ],
  [
    "non-enumerable extra",
    [
      Object.defineProperty({ f0: preparedGrants[1] }, "extra", {
        value: unsafeDetail,
      }),
    ],
  ],
  ["inherited column", [Object.create({ f0: preparedGrants[1] })]],
  ["null value", [{ f0: null }]],
  ["number value", [{ f0: 1 }]],
  ["bigint value", [{ f0: 1n }]],
  ["buffer value", [{ f0: Buffer.from(preparedGrants[1]) }]],
  ["object value", [{ f0: { value: preparedGrants[1] } }]],
  ["array row", [[preparedGrants[1]]]],
  ["empty value", [{ f0: "" }]],
  ["newline in grant", [{ f0: preparedGrants[1] + "\n" }]],
  ["NUL in grant", [{ f0: preparedGrants[1] + "\0" }]],
  ["DEL in grant", [{ f0: preparedGrants[1] + "\x7f" }]],
  ["duplicate grant", preparedRows([...preparedGrants, preparedGrants[1]])],
])
  test("prepared grants reject malformed " + name, () => {
    assert.throws(() => validatePrepared(rows), { code: "MALFORMED_GRANTS" });
  });

for (const account of [undefined, null, ""])
  test(
    "prepared grants require an authenticated account: " + String(account),
    () => {
      assert.throws(
        () =>
          heatwave.validateDirectGrants(
            preparedRows(),
            "traceflow",
            "diagnostic",
            {},
            account,
          ),
        { code: "MALFORMED_GRANTS" },
      );
    },
  );
test("prepared grants cannot be accepted by the unbound legacy wrapper", () => {
  assert.throws(() => heatwave.validateGrants(preparedRows(), "traceflow"), {
    code: "MALFORMED_GRANTS",
  });
});
test("prepared grant accessor is never invoked or serialized", () => {
  let called = 0;
  const row = Object.defineProperty({}, "f0", {
    get() {
      called++;
      throw Error(unsafeDetail);
    },
  });
  assert.throws(() => validatePrepared([row]), { code: "MALFORMED_GRANTS" });
  assert.equal(called, 0);
});
for (const privilege of [
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "ALTER",
  "DROP",
  "FILE",
  "SUPER",
  "SYSTEM_USER",
  "ALL PRIVILEGES",
])
  test("prepared grants still reject " + privilege, () => {
    assert.throws(
      () =>
        validatePrepared(
          preparedRows([
            ...preparedGrants,
            "GRANT " + privilege + " ON `traceflow`.* TO " + recipient,
          ]),
        ),
      { code: "EXCESSIVE_OR_UNRESOLVED_GRANTS" },
    );
  });
for (const [name, grant] of [
  ["global SELECT", "GRANT SELECT ON *.* TO " + recipient],
  ["other schema", "GRANT SELECT ON `other`.* TO " + recipient],
  ["table scope", "GRANT SELECT ON `traceflow`.`table` TO " + recipient],
  ["GRANT OPTION", preparedGrants[1] + " WITH GRANT OPTION"],
  ["public assignment", publicAssignment],
  ["additional role", "GRANT `reader`@`%` TO " + recipient],
  ["ADMIN OPTION", publicAssignment + " WITH ADMIN OPTION"],
  ["partial revoke", "REVOKE SELECT ON `other`.* FROM " + recipient],
  ["trailing SQL", preparedGrants[1] + "; SELECT 1"],
])
  test("prepared grants still reject " + name, () => {
    assert.throws(
      () => validatePrepared(preparedRows([...preparedGrants, grant])),
      { code: "EXCESSIVE_OR_UNRESOLVED_GRANTS" },
    );
  });
for (const account of ["`other`@`10.20.1.184`", "`traceflow_diag`@`%`"])
  test("prepared grants bind the complete recipient " + account, () => {
    assert.throws(
      () =>
        validatePrepared(
          preparedRows(["GRANT SELECT ON `traceflow`.* TO " + account]),
        ),
      { code: "GRANT_IDENTITY_MISMATCH" },
    );
  });

test("MySQL 26.7 prepared rows reach only the managed intermediate result", async () => {
  const r = await scenario({
    audited: true,
    grantColumn: "f0",
    identity: { port: 3306n },
  });
  assert.equal(r.value.status, "PRISMA_VERIFIED");
  assert.equal(r.value.final, false);
  assert.equal(r.value.writes, false);
  assert.equal(r.value.payload.disconnected, true);
  sameQueries(r.queries, [
    ...originalSql.slice(0, 4),
    prismaAudit.AUDITED_SETTINGS_SQL,
    "SELECT 1",
    prismaAudit.AUDITED_FINAL_SQL,
    originalSql[3],
  ]);
});
test("MySQL 26.7 prepared rows preserve local-isolated direct-only diagnostics", async () => {
  const r = await scenario({
    local: true,
    publicRole: false,
    grantColumn: "f0",
  });
  assert.equal(r.value.status, "PASS");
  assert.equal(r.value.mode, "local-isolated");
  assert.equal(r.value.writes, false);
  assert.equal(r.value.disconnected, true);
});
for (const [name, rows, code] of [
  [
    "extra write",
    preparedRows([
      ...preparedGrants,
      "GRANT INSERT ON `traceflow`.* TO " + recipient,
    ]),
    "EXCESSIVE_OR_UNRESOLVED_GRANTS",
  ],
  [
    "public assignment",
    preparedRows([...preparedGrants, publicAssignment]),
    "EXCESSIVE_OR_UNRESOLVED_GRANTS",
  ],
  [
    "malformed result",
    [{ f0: unsafeDetail, extra: unsafeDetail }],
    "MALFORMED_GRANTS",
  ],
  [
    "foreign host",
    preparedRows(["GRANT SELECT ON `traceflow`.* TO `traceflow_diag`@`%`"]),
    "GRANT_IDENTITY_MISMATCH",
  ],
  [
    "SHOW VIEW outside approved profile",
    preparedRows(["GRANT SELECT, SHOW VIEW ON `traceflow`.* TO " + recipient]),
    "AUDIT_SESSION_GRANTS_MISMATCH",
  ],
])
  for (const final of [false, true])
    test(
      "prepared managed " +
        (final ? "final" : "initial") +
        " audit rejects " +
        name,
      async () => {
        const r = await scenario({
          audited: true,
          grantColumn: "f0",
          [final ? "finalGrants" : "directGrants"]: rows,
        });
        assert.equal(r.value.status, "FAIL");
        assert.equal(r.value.code, code);
        assert.equal(
          r.value.phase,
          final ? "SQL_FINAL_GRANTS" : "DIRECT_GRANTS",
        );
        assert.ok(!JSON.stringify(r.value).includes(unsafeDetail));
        assert.equal(
          r.events.filter((event) => event === "DISCONNECT").length,
          1,
        );
      },
    );
