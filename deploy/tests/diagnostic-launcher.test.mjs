import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";
import * as heatwave from "../../backend/scripts/lib/heatwave-connection.js";
import {
  validateRoleAttestation,
  requireAbsentRole,
  parseRoleAttestationJson,
} from "../../backend/scripts/lib/heatwave-role-attestation.js";
import * as auditEvidence from "../../backend/scripts/lib/heatwave-audit-evidence.js";
import { attestationFixture } from "./helpers/role-attestation-fixture.mjs";
import { auditFixture } from "./helpers/administrative-audit-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sanitizedResult } from "../scripts/diagnostic-launcher.mjs";

test("launcher refuses raw or encoded credentials and complete database URLs", () => {
  const password = randomBytes(24).toString("base64") + ":@/";
  for (const value of [
    password,
    encodeURIComponent(password),
    "mysql:" + "//synthetic@127.0.0.1/schema",
  ]) {
    assert.throws(
      () =>
        sanitizedResult(
          {
            code: 0,
            output: JSON.stringify({ status: "PASS", detail: value }),
          },
          password,
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  }
});
test("launcher refuses inconsistent exit, unstructured errors and invalid JSON", () => {
  const password = randomBytes(32).toString("hex");
  for (const result of [
    { code: 1, output: '{"status":"PASS"}' },
    { code: 0, output: '{"status":"FAIL","code":"REJECTED"}' },
    { code: 1, output: '{"status":"FAIL","code":"raw error detail"}' },
    { code: 0, output: "unexpected" },
    { code: 0, output: '{"status":"UNKNOWN"}' },
  ])
    assert.throws(() => sanitizedResult(result, password));
});
test("launcher retains sanitized canonical results", () => {
  const password = randomBytes(32).toString("hex");
  for (const result of [
    { code: 0, output: '{"status":"CONFIG_VALID","connected":false}' },
    { code: 0, output: '{"status":"PASS","writes":false,"disconnected":true}' },
    {
      code: 1,
      output:
        '{"status":"FAIL","code":"TLS_REQUIRED","phase":"TLS_PROBE","writes":false}',
    },
  ])
    assert.deepEqual(
      sanitizedResult(result, password),
      JSON.parse(result.output),
    );
});

test("launcher retains the canonical failure phase and optional MySQL code", () => {
  for (const mysqlCode of [undefined, "1", "1227", "1295", "3530", "65535"]) {
    const diagnostic = {
      status: "FAIL",
      code: "P2010",
      phase: "SQL_IDENTITY",
      writes: false,
      ...(mysqlCode === undefined ? {} : { mysqlCode }),
    };
    assert.deepEqual(
      sanitizedResult(
        { code: 1, output: JSON.stringify(diagnostic) },
        "synthetic-test-only",
      ),
      diagnostic,
    );
  }
});

test("launcher refuses missing, malformed or unexpected failure fields", () => {
  const base = {
    status: "FAIL",
    code: "P2010",
    phase: "SQL_IDENTITY",
    writes: false,
  };
  const mutations = [
    { phase: undefined },
    { phase: "SQL_UNREVIEWED" },
    { phase: ["SQL_IDENTITY"] },
    { phase: "SQL_IDENTITY\n" },
    { code: ["P2010"] },
    { code: "A".repeat(65) },
    { writes: undefined },
    { writes: true },
    { writes: "false" },
    ...[
      null,
      1227,
      "0",
      "65536",
      "01227",
      "1e3",
      "1227\n",
      "1227 ",
      "N/A",
      {},
      [],
    ].map((mysqlCode) => ({ mysqlCode })),
    ...[
      "message",
      "stack",
      "meta",
      "sql",
      "DATABASE_URL",
      "password",
      "packageId",
      "unexpected",
    ].map((key) => ({ [key]: "refused" })),
  ];
  for (const mutation of mutations)
    assert.throws(
      () =>
        sanitizedResult(
          { code: 1, output: JSON.stringify({ ...base, ...mutation }) },
          "synthetic-test-only",
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  for (const field of ["phase", "mysqlCode", "unexpected"])
    for (const status of ["PASS", "CONFIG_VALID"])
      assert.throws(
        () =>
          sanitizedResult(
            { code: 0, output: JSON.stringify({ status, [field]: "refused" }) },
            "synthetic-test-only",
          ),
        { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
      );
});

test("launcher rejects multiple JSON records and non-object outputs", () => {
  for (const output of [
    "null",
    "[]",
    '"FAIL"',
    '{"status":"FAIL"}\n{"status":"FAIL"}',
  ])
    assert.throws(() =>
      sanitizedResult({ code: 1, output }, "synthetic-test-only"),
    );
});

test("launcher accepts only the predefined role-audit phases and safe errors", () => {
  for (const phase of [
    "ADMIN_ROLE_ATTESTATION",
    "ROLE_ATTESTATION_FINAL",
    "SQL_ROLE_SETTINGS",
    "ROLE_WARNINGS",
    "SESSION_START",
    "SESSION_END",
    "SQL_ROLE_GRAPH",
    "ROLE_GRAPH",
    "SQL_PUBLIC_GRANTS",
    "EFFECTIVE_GRANTS",
  ]) {
    const diagnostic = {
      status: "FAIL",
      code: "P2010",
      phase,
      mysqlCode: "3530",
      writes: false,
    };
    assert.deepEqual(
      sanitizedResult(
        { code: 1, output: JSON.stringify(diagnostic) },
        "synthetic-test-only",
      ),
      diagnostic,
    );
  }
  for (const phase of [
    "SQL_ROLE_GRAPH_EXTRA",
    "ROLE_GRAPH\n",
    "SHOW GRANTS",
    { name: "ROLE_GRAPH" },
  ]) {
    assert.throws(
      () =>
        sanitizedResult(
          {
            code: 1,
            output: JSON.stringify({
              status: "FAIL",
              code: "P2010",
              phase,
              writes: false,
            }),
          },
          "synthetic-test-only",
        ),
      { code: "DIAGNOSTIC_OUTPUT_REFUSED" },
    );
  }
});

test("launcher refuses managed PASS and all claimed role expansion", () => {
  for (const diagnostic of [
    {
      status: "PASS",
      mode: "oci-read-only",
      writes: false,
      disconnected: true,
    },
    {
      status: "PASS",
      roleVerification: {
        mandatoryPublic: true,
        activePublic: false,
        expanded: true,
        graphVerified: true,
        strategy: "using-public",
      },
    },
    {
      status: "PASS",
      roleVerification: {
        mandatoryPublic: false,
        activePublic: false,
        expanded: false,
        graphVerified: false,
        strategy: "direct-only",
        extra: true,
      },
    },
  ])
    assert.throws(
      () =>
        sanitizedResult(
          { code: 0, output: JSON.stringify(diagnostic) },
          "synthetic-test-only",
        ),
      { code: "UNVERIFIED_ROLE_AUDIT_RESULT" },
    );
});

const launcherSource = await readFile(
  new URL("../scripts/diagnostic-launcher.mjs", import.meta.url),
  "utf8",
);
// Test main's ordering using in-memory modules only. No child, verifier, runtime,
// credential file, network connection or installed distribution is opened.
async function launchScenario(options = {}) {
  const f = attestationFixture({ mode: "oci-read-only" });
  if (options.mutate) options.mutate(f);
  const events = [],
    output = [];
  const installed = f.root + "/deploy/scripts/diagnostic-launcher.mjs";
  const processDouble = new EventEmitter();
  Object.assign(processDouble, {
    env: options.environment ?? {},
    argv: ["/usr/bin/node", installed],
    execPath: "/usr/bin/node",
    getuid: () => (options.root ? 0 : 1000),
    exitCode: undefined,
  });
  let deadline;
  const context = createContext({
    process: processDouble,
    URL,
    Buffer,
    console: { log: (value) => output.push(value) },
    setTimeout: (fn) => {
      deadline = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  const values = {
    authorization: "/synthetic/authorization.json",
    "credential-file": "/synthetic/password.json",
    "manifest-sha256": f.binding.manifestSha256,
    "validate-only": true,
  };
  const connection = {
    ...heatwave,
    protectedFile: async (path) => {
      if (path === values.authorization) {
        events.push("authorization");
        return JSON.stringify(f.authorization);
      }
      assert.equal(path, values["credential-file"]);
      events.push("credential");
      return JSON.stringify({
        password: options.password ?? "synthetic-test-only:@/",
      });
    },
  };
  const childProcess = {
    spawnSync: () => {
      events.push("integrity");
      return {
        status: options.integrityFail ? 1 : 0,
        stdout: JSON.stringify({
          status: "VERIFIED",
          packageId: options.receiptMismatch
            ? "traceflow-prisma-diagnostic-" + "f".repeat(16)
            : f.binding.packageId,
        }),
      };
    },
    spawn: (_exe, args, config) => {
      events.push("spawn");
      assert.ok(args.includes("--validate-only"));
      assert.equal(config.env.NODE_ENV, "production");
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () =>
        queueMicrotask(() => child.emit("close", null, "SIGKILL"));
      queueMicrotask(() => {
        if (options.timeout) {
          deadline();
          return;
        }
        if (options.interrupted) {
          processDouble.emit("SIGTERM");
          return;
        }
        if (options.childError) {
          child.emit("error", Error("synthetic private detail"));
          return;
        }
        child.stderr.emit("data", Buffer.from("synthetic private detail"));
        child.stdout.emit(
          "data",
          Buffer.from(
            JSON.stringify(
              options.childOutput ?? {
                status: "CONFIG_VALID",
                mode: "oci-read-only",
                connected: false,
              },
            ),
          ),
        );
        child.emit(
          "close",
          options.childOutput?.status === "FAIL" ? 1 : 0,
          null,
        );
      });
      return child;
    },
  };
  const modules = {
    "../../backend/scripts/lib/heatwave-audit-evidence.js": auditEvidence,
    "node:util": { parseArgs: () => ({ values }) },
    "node:child_process": childProcess,
    "node:path": nodePath,
    "node:url": nodeUrl,
    "../../backend/scripts/lib/heatwave-connection.js": connection,
    "../../backend/scripts/lib/heatwave-role-attestation.js": {
      parseRoleAttestationJson,
      requireAbsentRole,
      loadRoleAttestation: async (authorization, root) => {
        events.push("attestation");
        assert.equal(root, f.root);
        if (options.attestationError)
          throw Object.assign(Error("synthetic private detail"), {
            code: options.attestationError,
          });
        return validateRoleAttestation(f.evidence, authorization, f.binding);
      },
    },
    "./diagnostic-runtime.mjs": {
      validateRuntime: () => events.push("runtime"),
    },
  };
  const module = new SourceTextModule(launcherSource, {
    context,
    identifier: nodeUrl.pathToFileURL(installed).href,
    initializeImportMeta: (meta) => {
      meta.url = nodeUrl.pathToFileURL(installed).href;
    },
  });
  await module.link((specifier) => {
    assert.ok(
      Object.hasOwn(modules, specifier),
      "Only synthetic dependencies may be loaded",
    );
    const dependency = modules[specifier],
      names = Object.keys(dependency);
    return new SyntheticModule(
      names,
      function () {
        for (const name of names) this.setExport(name, dependency[name]);
      },
      { context },
    );
  });
  await module.evaluate();
  assert.equal(output.length, 1);
  assert.ok(
    !output[0].includes("synthetic private detail") &&
      !output[0].includes("synthetic-test-only") &&
      !output[0].includes("mysql://"),
  );
  return {
    events,
    result: JSON.parse(output[0]),
    exitCode: processDouble.exitCode,
  };
}

test("launcher checks integrity and attestation before credential; validate-only is forwarded", async () => {
  const result = await launchScenario();
  assert.deepEqual(result.events, [
    "integrity",
    "runtime",
    "authorization",
    "attestation",
    "credential",
    "spawn",
  ]);
  assert.equal(result.result.status, "CONFIG_VALID");
  assert.equal(result.result.connected, false);
  assert.equal(result.exitCode, 0);
});
for (const [name, options, code] of [
  ["integrity", { integrityFail: true }, "PACKAGE_INTEGRITY_FAILED"],
  ["package", { receiptMismatch: true }, "ROLE_ATTESTATION_PACKAGE_MISMATCH"],
  ["root", { root: true }, "UNPRIVILEGED_USER_REQUIRED"],
  [
    "environment",
    { environment: { DATABASE_URL: "refused" } },
    "INHERITED_ENVIRONMENT_REFUSED",
  ],
  [
    "missing evidence",
    {
      mutate: (f) => {
        delete f.authorization.roleAttestation;
      },
    },
    "ROLE_ATTESTATION_PACKAGE_MISMATCH",
  ],
  [
    "expired",
    {
      mutate: (f) => {
        f.evidence.expiresAt = "2000-01-01T00:00:00.000Z";
      },
    },
    "ROLE_ATTESTATION_EXPIRED",
  ],
  [
    "present",
    {
      mutate: (f) => {
        f.evidence.observations.existence.accountCount = 1;
      },
    },
    "ROLE_PRESENT_UNVERIFIED",
  ],
  [
    "custody",
    { attestationError: "ROLE_ATTESTATION_UNTRUSTED_FILE" },
    "ROLE_ATTESTATION_UNTRUSTED_FILE",
  ],
  [
    "hash",
    { attestationError: "ROLE_ATTESTATION_HASH_MISMATCH" },
    "ROLE_ATTESTATION_HASH_MISMATCH",
  ],
  [
    "extra field",
    {
      mutate: (f) => {
        f.evidence.role.extra = true;
      },
    },
    "ROLE_ATTESTATION_INVALID",
  ],
  [
    "other execution",
    {
      mutate: (f) => {
        f.evidence.executionId = "44444444-4444-4444-8444-444444444444";
      },
    },
    "ROLE_ATTESTATION_INVALID",
  ],
])
  test("launcher refuses " + name + " before credential", async () => {
    const r = await launchScenario(options);
    assert.equal(r.result.status, "FAIL");
    assert.equal(r.result.code, code);
    assert.equal(r.result.writes, false);
    assert.equal(r.exitCode, 1);
    assert.ok(!r.events.includes("credential") && !r.events.includes("spawn"));
  });
for (const [name, options, code] of [
  ["deadline", { timeout: true }, "LAUNCHER_DEADLINE"],
  ["signal", { interrupted: true }, "DIAGNOSTIC_INTERRUPTED"],
  ["start", { childError: true }, "DIAGNOSTIC_START_FAILED"],
])
  test("launcher preserves process control: " + name, async () => {
    const r = await launchScenario(options);
    assert.equal(r.result.status, "FAIL");
    assert.equal(r.result.code, code);
    assert.equal(r.exitCode, 1);
  });
test("launcher refuses managed PASS even when child omits or contradicts its mode", async () => {
  for (const mode of ["oci-read-only", "local-isolated", undefined]) {
    const r = await launchScenario({
      childOutput: { status: "PASS", mode, writes: false, disconnected: true },
    });
    assert.equal(r.result.code, "UNVERIFIED_ROLE_AUDIT_RESULT");
    assert.equal(r.exitCode, 1);
  }
});
test("launcher preserves the warnings blocker as one sanitized JSON", async () => {
  const failure = {
    status: "FAIL",
    code: "ROLE_WARNINGS_UNVERIFIED",
    phase: "ROLE_WARNINGS",
    writes: false,
  };
  const r = await launchScenario({ childOutput: failure });
  assert.equal(
    r.result.packageId,
    "traceflow-prisma-diagnostic-" + "a".repeat(16),
  );
  for (const [key, value] of Object.entries(failure))
    assert.equal(r.result[key], value);
  assert.equal(r.exitCode, 1);
});

test("launcher preserves rejection of every ASCII control in credentials", async () => {
  for (const char of [...Array.from({ length: 32 }, (_, i) => i), 127]) {
    const r = await launchScenario({
      password: "synthetic" + String.fromCharCode(char),
    });
    assert.equal(r.result.code, "CREDENTIAL_FORMAT");
    assert.ok(!r.events.includes("spawn"));
  }
});

test("v2 operational gate is enforced before the launcher reads any credential", async () => {
  const a = auditFixture();
  const r = await launchScenario({
    mutate(f) {
      f.authorization = a.authorization;
      f.binding = a.binding;
      f.root = "/opt/traceflow-diagnostics/" + a.binding.packageId;
    },
  });
  assert.equal(r.result.status, "FAIL");
  assert.equal(r.result.code, "ADMIN_COLLECTION_RUNTIME_UNVERIFIED");
  assert.deepEqual(r.events, ["integrity", "runtime", "authorization"]);
});
test("launcher rejects duplicate JSON fields instead of accepting the last value", () => {
  for (const output of [
    '{"status":"PASS","status":"CONFIG_VALID","connected":false}',
    '{"status":"FAIL","code":"P2010","code":"OTHER","phase":"SQL_IDENTITY","writes":false}',
  ])
    assert.throws(() =>
      sanitizedResult({ code: 0, output }, "synthetic-secret"),
    );
});
