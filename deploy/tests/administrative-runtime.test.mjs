import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ADMIN_RUNTIME_PROFILE,
  ADMIN_RUNTIME_BINARIES,
  validateAdministrativeRuntime,
  inspectAdministrativeRuntime,
  requireValidatedAdministrativeRuntime,
} from "../../backend/scripts/lib/heatwave-administrative-runtime.js";
import { runtimeFixture } from "./helpers/administrative-runtime-fixture.mjs";

test("only the measured W02-D profile is accepted; no operational evidence is manufactured", () => {
  assert.equal(
    validateAdministrativeRuntime(runtimeFixture()),
    ADMIN_RUNTIME_PROFILE,
  );
});
for (const [field, value] of [
  ["platform", "darwin"],
  ["arch", "x64"],
  ["node", "22.23.3"],
  ["openssl", "1.1.1"],
  ["execPath", "/tmp/node"],
  ["release", "Oracle Linux Server release 9.9"],
  ["selinux", "0"],
  ["context", "system_u:system_r:confined_t:s0"],
  ["binaries", {}],
  ["approved", true],
])
  test("runtime rejects divergent or extraneous " + field, () => {
    assert.throws(
      () =>
        validateAdministrativeRuntime({ ...runtimeFixture(), [field]: value }),
      { code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED" },
    );
  });
for (const path of Object.keys(ADMIN_RUNTIME_BINARIES)) {
  test("changed binary rejected: " + path, () => {
    const f = runtimeFixture();
    f.binaries[path] = "0".repeat(64);
    assert.throws(() => validateAdministrativeRuntime(f), {
      code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
    });
  });
  test("missing binary rejected: " + path, () => {
    const f = runtimeFixture();
    delete f.binaries[path];
    assert.throws(() => validateAdministrativeRuntime(f), {
      code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
    });
  });
}
for (const field of Object.keys(runtimeFixture()))
  test("missing runtime fact rejected: " + field, () => {
    const f = runtimeFixture();
    delete f[field];
    assert.throws(() => validateAdministrativeRuntime(f), {
      code: "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
    });
  });
function inspection() {
  const facts = runtimeFixture(),
    events = [],
    files = [];
  const host = {
    ...facts,
    versions: { node: facts.node, openssl: facts.openssl },
  };
  const custody = {
    async program(path) {
      events.push(["program", path]);
      return path;
    },
    async openProtected(path, options) {
      events.push(["open", path, options]);
      const file = {
        bytes: Buffer.from(
          path.endsWith("oracle-release")
            ? facts.release + "\n"
            : "synthetic binary",
        ),
        async recheck() {
          events.push(["recheck", path]);
        },
        async close() {
          events.push(["close", path]);
        },
      };
      files.push(file);
      return file;
    },
  };
  const kernel = async (path) => {
    events.push(["kernel", path]);
    return path.endsWith("enforce") ? "1\n" : facts.context + "\0";
  };
  return { facts, host, custody, kernel, events, files };
}
test("inspection reads only fixed trusted binaries and kernel identity, rechecks and closes them", async () => {
  const f = inspection();
  const observed = await inspectAdministrativeRuntime(
    f.host,
    f.custody,
    f.kernel,
  );
  const hash = createHash("sha256").update("synthetic binary").digest("hex");
  assert.deepEqual(observed, {
    ...f.facts,
    binaries: Object.fromEntries(
      Object.keys(ADMIN_RUNTIME_BINARIES).map((p) => [p, hash]),
    ),
  });
  assert.equal(f.events.filter((e) => e[0] === "recheck").length, 4);
  assert.equal(f.events.filter((e) => e[0] === "close").length, 4);
  assert.deepEqual(
    f.events.filter((e) => e[0] === "kernel").map((e) => e[1]),
    ["/sys/fs/selinux/enforce", "/proc/self/attr/current"],
  );
  assert.ok(
    f.events
      .filter((e) => e[0] === "open")
      .every((e) => e[2].maxBytes <= 128 * 1024 * 1024),
  );
  assert.throws(() => validateAdministrativeRuntime(observed)); // synthetic bytes cannot authorize production
});
test("unsupported host rejected before reading any files", async () => {
  const f = inspection();
  f.host.arch = "x64";
  await assert.rejects(
    inspectAdministrativeRuntime(f.host, f.custody, f.kernel),
  );
  assert.deepEqual(f.events, []);
});
for (const fault of ["program", "open", "recheck", "close", "kernel"]) {
  test(
    "runtime inspection refuses " + fault + " failure and closes pinned handle",
    async () => {
      const f = inspection();
      const fail = () => {
        throw new Error("synthetic system error");
      };
      if (fault === "program") f.custody.program = fail;
      if (fault === "open") f.custody.openProtected = fail;
      if (["recheck", "close"].includes(fault)) {
        const open = f.custody.openProtected;
        f.custody.openProtected = async (...args) => {
          const file = await open(...args);
          file[fault] = fail;
          return file;
        };
      }
      if (fault === "kernel") f.kernel = fail;
      await assert.rejects(
        inspectAdministrativeRuntime(f.host, f.custody, f.kernel),
      );
      if (fault === "recheck")
        assert.equal(f.events.filter((e) => e[0] === "close").length, 1);
    },
  );
}
test("operational gate has no arguments or environment bypass", async () => {
  assert.equal(requireValidatedAdministrativeRuntime.length, 0);
  const source = await readFile(
    new URL(
      "../../backend/scripts/lib/heatwave-administrative-runtime.js",
      import.meta.url,
    ),
    "utf8",
  );
  assert.ok(
    !source.includes("process.env") && !source.includes("child_process"),
  );
});
