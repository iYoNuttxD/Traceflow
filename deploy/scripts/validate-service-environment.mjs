// ExecStartPre: validate only fixed, non-secret supervisor contracts. No imports,
// .env reads, database access, migrations or external calls.
const role = process.argv[2];
const expected = {
  NODE_ENV: "production",
  HTTP_HOST: "127.0.0.1",
  PORT: "3001",
  TRUST_PROXY: "loopback",
  TEST_EVIDENCE_STORAGE_DIR: "/var/lib/traceflow/test-evidence",
  GITHUB_SCHEDULER_ENABLED: role === "api" ? "false" : "true",
};
const invalid = Object.keys(expected).filter(
  (key) => process.env[key] !== expected[key],
);
if (!["api", "worker"].includes(role)) invalid.push("SERVICE_ROLE");
if (process.versions.node.split(".")[0] !== "22") invalid.push("NODE_MAJOR");
const deadline = Number(process.env.SHUTDOWN_TIMEOUT_MS);
if (!Number.isInteger(deadline) || deadline < 1000 || deadline > 30000)
  invalid.push("SHUTDOWN_TIMEOUT_MS");
for (const name of [
  "TEST_DATABASE_URL",
  "TEST_RUNTIME_DATABASE_URL",
  "HEATWAVE_DIAGNOSTIC_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "RUNTIME_DATABASE_URL",
])
  if (process.env[name]) invalid.push(name);
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
  invalid.push("NODE_TLS_REJECT_UNAUTHORIZED");
// The systemd runtime must never inherit Prisma v6's permissive TLS default.
// CA is public and must be outside /etc/traceflow, which the units hide from runtime.
try {
  const url = new URL(process.env.DATABASE_URL);
  const allowed = new Set([
    "sslaccept",
    "sslcert",
    "connection_limit",
    "connect_timeout",
    "pool_timeout",
    "socket_timeout",
  ]);
  const pool = Number(url.searchParams.get("connection_limit"));
  if (
    url.protocol !== "mysql:" ||
    !url.username ||
    !url.password ||
    url.hash ||
    url.searchParams.get("sslaccept") !== "strict" ||
    url.searchParams.get("sslcert") !== "/etc/pki/traceflow/mysql-ca.pem" ||
    !Number.isInteger(pool) ||
    pool < 1 ||
    pool > (role === "api" ? 5 : 3) ||
    url.searchParams.get("connect_timeout") !== "5" ||
    url.searchParams.get("pool_timeout") !== "10" ||
    url.searchParams.get("socket_timeout") !== "30" ||
    [...url.searchParams.keys()].some(
      (key) => !allowed.has(key) || url.searchParams.getAll(key).length !== 1,
    )
  )
    invalid.push("DATABASE_URL");
} catch {
  invalid.push("DATABASE_URL");
}
if (invalid.length) {
  console.error(
    JSON.stringify({ event: "service_contract_invalid", variables: invalid }),
  );
  process.exitCode = 1;
}
