// Disposable VM probe run with the unmodified worker sandbox and synthetic env.
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import argon2 from "../../backend/node_modules/argon2/argon2.cjs";
if (process.env.TF04_DISPOSABLE !== "local-oracle-linux-fixture")
  throw new Error("TEST_ONLY");
const checks = {
  nonRoot: process.getuid() !== 0,
  denied: [],
  temporaryWrite: false,
  argon2: false,
};
for (const path of [
  "/opt/traceflow/current/deny-worker",
  "/etc/traceflow/deny-worker",
  "/var/lib/traceflow/test-evidence/deny-worker",
  "/etc/nginx/ssl/traceflow-origin.key",
]) {
  try {
    if (path.endsWith(".key")) await readFile(path);
    else await writeFile(path, "test", { flag: "wx" });
  } catch {
    checks.denied.push(path);
  }
}
const directory = await mkdtemp(join(tmpdir(), "tf04-worker-"));
try {
  await writeFile(join(directory, "owned.txt"), "temporary");
  checks.temporaryWrite = true;
} finally {
  await rm(directory, { recursive: true });
}
const value = randomBytes(24).toString("hex");
checks.argon2 = await argon2.verify(await argon2.hash(value), value);
console.log(JSON.stringify({ event: "tf04_worker_sandbox", ...checks }));
if (
  !checks.nonRoot ||
  checks.denied.length !== 4 ||
  !checks.temporaryWrite ||
  !checks.argon2
)
  process.exit(1);
// Explicit negative lifecycle control: only the disposable probe ignores SIGTERM.
if (process.env.TF04_TEST_STOP_DEADLINE === "true") {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
}
