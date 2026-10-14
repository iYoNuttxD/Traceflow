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
if (process.env.TEST_DATABASE_URL) invalid.push("TEST_DATABASE_URL");
if (invalid.length) {
  console.error(
    JSON.stringify({ event: "service_contract_invalid", variables: invalid }),
  );
  process.exitCode = 1;
}
