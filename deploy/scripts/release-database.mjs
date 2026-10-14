// Administrative/read-only bridge. JSON-lines protocol; never loads .env or prints SQL/errors.
import { createRequire } from "node:module";
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const [releaseArg, adminArg, authorizationArg, mode] = process.argv.slice(2);
let client, runningChild;
const error = (code) => {
  throw Object.assign(new Error(code), { code });
};
const check = (ok, code) => {
  if (!ok) error(code);
};
const hash = (value) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v)),
    )
    .digest("hex");
const emit = (obj) =>
  process.stdout.write(
    JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? String(v) : v)) +
      "\n",
  );
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const stopChild = () => {
  if (runningChild) runningChild.kill("SIGTERM");
};
process.on("SIGTERM", () => {
  stopChild();
  process.exit(143);
});
process.on("SIGINT", () => {
  stopChild();
  process.exit(130);
});

try {
  const release = resolve(releaseArg),
    admin = resolve(adminArg),
    authPath = resolve(authorizationArg);
  const st = lstatSync(authPath);
  check(
    st.isFile() &&
      !st.isSymbolicLink() &&
      !(st.mode & 0o077) &&
      st.uid === process.getuid() &&
      realpathSync(authPath) === authPath,
    "AUTH_FILE",
  );
  const auth = read(authPath),
    manifest = read(resolve(release, "manifest.json"));
  check(
    auth.formatVersion === 1 &&
      auth.releaseId === manifest.releaseId &&
      Date.parse(auth.expiresAt) > Date.now() &&
      Date.parse(auth.expiresAt) < Date.now() + 86400000,
    "AUTH_EXPIRED_OR_MISMATCH",
  );
  check(["migrate", "read"].includes(mode), "BRIDGE_MODE");
  const disposable = auth.environment === "disposable";
  check(
    disposable || ["staging", "production"].includes(auth.environment),
    "ENVIRONMENT",
  );
  check(
    disposable || manifest.sourceState === "committed",
    "CANDIDATE_NOT_DEPLOYABLE",
  );
  check(!process.env.DATABASE_URL, "AMBIGUOUS_DATABASE_URL");
  const value =
    process.env[
      disposable
        ? mode === "migrate"
          ? "TEST_DATABASE_URL"
          : "TEST_RUNTIME_DATABASE_URL"
        : mode === "migrate"
          ? "MIGRATION_DATABASE_URL"
          : "RUNTIME_DATABASE_URL"
    ];
  check(
    value,
    disposable ? "TEST_DATABASE_URL_REQUIRED" : "EXPLICIT_CREDENTIAL_REQUIRED",
  );
  const url = new URL(value),
    target = auth.target;
  check(
    url.protocol === "mysql:" &&
      !url.hash &&
      target &&
      url.hostname === target.host &&
      Number(url.port || 3306) === target.port &&
      decodeURIComponent(url.pathname.slice(1)) === target.schema &&
      decodeURIComponent(url.username) ===
        (mode === "migrate" ? target.migrationUser : target.runtimeUser) &&
      target.runtimeUser !== target.migrationUser &&
      !["root", "admin", "mysql.sys", "mysql.session"].includes(
        decodeURIComponent(url.username),
      ) &&
      /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(target.schema),
    "TARGET_MISMATCH",
  );
  if (disposable) {
    check(
      url.hostname === "127.0.0.1" &&
        target.port >= 49152 &&
        target.port <= 65535 &&
        !url.search &&
        /^tf_oci_[a-f0-9]{12}_test$/.test(target.schema) &&
        target.ownerHash &&
        target.datadir,
      "DISPOSABLE_TARGET",
    );
    check(process.env.TF_RELEASE_LAB_TOKEN, "LAB_CONTEXT");
  } else {
    check(
      url.hostname !== "localhost" &&
        url.hostname !== "127.0.0.1" &&
        !/(?:^|_)(?:dev|development|test)(?:_|$)/i.test(target.schema),
      "PROTECTED_DATABASE_TARGET",
    );
    if (auth.environment === "production")
      check(url.hostname === "10.20.2.25", "PRODUCTION_TARGET_NOT_ALLOWLISTED");
    check(
      auth.gates?.heatwaveTlsHomologated === true &&
        auth.gates?.restoreRehearsed === true &&
        auth.gates?.deploymentAuthorized === true,
      "PRODUCTION_GATES",
    );
    check(
      url.searchParams.get("sslaccept") === "strict" &&
        url.searchParams.get("sslcert")?.startsWith("/"),
      "TLS_STRICT_REQUIRED",
    );
    check(
      [...url.searchParams.keys()].every((x) =>
        [
          "sslaccept",
          "sslcert",
          "connection_limit",
          "connect_timeout",
          "pool_timeout",
        ].includes(x),
      ),
      "UNREVIEWED_CONNECTION_OPTION",
    );
  }
  const require = createRequire(resolve(release, "backend/package.json"));
  const { PrismaClient, Prisma } = require("@prisma/client");
  check(
    Prisma.prismaVersion.client === "6.12.0" &&
      read(resolve(admin, "node_modules/prisma/package.json")).version ===
        "6.12.0",
    "PRISMA_VERSION",
  );
  client = new PrismaClient({ datasourceUrl: value });
  await client.$transaction(
    async (tx) => {
      const [identity] = await tx.$queryRawUnsafe(
        "SELECT DATABASE() AS db, @@server_uuid AS uuid, @@port AS port, @@datadir AS datadir, VERSION() AS version, @@global.time_zone AS globalTimeZone, CONNECTION_ID() AS connectionId",
      );
      check(
        identity.db === target.schema &&
          identity.uuid === target.serverUuid &&
          Number(identity.port) === target.port &&
          identity.version === target.version,
        "SERVER_IDENTITY",
      );
      if (disposable) {
        check(
          identity.datadir.replace(/\/$/, "") ===
            target.datadir.replace(/\/$/, ""),
          "SERVER_DATADIR",
        );
        const ownerSchema = target.schema.replace(/_test$/, "_owner");
        const [owner] = await tx.$queryRawUnsafe(
          "SELECT SHA2(token,256) AS hash FROM \x60" +
            ownerSchema +
            "\x60.RunOwner WHERE id=1",
        );
        check(owner.hash === target.ownerHash, "SERVER_OWNERSHIP");
      } else {
        const tls = await tx.$queryRawUnsafe(
          "SHOW SESSION STATUS LIKE 'Ssl_cipher'",
        );
        check(tls[0]?.Value, "TLS_SESSION_REQUIRED");
      }
      if (mode === "migrate")
        check(identity.globalTimeZone === "+00:00", "MIGRATION_UTC_REQUIRED");
      const grants = await tx.$queryRawUnsafe("SHOW GRANTS FOR CURRENT_USER");
      const allowedScopes = new Set(["`" + target.schema + "`.*"]);
      if (disposable)
        allowedScopes.add(
          "`" + target.schema.replace(/_test$/, "_owner") + "`.*",
        );
      check(
        grants.every((g) => {
          const text = Object.values(g).join(" ");
          if (/^GRANT USAGE ON \*\.\* TO /.test(text)) return true;
          const match = /^GRANT ([A-Z ,]+) ON (.+?) TO /.exec(text);
          return (
            match &&
            allowedScopes.has(match[2]) &&
            !/GRANT OPTION|SUPER|FILE|CREATE USER|SYSTEM_USER/.test(text)
          );
        }),
        "EXCESSIVE_DATABASE_PRIVILEGES",
      );
      if (mode === "read") {
        check(
          grants.every(
            (g) =>
              !/\b(?:ALL PRIVILEGES|CREATE|ALTER|DROP|INDEX|TRIGGER|GRANT OPTION|FILE|SUPER)\b/i.test(
                Object.values(g).join(" "),
              ),
          ),
          "RUNTIME_DDL_PRIVILEGE",
        );
      }
      if (mode === "migrate") {
        const scope = "`" + target.schema + "`.*";
        const own = grants
          .map((g) => Object.values(g).join(" "))
          .filter((text) => text.includes(" ON " + scope + " TO "));
        const privileges = own.flatMap((text) =>
          text
            .slice(6, text.indexOf(" ON "))
            .split(",")
            .map((x) => x.trim()),
        );
        check(
          privileges.includes("ALL PRIVILEGES") ||
            [
              "SELECT",
              "INSERT",
              "UPDATE",
              "DELETE",
              "CREATE",
              "ALTER",
              "DROP",
              "INDEX",
              "REFERENCES",
            ].every((x) => privileges.includes(x)),
          "MIGRATION_DDL_PRIVILEGE",
        );
      }
      const lockName =
        "traceflow-release:" +
        createHash("sha256").update(target.schema).digest("hex").slice(0, 40);
      const [locked] = await tx.$queryRawUnsafe(
        "SELECT CAST(GET_LOCK(?,0) AS SIGNED) AS acquired",
        lockName,
      );
      check(Number(locked.acquired) === 1, "DATABASE_OPERATION_LOCKED");
      async function fence() {
        const [row] = await tx.$queryRawUnsafe(
          "SELECT CAST(IS_USED_LOCK(?) AS UNSIGNED) AS owner",
          lockName,
        );
        check(
          String(row.owner) === String(identity.connectionId),
          "DATABASE_LOCK_LOST",
        );
      }
      async function snapshot() {
        const tables = await tx.$queryRawUnsafe(
          "SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_prisma_migrations' ORDER BY TABLE_NAME",
        );
        const columns = await tx.$queryRawUnsafe(
          "SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_prisma_migrations' ORDER BY TABLE_NAME,ORDINAL_POSITION",
        );
        const indexes = await tx.$queryRawUnsafe(
          "SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,INDEX_TYPE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME<>'_prisma_migrations' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX",
        );
        const foreignKeys = await tx.$queryRawUnsafe(
          "SELECT TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,UPDATE_RULE,DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME",
        );
        const checks = await tx.$queryRawUnsafe(
          "SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() ORDER BY CONSTRAINT_NAME",
        );
        const exists = await tx.$queryRawUnsafe(
          "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='_prisma_migrations'",
        );
        let applied = [];
        if (exists.length) {
          const rows = await tx.$queryRawUnsafe(
            "SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY BINARY migration_name",
          );
          check(
            rows.every((r) => r.finished_at && !r.rolled_back_at),
            "FAILED_MIGRATION_HISTORY",
          );
          applied = rows.map((r) => ({
            name: r.migration_name,
            sha256: r.checksum,
          }));
        }
        check(
          applied.length <= manifest.schema.migrations.length &&
            applied.every(
              (r, i) =>
                r.name === manifest.schema.migrations[i].name &&
                r.sha256 === manifest.schema.migrations[i].sha256,
            ),
          "MIGRATION_HISTORY_DIVERGENT",
        );
        return {
          fingerprint: hash({ tables, columns, indexes, foreignKeys, checks }),
          applied,
          tableCount: tables.length,
        };
      }
      const childEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: "C.UTF-8",
        TZ: "UTC",
        NODE_ENV: "production",
        DATABASE_URL: value,
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      };
      async function cli(args) {
        await fence();
        return await new Promise((done, reject) => {
          runningChild = spawn(
            process.execPath,
            [resolve(admin, "node_modules/prisma/build/index.js"), ...args],
            { cwd: admin, env: childEnv, stdio: ["ignore", "pipe", "pipe"] },
          );
          let timer,
            checking = false,
            lost = false;
          const child = runningChild;
          // Discard raw CLI output: SQL failures can contain data. Emit bounded codes only.
          child.stdout.resume();
          child.stderr.resume();
          const heartbeat = setInterval(async () => {
            if (checking) return;
            checking = true;
            try {
              await fence();
            } catch {
              lost = true;
              child.kill("SIGTERM");
            } finally {
              checking = false;
            }
          }, 500);
          const timeout = setTimeout(() => {
            lost = true;
            child.kill("SIGTERM");
            timer = setTimeout(() => child.kill("SIGKILL"), 5000);
          }, 300000);
          child.once("error", reject);
          child.once("close", (code) => {
            clearInterval(heartbeat);
            clearTimeout(timeout);
            clearTimeout(timer);
            runningChild = null;
            lost
              ? reject(
                  Object.assign(new Error("CLI_INTERRUPTED"), {
                    code: "CLI_INTERRUPTED",
                  }),
                )
              : done(code);
          });
        });
      }
      async function compatible() {
        const current = await snapshot();
        if (mode === "read")
          check(
            auth.expectedSchemaFingerprint === current.fingerprint,
            "SCHEMA_FINGERPRINT",
          );
        check(
          current.applied.length === manifest.schema.migrations.length,
          "SCHEMA_NOT_EXACT",
        );
        check(
          (await cli([
            "migrate",
            "diff",
            "--from-schema-datasource",
            resolve(admin, "prisma/schema.prisma"),
            "--to-schema-datamodel",
            resolve(admin, "prisma/schema.prisma"),
            "--exit-code",
          ])) === 0,
          "LIVE_SCHEMA_DRIFT",
        );
        return current;
      }
      async function prepareMigration() {
        check(
          mode === "migrate" &&
            auth.operation === "migrate" &&
            auth.gates?.writersControlled === true &&
            auth.gates?.backupVerified === true &&
            auth.gates?.restoreRehearsed === true &&
            typeof auth.backupReference === "string" &&
            auth.backupReference.length >= 8,
          "MIGRATION_AUTHORIZATION",
        );
        const before = await snapshot();
        check(
          auth.beforeFingerprint === before.fingerprint,
          "SCHEMA_BEFORE_MISMATCH",
        );
        check(
          before.applied.length || before.tableCount === 0,
          "UNBASELINED_SCHEMA",
        );
        return before;
      }
      emit({ ready: true, targetVerified: true, lock: true });
      const lines = createInterface({
        input: process.stdin,
        crlfDelay: Infinity,
      });
      try {
        for await (const line of lines) {
          const request = JSON.parse(line);
          try {
            await fence();
            let result;
            if (request.action === "check") result = { lock: true };
            else if (request.action === "snapshot") result = await snapshot();
            else if (request.action === "prepare-migration")
              result = await prepareMigration();
            else if (request.action === "compatible")
              result = await compatible();
            else if (request.action === "heartbeat") {
              const rows = await tx.$queryRawUnsafe(
                "SELECT id,heartbeatAt FROM GitHubSchedulerWorker WHERE heartbeatAt >= ? ORDER BY heartbeatAt",
                new Date(request.since),
              );
              result = {
                count: rows.length,
                fresh:
                  rows.length === 1 &&
                  rows[0].heartbeatAt.getTime() >= request.startedAt,
              };
            } else if (request.action === "migrate") {
              const before = await prepareMigration();
              const code = await cli([
                "migrate",
                "deploy",
                "--schema",
                resolve(admin, "prisma/schema.prisma"),
              ]);
              check(code === 0, "MIGRATION_FAILED");
              const after = await compatible();
              result = {
                applied: after.applied
                  .slice(before.applied.length)
                  .map((x) => x.name),
                fingerprint: after.fingerprint,
                migrationCount: after.applied.length,
              };
            } else if (request.action === "close") {
              emit({ ok: true });
              break;
            } else error("UNKNOWN_BRIDGE_ACTION");
            emit({ ok: true, result });
          } catch (failure) {
            emit({
              ok: false,
              code: /^[A-Z][A-Z0-9_]{2,70}$/.test(failure.code || "")
                ? failure.code
                : "DATABASE_OPERATION_FAILED",
            });
            break; // A failure is terminal. No continuation or cleanup SQL.
          }
        }
      } finally {
        stopChild();
        await tx
          .$queryRawUnsafe(
            "SELECT CAST(RELEASE_LOCK(?) AS SIGNED) AS released",
            lockName,
          )
          .catch(() => {});
      }
    },
    { maxWait: 5000, timeout: 900000, isolationLevel: "ReadCommitted" },
  );
} catch (failure) {
  emit({
    ok: false,
    code: /^[A-Z][A-Z0-9_]{2,70}$/.test(failure.code || "")
      ? failure.code
      : "DATABASE_GUARD_FAILED",
  });
  process.exitCode = 1;
} finally {
  stopChild();
  await client?.$disconnect();
}
