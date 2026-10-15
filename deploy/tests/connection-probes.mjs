// Synthetic lab only: real Prisma authentication, connection budget and bounded failure probes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const expected = JSON.parse(await readFile(process.env.TF06_IDENTITY, "utf8"));
assert.equal(expected.mode, "local-isolated");
assert.equal(process.env.DATABASE_URL, undefined);
const source = new URL(process.env.TEST_DATABASE_URL);
assert.equal(source.hostname, "127.0.0.1");
assert.ok(Number(source.port) >= 49152);
assert.match(source.pathname, /^\/tf_oci_[a-f0-9]{12}_test$/);
assert.equal(source.pathname.slice(1), expected.schema);
assert.equal(Number(source.port), expected.port);
assert.equal(source.searchParams.get("sslaccept"), "strict");
const client = (url = source) =>
  new PrismaClient({ datasourceUrl: url.toString(), log: [] });
const code = (error) => error.code || error.errorCode || "PRISMA_REJECTED";
async function failure(work, allowed) {
  const start = performance.now();
  try {
    await work();
  } catch (error) {
    const value = code(error);
    if (allowed)
      assert.ok(allowed.includes(value), "unexpected error code " + value);
    return {
      rejected: true,
      code: value,
      seconds: +((performance.now() - start) / 1000).toFixed(3),
    };
  }
  throw new Error("UNEXPECTED_SUCCESS");
}
async function connectFailure(url, allowed) {
  const db = client(url);
  try {
    return await failure(() => db.$connect(), allowed);
  } finally {
    await db.$disconnect();
  }
}
if (process.argv[2] === "connect-failure") {
  console.log(
    JSON.stringify(await connectFailure(source, ["P1011", "P1001", "P1000"])),
  );
} else {
  const db = client();
  const checks = [];
  try {
    const [id] =
      await db.$queryRaw`SELECT @@server_uuid AS uuid, @@datadir AS datadir, @@max_connections AS maximum, DATABASE() AS db`;
    assert.equal(id.uuid, expected.serverUuid);
    assert.equal(id.datadir.replace(/\/$/, ""), expected.datadir);
    assert.equal(id.db, expected.schema);
    assert.equal(Number(id.maximum), 32); // exact fresh laboratory server, never a managed target
    const invalid = new URL(source);
    invalid.password = randomBytes(32).toString("hex");
    checks.push({
      name: "invalid-authentication",
      ...(await connectFailure(invalid, ["P1000"])),
    });
    checks.push({
      name: "privileged-metadata-denied",
      ...(await failure(
        () => db.$queryRaw`SELECT 1 FROM mysql.user LIMIT 1`,
        ["P2010"],
      )),
    });
  } finally {
    await db.$disconnect();
  }
  const poolUrl = new URL(source);
  poolUrl.searchParams.set("connection_limit", "2");
  poolUrl.searchParams.set("pool_timeout", "1");
  const pool = client(poolUrl);
  let release,
    occupied = 0,
    ready;
  const barrier = new Promise((r) => {
    release = r;
  });
  const acquired = new Promise((r) => {
    ready = r;
  });
  const transactions = Array.from({ length: 2 }, () =>
    pool.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      if (++occupied === 2) ready();
      await barrier;
    }),
  );
  try {
    await acquired;
    const result = await failure(() => pool.$queryRaw`SELECT 1`, ["P2024"]);
    assert.ok(result.seconds >= 0.8 && result.seconds < 5);
    checks.push({
      name: "pool-exhaustion-bounded",
      ...result,
      connectionLimit: 2,
    });
  } finally {
    release();
    await Promise.allSettled(transactions);
    await pool.$disconnect();
  }
  const timeoutUrl = new URL(source);
  timeoutUrl.searchParams.set("socket_timeout", "1");
  const timed = client(timeoutUrl);
  try {
    const result = await failure(
      () => timed.$queryRaw`SELECT SLEEP(5)`,
      ["P2010", "P1008"],
    );
    assert.ok(result.seconds >= 0.8 && result.seconds < 5);
    checks.push({ name: "query-timeout-bounded", ...result });
  } finally {
    await timed.$disconnect();
  }
  const clients = [];
  let established = 0,
    refused;
  try {
    for (let i = 0; i < 33; i++) {
      const db = client();
      clients.push(db);
      try {
        await db.$connect();
        established++;
      } catch (error) {
        refused = code(error);
        break;
      }
    }
    assert.ok(
      established >= 30 && established <= 32 && refused,
      "server connection limit was not enforced",
    );
    checks.push({
      name: "server-connection-limit",
      established,
      maximum: 32,
      rejected: true,
      code: refused,
    });
  } finally {
    await Promise.all(clients.map((db) => db.$disconnect()));
  }
  const recovered = client();
  try {
    await recovered.$queryRaw`SELECT 1`;
    checks.push({ name: "connection-budget-released", recovered: true });
  } finally {
    await recovered.$disconnect();
  }
  console.log(JSON.stringify({ status: "PASS", checks }));
}
