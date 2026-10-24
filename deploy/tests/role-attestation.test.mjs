import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as path from "node:path";
import * as attestation from "../../backend/scripts/lib/heatwave-role-attestation.js";
import { requireCondition } from "../../backend/scripts/lib/oci-compatibility-safety.js";
import { attestationFixture } from "./helpers/role-attestation-fixture.mjs";

const validate = (f) =>
  attestation.validateRoleAttestation(
    f.evidence,
    f.authorization,
    f.binding,
    f.now,
  );
test("closed valid contract is immutable; absence requires successful query", () => {
  for (const mode of ["local-isolated", "oci-read-only"]) {
    const f = attestationFixture({ mode });
    const value = validate(f);
    assert.equal(attestation.attestedRoleState(value), "ABSENT");
    attestation.requireAbsentRole(value);
    assert.ok(
      Object.isFrozen(value) && Object.isFrozen(value.observations.existence),
    );
  }
});
test("PRESENT and UNKNOWN never authorize absence", () => {
  const f = attestationFixture();
  f.evidence.observations.existence.accountCount = 1;
  const present = validate(f);
  assert.equal(attestation.attestedRoleState(present), "PRESENT");
  assert.throws(() => attestation.requireAbsentRole(present), {
    code: "ROLE_PRESENT_UNVERIFIED",
  });
  assert.equal(attestation.attestedRoleState(undefined), "UNKNOWN");
  assert.throws(() => attestation.requireAbsentRole(undefined), {
    code: "ROLE_EXISTENCE_UNKNOWN",
  });
});
for (const [name, value] of [
  ["evidence", undefined],
  ["evidence.publicAbsent", true],
  ["evidence.formatVersion", 2],
  ["evidence.kind", "publicAbsent"],
  ["evidence.evidenceId", "unknown"],
  ["authorization.roleAttestation", undefined],
  ["authorization.roleAttestation.path", "/arbitrary"],
  [
    "authorization.roleAttestation.executionId",
    "99999999-9999-4999-8999-999999999999",
  ],
  ["authorization.roleAttestation.sha256", "xyz"],
  ["authorization.roleAttestation.evidenceId", "../escape"],
  ["binding.packageId", "traceflow-prisma-diagnostic-" + "f".repeat(16)],
  ["binding.manifestSha256", "0".repeat(64)],
  ["evidence.target.serverUuid", "wrong"],
  ["evidence.target.account", "traceflow_diag@%"],
  ["evidence.target.host", "other.invalid"],
  ["evidence.target.expectedAddress", "127.0.0.2"],
  ["evidence.target.port", 3307],
  ["evidence.target.version", "8.4.8"],
  ["evidence.target.schema", "other"],
  ["evidence.target.caSha256", "0".repeat(64)],
  ["evidence.role.name", "admin"],
  ["evidence.role.host", "localhost"],
  ["evidence.observations.mandatoryRoles", ""],
  ["evidence.observations.activateAllRolesOnLogin", 1],
  ["evidence.observations.existence.status", "FAIL"],
  ["evidence.observations.existence.queryId", "SHOW_GRANTS"],
  ["evidence.observations.existence", { mysqlCode: "1141" }],
  ["evidence.observations.existence", { mysqlCode: "3530" }],
  ["evidence.observations.existence.accountCount", -1],
  ["evidence.observations.existence.accountCount", "0"],
  ["evidence.observations.existence.accountCount", 0.5],
  ["evidence.observations.existence.accountCount", 2 ** 54],
  ["evidence.grantsAudit", undefined],
  ["evidence.grantsAudit.status", "UNKNOWN"],
  ["evidence.grantsAudit.explicitRoleCount", 1],
  ["evidence.grantsAudit.privileges", ["SELECT", "INSERT"]],
  ["evidence.grantsAudit.account", "other@%"],
  ["evidence.grantsAudit.schema", "other"],
  ["evidence.grantsAudit.sha256", undefined],
  ["evidence.role.warningCount", 0],
  ["evidence.operatorId", ""],
  ["evidence.operatorId", "mysql://unsafe"],
  ["evidence.collectedAt", "yesterday"],
  ["evidence.collectedAt", "2030-01-01T00:00:00.000+00:00"],
])
  test("contract refuses " + name + "=" + JSON.stringify(value), () => {
    const f = attestationFixture(),
      keys = name.split(".");
    const parent = keys.slice(0, -1).reduce((p, k) => p[k], f);
    parent[keys.at(-1)] = value;
    assert.throws(() => validate(f));
  });
for (const [name, change] of [
  [
    "future",
    (f) => {
      f.evidence.collectedAt = new Date(f.now + 1).toISOString();
    },
  ],
  [
    "expired",
    (f) => {
      f.now = Date.parse(f.evidence.expiresAt);
    },
  ],
  [
    "over ten minutes",
    (f) => {
      f.evidence.expiresAt = new Date(
        Date.parse(f.evidence.collectedAt) + 600001,
      ).toISOString();
    },
  ],
  [
    "zero duration",
    (f) => {
      f.evidence.expiresAt = f.evidence.collectedAt;
    },
  ],
  [
    "authorization expires first",
    (f) => {
      f.authorization.expiresAt = new Date(f.now + 10).toISOString();
    },
  ],
])
  test("time refuses " + name, () => {
    const f = attestationFixture();
    change(f);
    assert.throws(() => validate(f));
  });
test("synthetic attestations cannot be used in production", () => {
  const f = attestationFixture({ mode: "oci-read-only" });
  f.evidence.source = "synthetic-lab";
  assert.throws(() => validate(f), { code: "ROLE_ATTESTATION_SOURCE" });
  f.evidence.mode = "local-isolated";
  assert.throws(() => validate(f), { code: "ROLE_ATTESTATION_SOURCE" });
});
test("strict JSON rejects duplicate members, escaped duplicates, malformed text and depth", () => {
  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":{"x":1,"x":2}}',
    '{"a":1,}',
    '{"x":undefined}',
    '{"x":NaN}',
    "[] trailing",
    "",
    "[1,]",
    "0" + " ".repeat(16384),
    "[".repeat(20) + "0" + "]".repeat(20),
  ])
    assert.throws(() => attestation.parseRoleAttestationJson(text));
  const f = attestationFixture();
  f.evidence = attestation.parseRoleAttestationJson(f.bytes.toString());
  validate(f);
});
test("contract does not invoke getters", () => {
  const f = attestationFixture();
  let invoked = 0;
  Object.defineProperty(f.evidence.role, "name", {
    get() {
      invoked++;
      throw Error("private");
    },
  });
  assert.throws(() => validate(f));
  assert.equal(invoked, 0);
});
test("ABSENT session matches full identity, configuration and inactive roles", () => {
  const f = attestationFixture(),
    value = validate(f);
  const identity = {
    currentUser: value.target.account,
    uuid: value.target.serverUuid,
    version: value.target.version,
    db: value.target.schema,
    port: value.target.port,
  };
  const parameters = { mandatoryRoles: "public", activeRoles: "NONE" };
  attestation.validateAbsentSession(
    value,
    f.authorization,
    identity,
    parameters,
  );
  for (const mutation of [
    { currentUser: "traceflow_diag@%" },
    { uuid: "other" },
    { version: "8.4.8" },
    { db: "other" },
    { port: 3307 },
  ])
    assert.throws(() =>
      attestation.validateAbsentSession(
        value,
        f.authorization,
        { ...identity, ...mutation },
        parameters,
      ),
    );
  for (const mutation of [
    { mandatoryRoles: "" },
    { mandatoryRoles: "public,admin" },
    { activeRoles: "`public`@`%`" },
  ])
    assert.throws(() =>
      attestation.validateAbsentSession(value, f.authorization, identity, {
        ...parameters,
        ...mutation,
      }),
    );
});
test("empty inventory confirms only shape; nonempty and malformed fail", () => {
  attestation.validateAbsentInventory([]);
  for (const value of [
    null,
    {},
    "",
    [null],
    [{ ROLE_NAME: "public" }],
    [{ ROLE_NAME: "admin" }],
  ])
    assert.throws(() => attestation.validateAbsentInventory(value));
});
test("expiry is rechecked after elapsed diagnostic time", () => {
  const f = attestationFixture(),
    value = validate(f);
  assert.throws(
    () =>
      attestation.validateRoleAttestationTime(
        value,
        f.authorization,
        Date.parse(value.expiresAt),
      ),
    { code: "ROLE_ATTESTATION_EXPIRED" },
  );
});
for (const claim of [
  { warningCount: 0 },
  { warningCount: 1 },
  { rows: [] },
  { error: "P2010", mysqlCode: "1295" },
  { sameSession: false },
  { queryId: "other" },
  { intermediateOperation: true },
  { verified: true, complete: true },
  undefined,
])
  test("data cannot enable unproven warnings: " + JSON.stringify(claim), () => {
    assert.throws(() => attestation.requireVerifiableRoleWarnings(claim), {
      code: "ROLE_WARNINGS_UNVERIFIED",
    });
  });

const source = await readFile(
  new URL(
    "../../backend/scripts/lib/heatwave-role-attestation.js",
    import.meta.url,
  ),
  "utf8",
);
async function readFixture(options = {}) {
  const f = attestationFixture({ mode: "oci-read-only" });
  if (options.mutate) options.mutate(f);
  const evidencePath =
    "/etc/traceflow/diagnostic-evidence/" +
    f.authorization.roleAttestation.evidenceId +
    ".json";
  const manifestPath = f.root + "/manifest.json";
  const bytes = options.bytes ?? Buffer.from(JSON.stringify(f.evidence));
  if (options.repin)
    f.authorization.roleAttestation.sha256 = createHash("sha256")
      .update(bytes)
      .digest("hex");
  const pathsRead = [],
    closed = [];
  let reads = 0;
  const stat = (p) => {
    const evidence = p === evidencePath,
      file = evidence || p === manifestPath;
    return {
      dev: 1,
      ino: file ? (evidence ? 20 : 30) : 10,
      uid: 0,
      gid: 500,
      nlink: file ? 1 : 2,
      size: file ? (evidence ? bytes.length : f.manifestBytes.length) : 0,
      mode: file ? (evidence ? 0o100640 : 0o100644) : 0o40750,
      mtimeMs: 1,
      ctimeMs: 1,
      isFile: () => file,
      isDirectory: () => !file,
      isSymbolicLink: () => false,
    };
  };
  const fs = {
    async realpath(p) {
      return options.symlink && p === evidencePath ? "/elsewhere" : p;
    },
    async lstat(p) {
      const st = stat(p);
      if (p === evidencePath) {
        if (options.owner) st.uid = 1000;
        if (options.mode) st.mode = options.mode;
        if (options.hardlink) st.nlink = 2;
        if (options.special) st.isFile = () => false;
        if (options.oversize) st.size = 16385;
        if (options.replaceAfterRead && reads) st.ino++;
      } else if (p === "/etc/traceflow/diagnostic-evidence") {
        if (options.parentOwner) st.uid = 1000;
        if (options.parentWritable) st.mode = 0o40770;
        if (options.parentSymlink) st.isSymbolicLink = () => true;
        if (options.parentChanged && reads) st.ino++;
      }
      return st;
    },
    async access() {
      if (!options.writable) throw Object.assign(Error(), { code: "EACCES" });
    },
    async open(p, flags) {
      assert.ok(flags & constants.O_NOFOLLOW);
      assert.ok(flags & constants.O_NONBLOCK);
      if (options.unreadable) throw Object.assign(Error(), { code: "EACCES" });
      pathsRead.push(p);
      return {
        async stat() {
          const st = stat(p);
          if (p === evidencePath && options.replaceAfterOpen) st.ino++;
          if (p === evidencePath && options.mutateDuringRead && reads)
            st.mtimeMs++;
          return st;
        },
        async read(buffer) {
          reads++;
          const data = p === evidencePath ? bytes : f.manifestBytes;
          data.copy(buffer);
          return { bytesRead: options.shortRead ? 1 : data.length };
        },
        async close() {
          closed.push(p);
        },
      };
    },
  };
  const context = createContext({
    Buffer,
    TextDecoder,
    Date,
    process: {
      getuid: () => (options.rootExecutor ? 0 : 1000),
      platform: options.platform ?? "linux",
    },
  });
  const imports = {
    "node:fs/promises": fs,
    "node:fs": { constants },
    "node:crypto": { createHash },
    "node:path": path,
    "./oci-compatibility-safety.js": { requireCondition },
  };
  const mod = new SourceTextModule(source, { context });
  await mod.link(async (specifier) => {
    const exports = imports[specifier];
    assert.ok(exports);
    const linked = new SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [name, value] of Object.entries(exports))
          this.setExport(name, value);
      },
      { context },
    );
    await linked.link(() => assert.fail("unexpected import"));
    await linked.evaluate();
    return linked;
  });
  await mod.evaluate();
  try {
    const result = await mod.namespace.loadRoleAttestation(
      f.authorization,
      options.root ?? f.root,
    );
    return { result, pathsRead, closed };
  } finally {
    assert.deepEqual(
      closed,
      pathsRead,
      "every opened descriptor closes on success and failure",
    );
  }
}
test("protected reader validates independent manifest and immutable custody", async () => {
  const result = await readFixture();
  assert.equal(result.result.observations.existence.accountCount, 0);
  assert.equal(result.pathsRead.length, 2);
});
for (const [name, options] of [
  [
    "hash mismatch",
    {
      mutate: (f) => {
        f.authorization.roleAttestation.sha256 = "0".repeat(64);
      },
    },
  ],
  [
    "manifest mismatch",
    {
      mutate: (f) => {
        f.authorization.roleAttestation.manifestSha256 = "0".repeat(64);
      },
    },
  ],
  ["executor owner", { owner: true }],
  ["executor write access", { writable: true }],
  ["symlink", { symlink: true }],
  ["writable parent", { parentWritable: true }],
  ["executor-owned parent", { parentOwner: true }],
  ["symlink parent", { parentSymlink: true }],
  ["hardlink", { hardlink: true }],
  ["special file", { special: true }],
  ["other readable", { mode: 0o100644 }],
  ["group writable", { mode: 0o100660 }],
  ["setuid", { mode: 0o104640 }],
  ["oversize", { oversize: true }],
  ["unreadable", { unreadable: true }],
  ["root executor", { rootExecutor: true }],
  ["unsupported OS custody", { platform: "darwin" }],
  ["arbitrary package root", { root: "/tmp/untrusted" }],
  ["replace before stat", { replaceAfterOpen: true }],
  ["replace after read", { replaceAfterRead: true }],
  ["mutate during read", { mutateDuringRead: true }],
  ["parent changed", { parentChanged: true }],
  ["short read", { shortRead: true }],
  ["invalid JSON matching hash", { bytes: Buffer.from("{"), repin: true }],
  ["invalid UTF8 matching hash", { bytes: Buffer.from([0xff]), repin: true }],
])
  test("custody refuses " + name, async () => {
    await assert.rejects(() => readFixture(options));
  });

test("canonical identifiers refuse trailing line terminators even with matching bindings", () => {
  for (const field of [
    "evidenceId",
    "executionId",
    "sha256",
    "packageId",
    "manifestSha256",
  ]) {
    const f = attestationFixture();
    f.authorization.roleAttestation[field] += "\n";
    if (field in f.evidence) f.evidence[field] += "\n";
    if (field in f.evidence.package) {
      f.evidence.package[field] += "\n";
      f.binding[field] += "\n";
    }
    assert.throws(() => validate(f));
  }
  for (const field of ["serverUuid", "version", "caSha256"]) {
    const f = attestationFixture();
    f.evidence.target[field] += "\n";
    f.authorization.target[field] += "\n";
    assert.throws(() => validate(f));
  }
  const f = attestationFixture();
  f.evidence.operatorId += "\n";
  assert.throws(() => validate(f));
  for (const control of [0, 9, 10, 13, 31])
    assert.throws(() =>
      attestation.parseRoleAttestationJson(
        '{"x":"' + String.fromCharCode(control) + '"}',
      ),
    );
});
