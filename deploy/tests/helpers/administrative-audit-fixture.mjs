import { randomUUID } from "node:crypto";
import {
  ADMIN_PLAN,
  aclColumns,
  globalPrivileges,
  schemaPrivileges,
  GRANTS,
  digest,
} from "../../../backend/scripts/lib/heatwave-admin-audit.js";
import {
  stages,
  administrativePayload,
  envelope,
  PRISMA_CHECKS,
} from "../../../backend/scripts/lib/heatwave-audit-evidence.js";

// Pure in-memory fixtures. Never an operational authorization or collected proof.
export function auditFixture(now = Date.now()) {
  const iso = (delta) => new Date(now + delta).toISOString();
  const target = {
    serverUuid: "6e94bb7f-c601-11f1-9b91-02001704771f",
    version: "26.7.0-cloud",
    host: "traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com",
    expectedAddress: "10.20.2.25",
    port: 3306,
    caSha256: "a".repeat(64),
    schema: "traceflow",
    account: "traceflow_diag@10.20.1.184",
    user: "traceflow_diag",
  };
  const binding = {
    packageId: "traceflow-prisma-diagnostic-" + "b".repeat(16),
    manifestSha256: "c".repeat(64),
  };
  const authorization = {
    formatVersion: 1,
    operation: "diagnose-read-only",
    mode: "oci-read-only",
    approved: true,
    role: "diagnostic",
    expiresAt: iso(300000),
    target,
    administrativeAudit: {
      formatVersion: 2,
      authorizationId: randomUUID(),
      runId: randomUUID(),
      package: binding,
      evidenceIds: Object.fromEntries(stages.map((s) => [s, randomUUID()])),
      initialSha256: null,
      window: {
        operatorId: "synthetic-operator",
        openedAt: iso(-60000),
        expiresAt: iso(300000),
        policy: "operator-controlled-v1",
        riskAcceptanceId: randomUUID(),
        acceptedAt: iso(-61000),
        noPrivilegeChangesAuthorized: true,
        noKnownAutomation: true,
        accountLifecycle: "diagnostic-unlock-lock-only",
      },
    },
  };
  const identity = (id) => [
    target.serverUuid,
    target.version,
    3306,
    "traceflow_admin@%",
    Number(id),
    "public",
    0,
    1,
    1,
    1,
  ];
  const rows = {
    IDENTITY_START: [identity("101")],
    IDENTITY_END: [identity("101")],
    SESSION_TLS: [
      ["Ssl_cipher", "TLS_AES_256_GCM_SHA384"],
      ["Ssl_version", "TLSv1.3"],
    ],
    MODEL: Object.entries(aclColumns).flatMap(([table, columns]) =>
      columns.map((col) => [table, col]),
    ),
    PUBLIC: [],
    USER: [
      [
        "10.20.1.184",
        "traceflow_diag",
        ...globalPrivileges.map(() => "N"),
        "ANY",
        "Y",
        null,
      ],
    ],
    DYNAMIC: [],
    SCHEMA: [
      [
        "10.20.1.184",
        "traceflow",
        "traceflow_diag",
        ...schemaPrivileges.map((col) => (col === "Select_priv" ? "Y" : "N")),
      ],
    ],
    TABLE: [],
    COLUMN: [],
    ROUTINE: [],
    EDGES: [],
    DEFAULTS: [],
    PROXY: [],
    GRANTS: GRANTS.map((line) => [line]),
  };
  const observations = ADMIN_PLAN.map(({ id }) => ({
    queryId: id,
    status: "SUCCESS",
    connectionId: "101",
    warningCount: 0,
    rowCount: rows[id].length,
    rows: rows[id],
  }));
  const initial = envelope(
    authorization,
    "ADMIN_INITIAL",
    administrativePayload(observations, authorization),
    null,
    iso(-50000),
    iso(-49000),
  );
  authorization.administrativeAudit.initialSha256 = digest(initial);
  const prisma = envelope(
    authorization,
    "PRISMA",
    {
      prisma: "6.12.0",
      connectionId: "201",
      disconnected: true,
      checks: Object.fromEntries(PRISMA_CHECKS.map((k) => [k, true])),
      stateSha256: initial.payload.stateSha256,
    },
    initial,
    iso(-48000),
    iso(-47000),
  );
  const finalObservations = structuredClone(observations);
  finalObservations.forEach((o) => {
    o.connectionId = "102";
  });
  for (const id of ["IDENTITY_START", "IDENTITY_END"])
    finalObservations.find((o) => o.queryId === id).rows = [identity("102")];
  const final = envelope(
    authorization,
    "ADMIN_FINAL",
    administrativePayload(finalObservations, authorization),
    prisma,
    iso(-46000),
    iso(-45000),
  );
  const closure = {
    formatVersion: 2,
    runId: authorization.administrativeAudit.runId,
    authorizationId: authorization.administrativeAudit.authorizationId,
    operatorId: "synthetic-operator",
    confirmedAt: iso(-44000),
    noChangesReported: true,
    noUnexpectedAutomationReported: true,
    residualRiskAccepted: true,
  };
  return {
    authorization,
    binding,
    initial,
    prisma,
    final,
    closure,
    observations,
    now,
  };
}
export function transcript(observations) {
  return (
    ADMIN_PLAN.map(({ id }) => {
      const o = observations.find((item) => item.queryId === id);
      return [
        "TF_W02_" + id + "_BEGIN\t" + o.connectionId,
        ...o.rows.map((row) =>
          ["GRANTS", "SESSION_TLS"].includes(id)
            ? row.join("\t")
            : JSON.stringify(row),
        ),
        String(o.warningCount),
        "TF_W02_" + id + "_END\t" + o.connectionId,
      ].join("\n");
    }).join("\n") + "\n"
  );
}
