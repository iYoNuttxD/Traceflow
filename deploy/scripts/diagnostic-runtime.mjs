import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const engineName = "libquery_engine-linux-arm64-openssl-3.0.x.so.node";

function check(ok, code) {
  if (!ok) throw Object.assign(new Error(), { code });
}

export function validateRuntime() {
  check(
    process.platform === "linux" && process.arch === "arm64",
    "LINUX_ARM64_REQUIRED",
  );
  check(process.versions.node.split(".")[0] === "22", "NODE22_REQUIRED");
  check(process.versions.openssl.startsWith("3."), "OPENSSL3_REQUIRED");
  check(
    readFileSync("/etc/oracle-release", "utf8").includes(
      "Oracle Linux Server release 9.8",
    ),
    "ORACLE98_REQUIRED",
  );
  const nativePath = resolve(
    root,
    "backend/node_modules/.prisma/client",
    engineName,
  );
  const header = readFileSync(nativePath).subarray(0, 20);
  check(
    header.subarray(0, 5).equals(Buffer.from([127, 69, 76, 70, 2])) &&
      header[5] === 1 &&
      header.readUInt16LE(18) === 183,
    "ENGINE_ARCHITECTURE",
  );
  const require = createRequire(resolve(root, "backend/package.json"));
  const client = require("@prisma/client");
  check(client.Prisma.prismaVersion.client === "6.12.0", "PRISMA_VERSION");
  const native = require(nativePath);
  check(typeof native.QueryEngine === "function", "ENGINE_EXPORT");
  check(
    process.report
      .getReport()
      .sharedObjects.some((name) => name === nativePath),
    "ENGINE_NOT_LOADED",
  );
  return {
    status: "RUNTIME_VALID",
    node: process.versions.node,
    prisma: client.Prisma.prismaVersion.client,
    platform: process.platform,
    architecture: process.arch,
    engine: "linux-arm64-openssl-3.0.x",
    nativeLoaded: true,
    connected: false,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(validateRuntime()));
  } catch (error) {
    console.log(
      JSON.stringify({
        status: "FAIL",
        code: /^[A-Z0-9_]+$/.test(error.code || "")
          ? error.code
          : "RUNTIME_INVALID",
        connected: false,
      }),
    );
    process.exitCode = 1;
  }
}
