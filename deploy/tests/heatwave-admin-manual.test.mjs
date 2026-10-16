import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  executeManual,
  createAdministrativeIO,
  validateManualArguments,
  validatePrismaCapture,
  requireAdministrativeHost,
  verifyPrefix,
} from "../scripts/heatwave-admin-manual.mjs";
import {
  ManualCustody,
  INPUT_BASE,
  OPERATIONS,
  STAGE_BY_OPERATION,
  validateReceipt,
} from "../../backend/scripts/lib/heatwave-manual-custody.js";
import {
  EVIDENCE_BASE,
  envelope,
  PRISMA_CHECKS,
} from "../../backend/scripts/lib/heatwave-audit-evidence.js";
import {
  canonical,
  digest,
  administrativeSql,
} from "../../backend/scripts/lib/heatwave-admin-audit.js";
import {
  cleanEnvironment,
  mysqlArguments,
  validateAdminOptions,
  runBounded,
} from "../scripts/lib/heatwave-manual-process.mjs";
import {
  auditFixture,
  transcript,
} from "./helpers/administrative-audit-fixture.mjs";

// Entirely in memory. No /etc paths, processes, credentials or sockets are real.
function filesystem() {
  const files = new Map();
  let ino = 0;
  const fail = (code) => {
    throw Object.assign(new Error("synthetic private detail"), { code });
  };
  const put = (path, data = "", options = {}) => {
    const value = {
      dev: 1,
      ino: ++ino,
      uid: 0,
      gid: 1200,
      mode: 0o400,
      nlink: 1,
      mtimeMs: 1,
      ctimeMs: 1,
      type: "file",
      data: Buffer.from(data),
      ...options,
    };
    files.set(path, value);
    return value;
  };
  const get = (p) => files.get(p) ?? fail("ENOENT");
  const stat = (f) => ({
    ...f,
    size: f.data.length,
    isFile: () => f.type === "file",
    isDirectory: () => f.type === "directory",
    isSymbolicLink: () => f.type === "link",
  });
  for (const path of [
    "/",
    "/etc",
    "/etc/traceflow",
    EVIDENCE_BASE,
    EVIDENCE_BASE + "/control",
    INPUT_BASE,
  ])
    put(path, "", {
      type: "directory",
      mode: path.endsWith("/control") ? 0o700 : 0o750,
    });
  const io = {
    async realpath(p) {
      get(p);
      for (const [path, file] of files)
        if (file.type === "link" && (p === path || p.startsWith(path + "/")))
          return file.target + p.slice(path.length);
      return p;
    },
    async lstat(p) {
      return stat(get(p));
    },
    async mkdir(p, { mode }) {
      if (files.has(p)) fail("EEXIST");
      get(dirname(p));
      put(p, "", { type: "directory", mode });
    },
    async open(p, flags, mode) {
      if (flags & constants.O_CREAT) {
        if (files.has(p) && flags & constants.O_EXCL) fail("EEXIST");
        put(p, "", { mode, gid: 0 });
      }
      const f = get(p);
      if (f.type === "link" && flags & constants.O_NOFOLLOW) fail("ELOOP");
      io.onOpen?.(p, f);
      return {
        fd: 99,
        async stat() {
          return stat(f);
        },
        async read(buffer, offset, length, position) {
          io.onRead?.(p, f);
          const bytesRead = Math.min(length, f.data.length - position);
          f.data.copy(buffer, offset, position, position + bytesRead);
          return { bytesRead };
        },
        async writeFile(b) {
          f.data = Buffer.from(b);
          f.mtimeMs++;
          f.ctimeMs++;
          io.onWrite?.(p, f);
        },
        async chown(uid, gid) {
          f.uid = uid;
          f.gid = gid;
        },
        async chmod(mode) {
          f.mode = mode;
        },
        async sync() {},
        async close() {},
      };
    },
  };
  return { files, put, get, io, store: new ManualCustody(1200, io) };
}
test("administrative reader validates pinned private file without changing legacy reader", async () => {
  const f = filesystem(),
    path = INPUT_BASE + "/synthetic.json";
  f.put(path, "{}");
  const h = await f.store.openProtected(path);
  assert.equal(h.bytes.toString(), "{}");
  await h.recheck();
  await h.close();
});
for (const [name, change] of [
  ["wrong owner", (f, p) => (f.get(p).uid = 1200)],
  ["world readable credential", (f, p) => (f.get(p).mode = 0o644)],
  ["executor writable evidence", (f, p) => (f.get(p).mode = 0o660)],
  ["hard link", (f, p) => (f.get(p).nlink = 2)],
  [
    "symbolic link",
    (f, p) => {
      f.get(p).type = "link";
      f.get(p).target = "/different";
    },
  ],
  ["special file", (f, p) => (f.get(p).type = "fifo")],
  ["empty", (f, p) => (f.get(p).data = Buffer.alloc(0))],
  ["oversize", (f, p) => (f.get(p).data = Buffer.alloc(16385))],
  ["writable parent", (f) => (f.get(INPUT_BASE).mode = 0o777)],
  ["executor parent", (f) => (f.get(INPUT_BASE).uid = 1200)],
  [
    "ancestor symlink",
    (f) => {
      f.get(INPUT_BASE).type = "link";
      f.get(INPUT_BASE).target = "/different";
    },
  ],
  ["replace before open", (f, p) => (f.io.onOpen = () => f.put(p, "{}"))],
  ["change during read", (f) => (f.io.onRead = (_p, node) => node.ctimeMs++)],
  [
    "replace parent during read",
    (f) => (f.io.onRead = () => f.get(INPUT_BASE).ino++),
  ],
])
  test("custody refuses " + name, async () => {
    const f = filesystem(),
      p = INPUT_BASE + "/synthetic.json";
    f.put(p, "{}");
    change(f, p);
    await assert.rejects(f.store.openProtected(p));
  });
for (const path of ["relative", INPUT_BASE + "/../x", INPUT_BASE + "//x"])
  test("custody refuses unsafe path " + path, async () =>
    assert.rejects(filesystem().store.openProtected(path)),
  );
test("pinned credential changed during child execution is refused on final recheck", async () => {
  const f = filesystem(),
    p = INPUT_BASE + "/synthetic.json";
  f.put(p, "{}");
  const h = await f.store.openProtected(p);
  f.get(p).ctimeMs++;
  await assert.rejects(h.recheck());
  await h.close();
});
test("publication creates immutable root evidence, never replaces or deletes", async () => {
  const f = filesystem(),
    p = EVIDENCE_BASE + "/synthetic.json";
  await f.store.publish(p, { synthetic: true });
  assert.equal(f.get(p).uid, 0);
  assert.equal(f.get(p).mode, 0o440);
  assert.equal(f.get(p).gid, 1200);
  await assert.rejects(f.store.publish(p, { changed: true }), {
    code: "EEXIST",
  });
  assert.equal(f.get(p).data.toString(), '{"synthetic":true}\n');
});
test("publication detects parent replacement and leaves failed artifact for investigation", async () => {
  const f = filesystem(),
    p = EVIDENCE_BASE + "/synthetic.json";
  f.io.onWrite = () => f.get(EVIDENCE_BASE).ino++;
  await assert.rejects(f.store.publish(p, {}), {
    code: "AUDIT_PARENT_CHANGED",
  });
  assert.ok(f.files.has(p));
});
test("no arbitrary publisher destination", async () =>
  assert.rejects(filesystem().store.publish("/tmp/anything", {})));
test("administrative JSON rejects duplicates and malformed input", async () => {
  const f = filesystem(),
    p = INPUT_BASE + "/synthetic.json";
  for (const value of ['{"a":1,"a":2}', "{", '{"a":1,"\\u0061":2}']) {
    f.put(p, value);
    await assert.rejects(f.store.json(p));
  }
});
test("only four manual operations and exact arguments; no all/run/auto option", () => {
  const values = {
    operation: OPERATIONS[0],
    "run-id": auditFixture().authorization.administrativeAudit.runId,
    "manifest-sha256": "a".repeat(64),
  };
  validateManualArguments(values);
  for (const change of [
    { operation: "all" },
    { execute: true },
    { "run-id": "../x" },
    { "manifest-sha256": "a".repeat(64) + "\n" },
  ])
    assert.throws(() => validateManualArguments({ ...values, ...change }));
  assert.throws(() => requireAdministrativeHost("darwin", 0));
  assert.throws(() => requireAdministrativeHost("linux", 1200));
});
test("MySQL arguments enforce text/TLS/options isolation and carry no credential", () => {
  const args = mysqlArguments(auditFixture().authorization.target);
  assert.equal(args[0], "--defaults-file=/proc/self/fd/3");
  for (const flag of [
    "--no-login-paths",
    "--skip-reconnect",
    "--batch",
    "--raw",
    "--skip-column-names",
    "--ssl-mode=VERIFY_IDENTITY",
    "--local-infile=0",
  ])
    assert.ok(args.includes(flag));
  assert.ok(!args.some((s) => /password|mysql:\/\/|--force|--execute/.test(s)));
  assert.equal(
    Object.keys(cleanEnvironment("/usr/bin/node")).sort().join(","),
    "HOME,LANG,MYSQL_HISTFILE,NODE_ENV,PATH,TZ",
  );
});
test("credential option file permits only the fixed administrative account and quoted password", () => {
  validateAdminOptions(
    Buffer.from('[client]\nuser=traceflow_admin\npassword="SYNTHETIC_ONLY"\n'),
  );
  for (const value of [
    '[client]\nuser=root\npassword="synthetic"\n',
    '[client]\nuser=traceflow_admin\npassword="synthetic"\ninit-command=DROP DATABASE x\n',
    '[client]\nuser=traceflow_admin\npassword="synthetic\\n"\n',
    '[client]\nuser=traceflow_admin\npassword="synthetic"\n!include /private\n',
    '[client]\nuser=traceflow_admin\npassword=""\n',
    '[client]\nuser=traceflow_admin\npassword="synthetic\u0000"\n',
  ])
    assert.throws(() => validateAdminOptions(Buffer.from(value)));
});

function workflow() {
  const fixture = auditFixture(),
    f = filesystem();
  const auth = structuredClone(fixture.authorization);
  auth.administrativeAudit.initialSha256 = null;
  const calls = [];
  let clock = fixture.now - 40000;
  const options = {
    uid: 1200,
    gid: 1200,
    packageRoot: "/opt/traceflow-diagnostics/" + fixture.binding.packageId,
    node: "/usr/bin/node",
  };
  const io = createAdministrativeIO(f.store, options);
  io.collect = async () => {
    calls.push("mysql");
    clock += 100;
    return {
      exitCode: 0,
      signal: null,
      stderrBytes: 0,
      stdout: transcript(fixture.observations),
    };
  };
  io.capture = async (bound) => {
    calls.push("prisma");
    clock += 100;
    const initial = await f.store.json(
      EVIDENCE_BASE +
        "/" +
        bound.administrativeAudit.evidenceIds.ADMIN_INITIAL +
        ".json",
    );
    return {
      exitCode: 0,
      signal: null,
      stderrBytes: 0,
      stdout: JSON.stringify(
        envelope(
          bound,
          "PRISMA",
          {
            prisma: "6.12.0",
            connectionId: "201",
            disconnected: true,
            checks: Object.fromEntries(PRISMA_CHECKS.map((k) => [k, true])),
            stateSha256: initial.payload.stateSha256,
          },
          initial,
          new Date(clock).toISOString(),
          new Date(clock + 1).toISOString(),
        ),
      ),
    };
  };
  io.closure = async (bound) => ({
    formatVersion: 2,
    runId: bound.administrativeAudit.runId,
    authorizationId: bound.administrativeAudit.authorizationId,
    operatorId: bound.administrativeAudit.window.operatorId,
    confirmedAt: new Date(clock).toISOString(),
    noChangesReported: true,
    noUnexpectedAutomationReported: true,
    residualRiskAccepted: true,
  });
  const perform = async (operation) => {
    clock += 1000;
    const bound =
      operation === OPERATIONS[0]
        ? auth
        : await f.store.json(
            EVIDENCE_BASE +
              "/" +
              auth.administrativeAudit.runId +
              ".authorization.json",
          );
    return executeManual(
      operation,
      bound,
      fixture.binding,
      io,
      () => clock + 10,
    );
  };
  return {
    ...f,
    auth,
    fixture,
    calls,
    io,
    perform,
    now: () => clock + 10,
    advance: (n) => {
      clock += n;
    },
  };
}
test("each invocation performs only one stage; no early PASS; default offline gate stays closed", async () => {
  const w = workflow();
  assert.equal((await w.perform("collect-initial")).final, false);
  assert.deepEqual(w.calls, ["mysql"]);
  assert.equal((await w.perform("capture-prisma")).stage, "PRISMA");
  assert.deepEqual(w.calls, ["mysql", "prisma"]);
  assert.equal((await w.perform("collect-final")).final, false);
  assert.deepEqual(w.calls, ["mysql", "prisma", "mysql"]);
  await assert.rejects(w.perform("verify-offline"), {
    code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
  });
  assert.deepEqual(w.calls, ["mysql", "prisma", "mysql"]);
  assert.ok(
    [...w.files.keys()].some((p) => p.endsWith("verify-offline.failure.json")),
  );
});
test("offline contract success requires all protected receipts and explicit synthetic runtime double", async () => {
  const w = workflow();
  for (const op of OPERATIONS.slice(0, 3)) await w.perform(op);
  w.io.requireVerifiedRuntime = () => {}; // Explicit synthetic proof, not an operational switch.
  const r = await w.perform("verify-offline");
  assert.equal(r.status, "PASS");
  assert.equal(r.limitations.atomicSnapshot, false);
  assert.equal(r.limitations.continuousAudit, false);
  assert.ok(
    !/SYNTHETIC_ONLY|GRANT |SELECT |mysql:\/\//.test(JSON.stringify(r)),
  );
});
for (const op of OPERATIONS)
  test("attempt cannot be reused: " + op, async () => {
    const w = workflow();
    w.io.requireVerifiedRuntime = () => {};
    for (const step of OPERATIONS.slice(0, OPERATIONS.indexOf(op) + 1))
      await w.perform(step);
    const calls = [...w.calls];
    await assert.rejects(w.perform(op), { code: "EEXIST" });
    assert.deepEqual(w.calls, calls);
  });
test("failed SQL consumes attempt, never retries, and persists only sanitized failure", async () => {
  const w = workflow();
  let count = 0;
  w.io.collect = async () => {
    count++;
    return {
      exitCode: 1,
      signal: null,
      stderrBytes: 99,
      stdout: "synthetic password SQL private",
    };
  };
  await assert.rejects(w.perform("collect-initial"), {
    code: "ADMIN_SQL_FAILED",
  });
  await assert.rejects(w.perform("collect-initial"), { code: "EEXIST" });
  assert.equal(count, 1);
  const stored = [...w.files.entries()]
    .filter(([p]) => p.endsWith("failure.json"))
    .map(([, f]) => f.data.toString())
    .join("");
  assert.ok(!/password|private/.test(stored));
  assert.ok(stored.includes("ADMIN_SQL_FAILED"));
});
test("authorization ID cannot be reused under another run", async () => {
  const w = workflow();
  await w.perform("collect-initial");
  w.auth.administrativeAudit.runId =
    auditFixture().authorization.administrativeAudit.runId;
  await assert.rejects(w.perform("collect-initial"), { code: "EEXIST" });
  assert.equal(w.calls.length, 1);
});
for (const [name, change] of [
  ["missing receipt", (w, p) => w.files.delete(p)],
  ["executor-owned receipt", (w, p) => (w.get(p).uid = 1200)],
  [
    "hash changed",
    (w, p) => {
      const d = JSON.parse(w.get(p).data);
      d.documentSha256 = "0".repeat(64);
      w.get(p).data = Buffer.from(JSON.stringify(d));
    },
  ],
  ["duplicate field", (w, p) => (w.get(p).data = Buffer.from('{"a":1,"a":2}'))],
])
  test(
    "no manually supplied document bypasses receipt custody: " + name,
    async () => {
      const w = workflow();
      await w.perform("collect-initial");
      const p =
        EVIDENCE_BASE +
        "/control/" +
        w.auth.administrativeAudit.runId +
        "/collect-initial.receipt.json";
      change(w, p);
      await assert.rejects(w.perform("capture-prisma"));
      assert.deepEqual(w.calls, ["mysql"]);
    },
  );
test("window expiry stops before executing next process", async () => {
  const w = workflow();
  await w.perform("collect-initial");
  w.advance(700000);
  await assert.rejects(w.perform("capture-prisma"));
  assert.deepEqual(w.calls, ["mysql"]);
});
test("absence of final audit cannot produce consolidated result", async () => {
  const w = workflow();
  await w.perform("collect-initial");
  await w.perform("capture-prisma");
  await assert.rejects(w.perform("verify-offline"));
  assert.deepEqual(w.calls, ["mysql", "prisma"]);
});
test("receipt association and unknown fields are mandatory", () => {
  const f = auditFixture();
  const attempt = {
    formatVersion: 1,
    operation: "collect-initial",
    runId: f.initial.runId,
    authorizationId: f.initial.authorizationId,
    package: f.binding,
    startedAt: f.initial.startedAt,
    previousReceiptSha256: null,
  };
  const receipt = {
    formatVersion: 1,
    operation: attempt.operation,
    runId: attempt.runId,
    authorizationId: attempt.authorizationId,
    package: f.binding,
    attemptSha256: digest(attempt),
    documentSha256: digest(f.initial),
    previousReceiptSha256: null,
  };
  validateReceipt(
    receipt,
    attempt,
    f.initial,
    f.authorization,
    attempt.operation,
  );
  for (const bad of [
    { ...receipt, extra: true },
    { ...receipt, attemptSha256: "0".repeat(64) },
    { ...receipt, previousReceiptSha256: "0".repeat(64) },
  ])
    assert.throws(() =>
      validateReceipt(
        bad,
        attempt,
        f.initial,
        f.authorization,
        attempt.operation,
      ),
    );
  verifyPrefix(
    [{ document: f.initial, receipt, attempt }],
    f.authorization,
    f.binding,
    1,
    f.now,
  );
});
for (const [name, change] of [
  ["early PASS", (d) => (d.status = "PASS")],
  ["final true", (d) => (d.final = true)],
  ["not disconnected", (d) => (d.payload.disconnected = false)],
  ["extra field", (d) => (d.extra = "secret")],
  ["other server", (d) => (d.target.serverUuid = "wrong")],
  ["other run", (d) => (d.runId = "wrong")],
])
  test("capture rejects " + name, () => {
    const f = auditFixture();
    change(f.prisma);
    assert.throws(() =>
      validatePrismaCapture(
        {
          exitCode: 0,
          signal: null,
          stderrBytes: 0,
          stdout: JSON.stringify(f.prisma),
        },
        f.authorization,
        f.initial,
      ),
    );
  });
test("Prisma code/phase/native code survive capture failure without raw data", () => {
  const f = auditFixture();
  assert.throws(
    () =>
      validatePrismaCapture(
        {
          exitCode: 1,
          signal: null,
          stderrBytes: 0,
          stdout: JSON.stringify({
            status: "FAIL",
            code: "P2010",
            phase: "SQL_DIRECT_GRANTS",
            mysqlCode: "3530",
            writes: false,
          }),
        },
        f.authorization,
        f.initial,
      ),
    (e) =>
      e.code === "P2010" &&
      e.phase === "SQL_DIRECT_GRANTS" &&
      e.meta.code === "3530" &&
      e.message === "",
  );
});

function fakeChild(action) {
  const signals = new EventEmitter(),
    kills = [],
    child = new EventEmitter();
  child.pid = 1234;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const options = [];
  return {
    child,
    signals,
    kills,
    options,
    deps: {
      signals,
      spawnProcess: (cmd, args, config) => {
        options.push({ cmd, args, config });
        setImmediate(() => action(child, signals));
        return child;
      },
      killGroup: (pid) => {
        kills.push(pid);
        setImmediate(() => child.emit("close", null, "SIGKILL"));
      },
    },
  };
}
const spec = {
  command: "/not-executed",
  args: [],
  cwd: "/not-used",
  env: {},
  timeoutMs: 50,
  maxBytes: 64,
  input: "synthetic SQL",
  credentialFd: 99,
};
test("bounded process uses pinned descriptor, clean pipes and no shell; drains until close", async () => {
  const f = fakeChild((c) => {
    c.stdout.write("ok\n");
    c.emit("close", 0, null);
  });
  const r = await runBounded(spec, f.deps);
  assert.equal(r.stdout, "ok\n");
  assert.equal(r.exitCode, 0);
  assert.equal(f.options[0].config.shell, false);
  assert.equal(f.options[0].config.detached, true);
  assert.deepEqual(f.options[0].config.stdio, ["pipe", "pipe", "pipe", 99]);
  assert.equal(f.signals.listenerCount("SIGTERM"), 0);
});
for (const [name, action, code] of [
  ["timeout", () => {}, "AUDIT_PROCESS_TIMEOUT"],
  ["interrupt", (_c, s) => s.emit("SIGINT"), "AUDIT_PROCESS_INTERRUPTED"],
  [
    "stdout limit",
    (c) => c.stdout.write("x".repeat(65)),
    "AUDIT_PROCESS_OUTPUT_LIMIT",
  ],
  [
    "stderr limit",
    (c) => c.stderr.write("secret".repeat(20)),
    "AUDIT_PROCESS_OUTPUT_LIMIT",
  ],
])
  test("bounded process kills group on " + name, async () => {
    const f = fakeChild(action);
    await assert.rejects(runBounded(spec, f.deps), { code });
    assert.deepEqual(f.kills, [1234]);
    assert.equal(f.signals.listenerCount("SIGINT"), 0);
  });
test("raw stderr is counted, never returned or logged", async () => {
  const f = fakeChild((c) => {
    c.stderr.write("synthetic-secret");
    c.emit("close", 1, null);
  });
  const r = await runBounded(spec, f.deps);
  assert.equal(r.stderrBytes, 16);
  assert.ok(!JSON.stringify(r).includes("synthetic-secret"));
});
test("invalid UTF-8 is refused instead of silently replaced", async () => {
  const f = fakeChild((c) => {
    c.stdout.write(Buffer.from([255]));
    c.emit("close", 0, null);
  });
  await assert.rejects(runBounded(spec, f.deps));
});
test("fixed administrative input never includes credential contents", () => {
  assert.ok(!administrativeSql().includes("SYNTHETIC_ONLY"));
  assert.equal(STAGE_BY_OPERATION["verify-offline"], "CONSOLIDATED");
});

function adapterFixture() {
  const f = filesystem(),
    fixture = auditFixture(),
    auth = fixture.authorization;
  const id = auth.administrativeAudit.runId,
    calls = [];
  for (const dir of ["/etc/pki", "/etc/pki/traceflow"])
    f.put(dir, "", { type: "directory", mode: 0o755 });
  f.put("/etc/pki/traceflow/mysql-ca.pem", "SYNTHETIC_CA", { mode: 0o644 });
  f.put(
    INPUT_BASE + "/" + id + ".admin.cnf",
    '[client]\nuser=traceflow_admin\npassword="SYNTHETIC_ONLY"\n',
  );
  f.put(INPUT_BASE + "/" + id + ".prisma-authorization.json", canonical(auth), {
    uid: 1200,
    mode: 0o600,
  });
  f.put(
    INPUT_BASE + "/" + id + ".prisma-password.json",
    '{"password":"SYNTHETIC_ONLY"}',
    { uid: 1200, mode: 0o600 },
  );
  const config = {
    uid: 1200,
    gid: 1200,
    packageRoot: "/opt/traceflow-diagnostics/" + fixture.binding.packageId,
    node: "/usr/bin/node",
    dns: async () => calls.push("dns"),
    validateCa: (pem, hash) => {
      assert.equal(pem, "SYNTHETIC_CA");
      assert.equal(hash, auth.target.caSha256);
      calls.push("ca");
    },
    run: async (spec) => {
      calls.push(spec);
      return {
        exitCode: 0,
        signal: null,
        stderrBytes: 0,
        stdout: transcript(fixture.observations),
      };
    },
  };
  return {
    ...f,
    fixture,
    auth,
    id,
    calls,
    config,
    adapter: () => createAdministrativeIO(f.store, config),
  };
}
test("real collector adapter delegates only fixed text SQL and pins credential until process closes", async () => {
  const f = adapterFixture();
  const r = await f.adapter().collect(f.auth);
  assert.equal(r.exitCode, 0);
  assert.equal(f.calls.length, 3);
  const spec = f.calls[2];
  assert.equal(spec.command, "/usr/bin/mysql");
  assert.equal(spec.input, administrativeSql());
  assert.equal(spec.credentialFd, 99);
  assert.ok(!JSON.stringify(spec).includes("SYNTHETIC_ONLY"));
});
for (const which of [
  "DNS",
  "CA",
  "credential options",
  "credential race",
  "CA race",
])
  test("collector adapter fails closed: " + which, async () => {
    const f = adapterFixture();
    if (which === "DNS")
      f.config.dns = async () => {
        throw Object.assign(new Error(), { code: "DNS_IDENTITY_MISMATCH" });
      };
    if (which === "CA")
      f.config.validateCa = () => {
        throw Object.assign(new Error(), { code: "CA_FINGERPRINT_MISMATCH" });
      };
    if (which === "credential options")
      f.get(INPUT_BASE + "/" + f.id + ".admin.cnf").data = Buffer.from(
        "[client]\nhost=other\n",
      );
    if (which.endsWith("race"))
      f.config.run = async () => {
        f.get(
          which === "CA race"
            ? "/etc/pki/traceflow/mysql-ca.pem"
            : INPUT_BASE + "/" + f.id + ".admin.cnf",
        ).ctimeMs++;
        return {
          exitCode: 0,
          signal: null,
          stderrBytes: 0,
          stdout: transcript(f.fixture.observations),
        };
      };
    await assert.rejects(f.adapter().collect(f.auth));
    if (!which.endsWith("race"))
      assert.ok(!f.calls.some((x) => typeof x === "object"));
  });
test("capture adapter starts only existing launcher as traceflow and never reads admin credentials", async () => {
  const f = adapterFixture();
  f.files.delete(INPUT_BASE + "/" + f.id + ".admin.cnf");
  await f.adapter().capture(f.auth);
  assert.equal(f.calls.length, 1);
  const spec = f.calls[0];
  assert.equal(spec.command, "/usr/sbin/runuser");
  assert.deepEqual(spec.args.slice(0, 4), [
    "-u",
    "traceflow",
    "--",
    "/usr/bin/node",
  ]);
  assert.ok(
    spec.args.some((x) =>
      x.endsWith("/deploy/scripts/diagnostic-launcher.mjs"),
    ),
  );
  assert.ok(!spec.input && !JSON.stringify(spec).includes("SYNTHETIC_ONLY"));
});
test("capture rejects credential substitution before producing a receipt", async () => {
  const f = adapterFixture();
  f.config.run = async () => {
    f.get(INPUT_BASE + "/" + f.id + ".prisma-password.json").ctimeMs++;
    return {};
  };
  await assert.rejects(f.adapter().capture(f.auth), {
    code: "AUDIT_FILE_CHANGED",
  });
});
test("offline adapter reads closure only and never invokes mysql/launcher/DNS", async () => {
  const f = adapterFixture();
  f.put(
    INPUT_BASE + "/" + f.id + ".closure.json",
    canonical(f.fixture.closure),
  );
  assert.equal((await f.adapter().closure(f.auth)).runId, f.id);
  assert.deepEqual(f.calls, []);
  assert.throws(() => f.adapter().requireVerifiedRuntime(), {
    code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
  });
});
test("system executable symlinks require protected source and target; evidence still forbids symlinks", async () => {
  const f = filesystem();
  for (const d of ["/usr", "/usr/bin"])
    f.put(d, "", { type: "directory", mode: 0o755 });
  f.put("/usr/bin/python3.9", "synthetic binary", { mode: 0o755 });
  f.put("/usr/bin/python3", "", {
    type: "link",
    target: "/usr/bin/python3.9",
    mode: 0o777,
  });
  assert.equal(await f.store.program("/usr/bin/python3"), "/usr/bin/python3.9");
  f.get("/usr/bin/python3.9").mode = 0o777;
  await assert.rejects(f.store.program("/usr/bin/python3"));
});
test("CLI without explicit operation emits one sanitized JSON and cannot execute a stage", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../scripts/heatwave-admin-manual.mjs", import.meta.url),
      ),
    ],
    { env: { PATH: "/usr/bin:/bin" }, encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const out = JSON.parse(lines[0]);
  assert.equal(out.status, "FAIL");
  assert.equal(out.writes, false);
  assert.ok(
    ["ADMINISTRATIVE_LINUX_ROOT_REQUIRED", "AUDIT_CONTRACT_INVALID"].includes(
      out.code,
    ),
  );
});

test("expiry during DNS prevents credential loading and process start", async () => {
  const f = adapterFixture(),
    opened = [];
  f.io.onOpen = (p) => opened.push(p);
  f.config.dns = async () => {
    f.auth.expiresAt = new Date(Date.now() - 1).toISOString();
    f.auth.administrativeAudit.window.expiresAt = f.auth.expiresAt;
  };
  await assert.rejects(f.adapter().collect(f.auth));
  assert.ok(!opened.some((p) => p.endsWith(".admin.cnf")));
  assert.ok(!f.calls.some((x) => typeof x === "object"));
});
test("process deadline cannot exceed the authorized remaining window", async () => {
  const f = adapterFixture();
  f.auth.expiresAt = new Date(Date.now() + 1000).toISOString();
  f.auth.administrativeAudit.window.expiresAt = f.auth.expiresAt;
  await f.adapter().collect(f.auth);
  assert.ok(f.calls[2].timeoutMs > 0 && f.calls[2].timeoutMs <= 1000);
});
test("expired process window is rejected before spawning", async () => {
  const f = fakeChild(() => {});
  await assert.rejects(runBounded({ ...spec, timeoutMs: 0 }, f.deps));
  assert.equal(f.options.length, 0);
});
