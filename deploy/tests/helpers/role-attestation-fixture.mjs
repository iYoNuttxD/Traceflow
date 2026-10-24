import { createHash } from "node:crypto";

// In-memory fixtures only; never materialize as operational evidence.
export function attestationFixture({
  mode = "local-isolated",
  now = Date.now(),
} = {}) {
  const packageId = "traceflow-prisma-diagnostic-" + "a".repeat(16);
  const manifestBytes = Buffer.from(JSON.stringify({ packageId }));
  const manifestSha256 = createHash("sha256")
    .update(manifestBytes)
    .digest("hex");
  const target = {
    serverUuid: "11111111-1111-1111-1111-111111111111",
    version: "26.7.0-cloud",
    host:
      mode === "oci-read-only"
        ? "traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com"
        : "127.0.0.1",
    expectedAddress: mode === "oci-read-only" ? "10.20.2.25" : "127.0.0.1",
    port: mode === "oci-read-only" ? 3306 : 54321,
    caSha256: "a".repeat(64),
    schema: mode === "oci-read-only" ? "traceflow" : "tf_oci_abcdef012345_test",
    account: "traceflow_diag@10.20.1.184",
  };
  const evidence = {
    formatVersion: 1,
    kind: "mysql-role-existence-attestation",
    evidenceId: "11111111-1111-4111-8111-111111111111",
    collectedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 300000).toISOString(),
    executionId: "22222222-2222-4222-8222-222222222222",
    operatorId: "unit-test-operator",
    mode,
    source:
      mode === "oci-read-only" ? "administrative-read-only" : "synthetic-lab",
    target,
    role: { name: "public", host: "%" },
    observations: {
      mandatoryRoles: "public",
      activateAllRolesOnLogin: 0,
      existence: {
        queryId: "MYSQL_USER_PUBLIC_COUNT_V1",
        status: "SUCCESS",
        accountCount: 0,
      },
    },
    grantsAudit: {
      referenceId: "33333333-3333-4333-8333-333333333333",
      sha256: "c".repeat(64),
      status: "PASS",
      account: target.account,
      schema: target.schema,
      privileges: ["SELECT"],
      explicitRoleCount: 0,
    },
    package: { packageId, manifestSha256 },
  };
  const bytes = Buffer.from(JSON.stringify(evidence));
  const authorization = {
    formatVersion: 1,
    operation: "diagnose-read-only",
    mode,
    approved: true,
    role: "diagnostic",
    expiresAt: new Date(now + 3600000).toISOString(),
    target: {
      ...target,
      user: "traceflow_diag",
      datadir: "/synthetic-owned-data",
    },
    roleAttestation: {
      formatVersion: 1,
      evidenceId: evidence.evidenceId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      executionId: evidence.executionId,
      ...evidence.package,
    },
  };
  return {
    evidence,
    authorization,
    binding: { ...evidence.package },
    bytes,
    manifestBytes,
    root: "/opt/traceflow-diagnostics/" + packageId,
    now,
  };
}
