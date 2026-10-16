import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as heatwave from "../../backend/scripts/lib/heatwave-connection.js";
import { requireCondition } from "../../backend/scripts/lib/oci-compatibility-safety.js";
import { sanitizedResult } from "../scripts/diagnostic-launcher.mjs";

const source = await readFile(
  new URL(
    "../../backend/scripts/validate-oci-heatwave-connection.js",
    import.meta.url,
  ),
  "utf8",
);
// Six historical statements from cf155225 remain byte-for-byte unchanged. 06.1.5
// adds the unfiltered role graph and uses bare SHOW GRANTS only for active public.
// MySQL behavior is sourced in runbook section 29, not proven by these test doubles.
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
  roleGraphSql,
  "SHOW GRANTS",
  originalSql[5],
];
const sqlPhases = [
  "SQL_IDENTITY",
  "SQL_SESSION_TLS",
  "SQL_SERVER_PARAMETERS",
  "SQL_DIRECT_GRANTS",
  "SQL_ROLE_GRAPH",
  "SQL_PUBLIC_GRANTS",
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
const grantRows = (values) =>
  values.map((grant) => ({ "Grants for traceflow_diag@10.20.1.184": grant }));
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
  const target = {
    host: local ? "127.0.0.1" : heatwave.managedHost,
    port: local ? 54321 : 3306,
    schema: local ? "tf_oci_abcdef012345_test" : "traceflow",
    user: "traceflow_diag",
    serverUuid: "11111111-1111-1111-1111-111111111111",
    version: "26.7.0-cloud",
    datadir: "/synthetic-owned-data",
    expectedAddress: "10.20.2.25",
    caSha256: "a".repeat(64),
  };
  const authorization = {
    formatVersion: 1,
    operation: "diagnose-read-only",
    mode: local ? "local-isolated" : "oci-read-only",
    approved: true,
    role: "diagnostic",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    target,
  };
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
  const activePublic = options.publicRole !== false && !options.inactivePublic;
  const responsesSql = [...currentSql];
  if (!activePublic) responsesSql[5] = originalSql[4];
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
        ...options.parameters,
      },
    ],
    Object.hasOwn(options, "directGrants")
      ? options.directGrants
      : grantRows([
          ...grants,
          ...(options.explicitPublic ? [publicAssignment] : []),
        ]),
    Object.hasOwn(options, "roleGraph") ? options.roleGraph : [publicGraph],
    Object.hasOwn(options, "effectiveGrants")
      ? options.effectiveGrants
      : grantRows([
          ...grants,
          ...(activePublic || options.explicitPublic ? [publicAssignment] : []),
        ]),
    [{ value: 1n }],
  ];
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

for (let index = 0; index < sqlPhases.length; index++) {
  test(
    "P2010 identifies " + sqlPhases[index] + " and stops subsequent queries",
    async () => {
      const result = await scenario({ failSql: index });
      assert.deepEqual(result.value, {
        status: "FAIL",
        code: "P2010",
        phase: sqlPhases[index],
        mysqlCode: "1227",
        writes: false,
      });
      sameQueries(result.queries, currentSql.slice(0, index + 1));
      assert.equal(
        result.events.filter((event) => event === "DISCONNECT").length,
        1,
      );
      assert.equal(result.exitCode, 1);
    },
  );
}

for (const local of [false, true]) {
  for (const publicRole of [false, true]) {
    test(
      "preserved SQL order, conditional role audit and successful cleanup: " +
        JSON.stringify({ local, publicRole }),
      async () => {
        const result = await scenario({ local, publicRole });
        sameQueries(
          result.queries,
          currentSql.filter(
            (_sql, index) => publicRole || ![4, 5].includes(index),
          ),
        );
        assert.equal(result.value.status, "PASS");
        assert.equal(result.value.disconnected, true);
        assert.equal(result.value.writes, false);
        assert.equal(result.value.parameters.maxConnections, "200");
        assert.equal(result.value.roleVerification.expanded, publicRole);
        assert.equal(result.value.roleVerification.graphVerified, publicRole);
        assert.equal(
          result.value.roleVerification.strategy,
          publicRole ? "active-session" : "direct-only",
        );
        assert.equal(result.events.at(-1), "DISCONNECT");
        assert.equal(
          result.events.filter((event) => event === "SESSION_START").length,
          1,
        );
        assert.equal(
          result.events.filter((event) => event === "SESSION_END").length,
          1,
        );
        assert.equal(
          result.events.filter((event) => event === "DISCONNECT").length,
          1,
        );
        assert.equal(result.exitCode, 0);
      },
    );
  }
}

test("identity, TLS, parameters, direct grants, USING and SELECT 1 remain unchanged", () => {
  for (const sql of originalSql) assert.ok(source.includes(sql));
});

// These are input/output contracts for the documented aggregation paths, not a
// simulation of the MySQL authorization engine or evidence about the managed host.
for (const inactivePublic of [false, true]) {
  for (const explicitPublic of [false, true]) {
    test(
      "mandatory public, USAGE-only inheritance: " +
        JSON.stringify({ inactivePublic, explicitPublic }),
      async () => {
        const result = await scenario({ inactivePublic, explicitPublic });
        const expected = [...currentSql];
        if (inactivePublic) expected[5] = originalSql[4];
        sameQueries(result.queries, expected);
        assert.equal(result.value.status, "PASS");
        assert.deepEqual(result.value.grants, ["SELECT"]);
        assert.equal(
          result.value.roleVerification.strategy,
          inactivePublic ? "using-public" : "active-session",
        );
      },
    );
  }
  test(
    "allowed inherited reads: " + JSON.stringify({ inactivePublic }),
    async () => {
      const result = await scenario({
        inactivePublic,
        effectiveGrants: grantRows([
          "GRANT USAGE ON *.* TO " + recipient,
          "GRANT SELECT, SHOW VIEW ON `traceflow`.* TO " + recipient,
          ...(!inactivePublic ? [publicAssignment] : []),
        ]),
      });
      assert.equal(result.value.status, "PASS");
      assert.deepEqual(result.value.grants, ["SELECT", "SHOW VIEW"]);
    },
  );
  for (const extra of [
    ...[
      "INSERT",
      "UPDATE",
      "DELETE",
      "CREATE",
      "ALTER",
      "DROP",
      "INDEX",
      "TRIGGER",
    ].map(
      (privilege) => "GRANT " + privilege + " ON `traceflow`.* TO " + recipient,
    ),
    ...["SELECT", "SUPER", "FILE", "SYSTEM_USER", "ROLE_ADMIN"].map(
      (privilege) => "GRANT " + privilege + " ON *.* TO " + recipient,
    ),
    "GRANT SELECT ON `other`.* TO " + recipient,
    "GRANT SELECT ON `traceflow`.specific_table TO " + recipient,
    "GRANT SELECT ON `traceflow`.* TO " + recipient + " WITH GRANT OPTION",
    "GRANT USAGE ON *.* TO " + recipient + " WITH GRANT OPTION",
    publicAssignment + " WITH ADMIN OPTION",
    "GRANT `nested`@`%` TO " + recipient,
    "REVOKE SELECT ON `other`.* FROM " + recipient,
  ]) {
    test(
      "refuses expanded privilege " + extra + "/inactive=" + inactivePublic,
      async () => {
        const result = await scenario({
          inactivePublic,
          effectiveGrants: grantRows([
            "GRANT SELECT ON `traceflow`.* TO " + recipient,
            ...(!inactivePublic ? [publicAssignment] : []),
            extra,
          ]),
        });
        assert.equal(result.value.status, "FAIL");
        assert.equal(result.value.phase, "EFFECTIVE_GRANTS");
        assert.equal(result.value.code, "EXCESSIVE_OR_UNRESOLVED_GRANTS");
        assert.ok(!result.queries.includes("SELECT 1"));
      },
    );
  }
  for (const mysqlCode of ["3530", "1142", "1295", undefined]) {
    test(
      "no SQL error fallback: " + JSON.stringify({ inactivePublic, mysqlCode }),
      async () => {
        const error = fault("P2010", mysqlCode);
        if (mysqlCode === undefined) delete error.meta.code;
        const result = await scenario({ inactivePublic, failSql: 5, error });
        assert.deepEqual(result.value, {
          status: "FAIL",
          code: "P2010",
          phase: "SQL_PUBLIC_GRANTS",
          ...(mysqlCode === undefined ? {} : { mysqlCode }),
          writes: false,
        });
        assert.equal(result.queries.length, 6);
        assert.equal(
          result.queries.at(-1),
          inactivePublic ? originalSql[4] : "SHOW GRANTS",
        );
        assert.ok(!result.queries.includes("SELECT 1"));
      },
    );
  }
}

const graphCases = [
  ["no applicable public (not resolved/granted)", [], "ROLE_GRAPH_UNVERIFIED"],
  [
    "additional inactive role",
    [publicGraph, { ...publicGraph, ROLE_NAME: "other" }],
    "ROLE_GRAPH_UNVERIFIED",
  ],
  [
    "nested role",
    [
      publicGraph,
      {
        ...publicGraph,
        GRANTEE: "public",
        GRANTEE_HOST: "%",
        ROLE_NAME: "nested",
      },
    ],
    "ROLE_GRAPH_UNVERIFIED",
  ],
  ["duplicate role", [publicGraph, publicGraph], "ROLE_GRAPH_UNVERIFIED"],
  [
    "wrong role",
    [{ ...publicGraph, ROLE_NAME: "administrator" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "wrong role host",
    [{ ...publicGraph, ROLE_HOST: "localhost" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "not mandatory",
    [{ ...publicGraph, IS_MANDATORY: "NO" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "ADMIN OPTION",
    [{ ...publicGraph, IS_GRANTABLE: "YES" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "unknown grantability",
    [{ ...publicGraph, IS_GRANTABLE: "UNKNOWN" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "wrong user",
    [{ ...publicGraph, USER: "another" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  ["wrong host", [{ ...publicGraph, HOST: "%" }], "UNREVIEWED_ROLE_GRAPH"],
  [
    "wrong grantee",
    [{ ...publicGraph, GRANTEE: "another" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  [
    "wrong grantee host",
    [{ ...publicGraph, GRANTEE_HOST: "%" }],
    "UNREVIEWED_ROLE_GRAPH",
  ],
  ["null response", null, "MALFORMED_ROLE_GRAPH"],
  ["non-array response", publicGraph, "MALFORMED_ROLE_GRAPH"],
  ["null row", [null], "MALFORMED_ROLE_GRAPH"],
  [
    "missing column",
    [{ ...publicGraph, USER: undefined }],
    "MALFORMED_ROLE_GRAPH",
  ],
  [
    "extra column",
    [{ ...publicGraph, unexpected: unsafeDetail }],
    "MALFORMED_ROLE_GRAPH",
  ],
  [
    "wrong type",
    [{ ...publicGraph, ROLE_NAME: ["public"] }],
    "MALFORMED_ROLE_GRAPH",
  ],
];
for (const [name, roleGraph, code] of graphCases) {
  test("fail-closed role inventory: " + name, async () => {
    const result = await scenario({ roleGraph });
    assert.deepEqual(result.value, {
      status: "FAIL",
      code,
      phase: "ROLE_GRAPH",
      writes: false,
    });
    sameQueries(result.queries, currentSql.slice(0, 5));
    assert.equal(result.events.at(-1), "DISCONNECT");
  });
}

for (const [name, options, code] of [
  [
    "active public not listed",
    { effectiveGrants: ["GRANT SELECT ON `traceflow`.* TO " + recipient] },
    "EFFECTIVE_GRANTS_UNVERIFIED",
  ],
  [
    "explicit assignment lost",
    {
      inactivePublic: true,
      explicitPublic: true,
      effectiveGrants: ["GRANT SELECT ON `traceflow`.* TO " + recipient],
    },
    "EFFECTIVE_GRANTS_UNVERIFIED",
  ],
  [
    "missing SELECT",
    {
      effectiveGrants: ["GRANT USAGE ON *.* TO " + recipient, publicAssignment],
    },
    "SELECT_PRIVILEGE_REQUIRED",
  ],
  [
    "direct privileges lost",
    {
      directGrants: [
        "GRANT SELECT, SHOW VIEW ON `traceflow`.* TO " + recipient,
      ],
    },
    "EFFECTIVE_GRANTS_UNVERIFIED",
  ],
]) {
  test("incomplete privilege audit: " + name, async () => {
    const result = await scenario(options);
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.value.phase, "EFFECTIVE_GRANTS");
    assert.equal(result.value.code, code);
    assert.ok(!result.queries.includes("SELECT 1"));
  });
}

for (const grants of [
  null,
  {},
  [],
  [null],
  [42],
  [["GRANT SELECT ON `traceflow`.* TO " + recipient]],
  [{ unexpected: unsafeDetail }],
  [
    {
      "Grants for traceflow_diag@10.20.1.184":
        "GRANT SELECT ON `traceflow`.* TO " + recipient,
      extra: unsafeDetail,
    },
  ],
  ["GRANT SELECT ON `traceflow`.* TO " + recipient + "\n"],
  ["GRANT SELECT ON `traceflow`.* TO " + recipient + " " + unsafeDetail],
  ["GRANT SELECT,,SHOW VIEW ON `traceflow`.* TO " + recipient],
  ["GRANT SELECT, SELECT ON `traceflow`.* TO " + recipient],
  ["GRANT SELECT ON `traceflow`.* TO `other`@`%`"],
]) {
  test(
    "malformed grants refuse at both audit stages " + JSON.stringify(grants),
    async () => {
      for (const key of ["directGrants", "effectiveGrants"]) {
        const result = await scenario({ [key]: grants });
        assert.equal(result.value.status, "FAIL");
        assert.equal(
          result.value.phase,
          key === "directGrants" ? "DIRECT_GRANTS" : "EFFECTIVE_GRANTS",
        );
        assert.ok(!result.queries.includes("SELECT 1"));
      }
    },
  );
}

test("unknown explicit role is refused even without mandatory roles", async () => {
  for (const publicRole of [false, true]) {
    const result = await scenario({
      publicRole,
      directGrants: [
        "GRANT SELECT ON `traceflow`.* TO " + recipient,
        "GRANT `other`@`%` TO " + recipient,
      ],
    });
    assert.equal(result.value.phase, "DIRECT_GRANTS");
    assert.equal(result.value.code, "EXCESSIVE_OR_UNRESOLVED_GRANTS");
    assert.equal(result.queries.length, 4);
  }
});

test("malicious grant/role getters are rejected without invocation or leaked metadata", async () => {
  let invoked = 0;
  const trap = () => {
    invoked++;
    throw new Error(unsafeDetail);
  };
  const grant = Object.defineProperty(
    {},
    "Grants for traceflow_diag@10.20.1.184",
    { get: trap },
  );
  const role = Object.defineProperty({ ...publicGraph }, "ROLE_NAME", {
    get: trap,
  });
  for (const options of [
    { directGrants: [grant] },
    { effectiveGrants: [grant] },
    { roleGraph: [role] },
  ]) {
    const result = await scenario(options);
    assert.equal(result.value.status, "FAIL");
    assert.ok(!Object.hasOwn(result.value, "mysqlCode"));
  }
  assert.equal(invoked, 0);
});

const validationCases = [
  [
    { authorizationText: "{" + unsafeDetail },
    "PREVALIDATION",
    "DIAGNOSTIC_FAILED",
    0,
  ],
  [
    { authorizationError: fault("PRIVATE_FILE_REQUIRED") },
    "PREVALIDATION",
    "PRIVATE_FILE_REQUIRED",
    0,
  ],
  [
    { ambiguousEnvironment: true },
    "PREVALIDATION",
    "AMBIGUOUS_DATABASE_URL",
    0,
  ],
  [
    { caError: fault("CA_FINGERPRINT_MISMATCH") },
    "TLS_CA",
    "CA_FINGERPRINT_MISMATCH",
    0,
  ],
  [
    { dnsError: fault("DNS_IDENTITY_MISMATCH") },
    "DNS_IDENTITY",
    "DNS_IDENTITY_MISMATCH",
    0,
  ],
  [
    { tlsError: fault("ERR_TLS_CERT_ALTNAME_INVALID") },
    "TLS_PROBE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    0,
  ],
  [{ prismaVersion: "unreviewed" }, "PRISMA_INIT", "PRISMA_VERSION", 0],
  [{ importError: fault("P1000") }, "PRISMA_INIT", "P1000", 0],
  [
    { identity: { uuid: "unexpected" } },
    "SERVER_IDENTITY",
    "SERVER_IDENTITY_MISMATCH",
    1,
  ],
  [
    { local: true, identity: { datadir: "/wrong-data" } },
    "SERVER_IDENTITY",
    "SERVER_IDENTITY_MISMATCH",
    1,
  ],
  [{ session: [] }, "SESSION_TLS", "PRISMA_TLS_REQUIRED", 2],
  [
    { parameters: { mandatoryRoles: "administrator" } },
    "ROLES",
    "UNREVIEWED_MANDATORY_ROLE",
    3,
  ],
  [
    { parameters: { activeRoles: "administrator" } },
    "ROLES",
    "UNREVIEWED_ACTIVE_ROLE",
    3,
  ],
  [
    { directGrants: ["GRANT SELECT, INSERT ON `traceflow`.* TO " + recipient] },
    "DIRECT_GRANTS",
    "EXCESSIVE_OR_UNRESOLVED_GRANTS",
    4,
  ],
  [
    { effectiveGrants: ["GRANT SELECT ON *.* TO " + recipient] },
    "EFFECTIVE_GRANTS",
    "EXCESSIVE_OR_UNRESOLVED_GRANTS",
    6,
  ],
];
for (const [options, phase, code, count] of validationCases) {
  test("fail-closed validation: " + phase + "/" + code, async () => {
    const result = await scenario(options);
    assert.equal(result.value.phase, phase);
    assert.equal(result.value.code, code);
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.exitCode, 1);
    sameQueries(result.queries, currentSql.slice(0, count));
    assert.equal(result.events.includes("DISCONNECT"), count > 0);
  });
}

test("validate-only never imports Prisma, probes TLS, resolves DNS or executes SQL", async () => {
  const result = await scenario({ validateOnly: true });
  assert.equal(result.value.status, "CONFIG_VALID");
  assert.equal(result.value.connected, false);
  assert.equal(result.queries.length, 0);
  for (const event of [
    "DISCONNECT",
    "DNS",
    "TLS_PROBE",
    "SESSION_START",
    "IMPORT:@prisma/client",
    "IMPORT:../src/database/prismaClient.js",
  ])
    assert.ok(!result.events.includes(event));
});

for (const [option, phase, count] of [
  ["transactionError", "SESSION_START", 0],
  ["transactionEndError", "SESSION_END", currentSql.length],
]) {
  test("pinned session failure remains fatal: " + phase, async () => {
    const result = await scenario({
      [option]: fault("P2028"),
      disconnectError: fault("P1017"),
    });
    assert.equal(result.value.status, "FAIL");
    assert.equal(result.value.code, "P2028");
    assert.equal(result.value.phase, phase);
    assert.equal(result.queries.length, count);
    assert.equal(result.events.at(-1), "DISCONNECT");
  });
}

test("a disconnect failure after successful queries is FAIL, never PASS", async () => {
  const result = await scenario({ disconnectError: fault("P1017", undefined) });
  assert.equal(result.value.phase, "DISCONNECT");
  assert.equal(result.value.code, "P1017");
  assert.equal(result.exitCode, 1);
  assert.equal(
    result.events.filter((event) => event === "DISCONNECT").length,
    1,
  );
});

test("disconnect failure cannot replace primary P2010 or emit another JSON", async () => {
  const result = await scenario({
    failSql: 5,
    error: fault("P2010", "3530"),
    disconnectError: fault("P1017", "2013"),
  });
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "P2010",
    phase: "SQL_PUBLIC_GRANTS",
    mysqlCode: "3530",
    writes: false,
  });
  assert.equal(result.exitCode, 1);
});

test("transaction rollback deadline/failure cannot hide primary P2010/3530", async () => {
  const result = await scenario({
    failSql: 5,
    error: fault("P2010", "3530"),
    timeoutAbort: true,
    abortError: fault("P2028"),
    disconnectError: fault("P1017"),
  });
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "P2010",
    phase: "SQL_PUBLIC_GRANTS",
    mysqlCode: "3530",
    writes: false,
  });
  assert.deepEqual(result.exits, [1]);
});

test("deadline during cleanup preserves primary P2010 and emits only once", async () => {
  const result = await scenario({
    failSql: 0,
    timeoutDisconnect: true,
    disconnectError: fault("P1017"),
  });
  assert.equal(result.value.code, "P2010");
  assert.equal(result.value.phase, "SQL_IDENTITY");
  assert.deepEqual(result.exits, [1]);
});

test("deadline without an earlier failure identifies DISCONNECT", async () => {
  const result = await scenario({ timeoutDisconnect: true });
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "DIAGNOSTIC_DEADLINE",
    phase: "DISCONNECT",
    writes: false,
  });
  assert.deepEqual(result.exits, [1]);
});

test("deadline during SQL identifies the active query and remains fail-closed", async () => {
  const result = await scenario({ timeoutSql: 1 });
  assert.deepEqual(result.value, {
    status: "FAIL",
    code: "DIAGNOSTIC_DEADLINE",
    phase: "SQL_SESSION_TLS",
    writes: false,
  });
  sameQueries(result.queries, originalSql.slice(0, 2));
  assert.deepEqual(result.exits, [1]);
});

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
