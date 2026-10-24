// Operates only on the artifact supplied explicitly. Never imports runtime env.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const root = resolve(process.argv[2] || ".");
const require = createRequire(resolve(root, "backend/package.json"));
try {
  if (
    process.platform !== "linux" ||
    process.arch !== "arm64" ||
    process.versions.node.split(".")[0] !== "22"
  )
    throw new Error("NATIVE_TARGET");
  const { PrismaClient, Prisma } = require("@prisma/client");
  if (Prisma.prismaVersion.client !== "6.12.0")
    throw new Error("PRISMA_VERSION");
  const engine = resolve(
    root,
    "backend/node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node",
  );
  require(engine);
  const argon2 = require("argon2");
  const hash = await argon2.hash("artifact-native-probe");
  if (!(await argon2.verify(hash, "artifact-native-probe")))
    throw new Error("ARGON2");
  const client = new PrismaClient({
    datasourceUrl: "mysql://127.0.0.1:1/unused_artifact_probe",
  });
  await client.$disconnect();
  for (const file of ["server.js", "github-worker.js"]) {
    if (
      spawnSync(process.execPath, [
        "--check",
        resolve(root, "backend/src", file),
      ]).status !== 0
    )
      throw new Error("ENTRY_SYNTAX");
  }
  const html = await readFile(
    resolve(root, "frontend/dist/index.html"),
    "utf8",
  );
  if (!html.includes("/assets/")) throw new Error("FRONTEND_LAYOUT");
  console.log(
    JSON.stringify({
      artifactSmoke: "PASS",
      node: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      prisma: Prisma.prismaVersion.client,
      argon2: true,
      engine: "linux-arm64-openssl-3.0.x",
      databaseAccess: false,
    }),
  );
} catch {
  console.error(
    JSON.stringify({
      artifactSmoke: "FAIL",
      code: "ARTIFACT_RUNTIME_UNAVAILABLE",
    }),
  );
  process.exitCode = 1;
}
