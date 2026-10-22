import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { request } from "node:https";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
assert.equal(hostname(), "lima-tf041");
const root = "/var/tmp/tf041-lab";
const cfg = JSON.parse(await readFile(root + "/lab-private.json"));
const fixture = JSON.parse(await readFile(root + "/e2e-private.json"));
assert.equal(cfg.schema, "traceflow_oci_041_267_test");
const database = new URL("mysql://127.0.0.1");
database.username = "tf041";
database.password = cfg.password;
database.port = String(cfg.port);
database.pathname = cfg.schema;
process.env.TEST_DATABASE_URL = database.toString();
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const [identity] =
  await prisma.$queryRaw`SELECT @@datadir AS dir, DATABASE() AS db`;
assert.equal(identity.dir, root + "/mysql-data/");
assert.equal(identity.db, cfg.schema);
let cookie, csrf;
const options = (path, method = "GET", headers = {}) => ({
  hostname: "127.0.0.1",
  port: 8443,
  servername: "traceflow.test",
  rejectUnauthorized: false,
  path: "/api" + path,
  method,
  headers: {
    Host: "traceflow.test:19441",
    Origin: "https://traceflow.test:19441",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    ...headers,
  },
});
async function api(path, method = "GET", body, extra = {}) {
  const data = Buffer.isBuffer(body)
    ? body
    : body === undefined
      ? undefined
      : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request(
      options(path, method, {
        "Content-Type": Buffer.isBuffer(body)
          ? "application/octet-stream"
          : "application/json",
        ...(data ? { "Content-Length": data.length } : {}),
        ...extra,
      }),
      (res) => {
        let bytes = [];
        res.on("data", (b) => bytes.push(b));
        res.on("end", () => {
          let value;
          try {
            value = JSON.parse(Buffer.concat(bytes));
          } catch {
            value = {};
          }
          resolve({
            status: res.statusCode,
            body: value,
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", () => reject(new Error("LAB_HTTP_FAILURE")));
    req.end(data);
  });
}
const hash = (b) => createHash("sha256").update(b).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  scenario: "SIGKILL during an unacknowledged part and durable lease recovery",
  status: "RUNNING",
};
try {
  const login = await api("/auth/login", "POST", {
    identifier: fixture.identifier,
    password: fixture.password,
  });
  assert.equal(login.status, 200);
  cookie = login.headers["set-cookie"][0].split(";")[0];
  csrf = login.body.csrfToken;
  const id = fixture.cases.Cancelamento.id;
  const base = `/test-cases/${id}/execution-uploads`;
  const bytes = Buffer.alloc(8388608, "a");
  const init = await api(base, "POST", {
    idempotencyKey: randomUUID(),
    testCaseVersion: 1,
    files: [
      {
        name: "crash.log",
        field: "evidence",
        sizeBytes: bytes.length,
        sha256: hash(bytes),
      },
    ],
  });
  assert.equal(init.status, 201);
  const upload = init.body;
  const endpoint = `${base}/${upload.uploadId}/files/${upload.files[0].id}/parts/0`;
  const slow = request(
    options(endpoint, "PUT", {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.length,
      "X-Chunk-SHA256": hash(bytes),
      "X-Chunk-Offset": "0",
    }),
  );
  slow.on("error", () => {});
  slow.on("response", (r) => r.resume());
  slow.write(bytes.subarray(0, 16384));
  let leased;
  for (let i = 0; i < 100; i++) {
    leased = await prisma.evidenceUpload.findUnique({
      where: { id: upload.uploadId },
    });
    if (leased.leaseToken) break;
    await sleep(100);
  }
  assert.ok(leased.leaseToken);
  assert.equal(leased.filesJson[0].parts[0], undefined);
  const pid = Number(
    execFileSync("systemctl", [
      "show",
      "-p",
      "MainPID",
      "--value",
      "traceflow-api",
    ]).toString(),
  );
  assert.ok(pid > 1);
  const cmd = await readFile(`/proc/${pid}/cmdline`, "utf8");
  assert.ok(cmd.includes("/backend/src/server.js"));
  execFileSync("systemctl", [
    "kill",
    "--kill-whom=main",
    "--signal=SIGKILL",
    "traceflow-api",
  ]);
  slow.destroy();
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await api("/auth/me");
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(250);
  }
  assert.ok(ready);
  const prior = await api(`${base}/${upload.uploadId}`);
  assert.equal(prior.status, 200);
  assert.equal(prior.body.confirmedBytes, 0);
  const busy = await api(endpoint, "PUT", bytes, {
    "X-Chunk-SHA256": hash(bytes),
    "X-Chunk-Offset": "0",
  });
  assert.equal(busy.status, 429);
  const waitStart = Date.now();
  console.log(
    "Owned crash verified; waiting for the real 90-second lease deadline",
  );
  while (true) {
    const [{ now }] = await prisma.$queryRaw`SELECT UTC_TIMESTAMP(3) AS now`;
    if (now > leased.leaseUntil) break;
    await sleep(1000);
  }
  report.waitedMs = Date.now() - waitStart;
  const part = await api(endpoint, "PUT", bytes, {
    "X-Chunk-SHA256": hash(bytes),
    "X-Chunk-Offset": "0",
  });
  assert.equal(part.status, 200);
  assert.equal(part.body.confirmedBytes, bytes.length);
  const payload = {
    testCaseVersion: 1,
    environment: "HOMOLOGACAO",
    testedReference: { type: "PULL_REQUEST", id: fixture.prId },
    steps: [{ position: 1, result: "PASS" }],
  };
  const done = await api(
    `${base}/${upload.uploadId}/complete`,
    "POST",
    payload,
  );
  assert.equal(done.status, 200);
  const repeat = await api(
    `${base}/${upload.uploadId}/complete`,
    "POST",
    payload,
  );
  assert.equal(repeat.body.execution.id, done.body.execution.id);
  assert.equal(
    await prisma.testExecution.count({ where: { testCaseId: id } }),
    1,
  );
  const stored = await prisma.evidenceUpload.findUnique({
    where: { id: upload.uploadId },
  });
  assert.equal(stored.status, "COMPLETED");
  assert.ok(stored.cleanedAt);
  report.confirmedBytes = part.body.confirmedBytes;
  report.executionId = done.body.execution.id;
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.error = {
    name: error.name,
    code: error.code,
    message: String(error.message)
      .split("\n")
      .filter((x) => !/(password|cookie|token|mysql:\/\/)/i.test(x))
      .slice(0, 3)
      .join(" "),
  };
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await writeFile(root + "/crash-result.json", JSON.stringify(report));
  console.log("Crash laboratory", report.status);
}
