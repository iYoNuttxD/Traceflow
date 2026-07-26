import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAudit } from "./check-npm-audit.mjs";

const advisory = {
  source: 1124282,
  name: "react-router",
  dependency: "react-router",
  url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
  severity: "high",
};

const report = {
  vulnerabilities: {
    "react-router": { name: "react-router", severity: "high", via: [advisory] },
    "react-router-dom": {
      name: "react-router-dom",
      severity: "high",
      via: ["react-router"],
    },
  },
  metadata: { vulnerabilities: { high: 2, critical: 0 } },
};

const exception = {
  advisoryId: "GHSA-qwww-vcr4-c8h2",
  package: "react-router",
  dependencyChain: ["react-router-dom", "react-router"],
  severity: "high",
  justification: "SPA sem React Server Components ou actions.",
  decidedAt: "2026-07-26",
  reviewBy: "2026-10-26",
  owner: "Maintainers TRACEFLOW",
};

test("aceita audit limpo sem exceções", () => {
  assert.equal(
    evaluateAudit({ vulnerabilities: {} }, { exceptions: [] }).ok,
    true,
  );
});

test("aceita somente advisory, pacote e cadeia explicitamente aprovados", () => {
  const result = evaluateAudit(
    report,
    { exceptions: [exception] },
    {
      now: new Date("2026-07-26T12:00:00Z"),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.approved.length, 2);
});

test("bloqueia novo advisory high", () => {
  const changed = structuredClone(report);
  changed.vulnerabilities.other = {
    name: "other",
    severity: "high",
    via: [
      {
        dependency: "other",
        url: "https://github.com/advisories/GHSA-new1-new2-new3",
        severity: "high",
      },
    ],
  };
  const result = evaluateAudit(
    changed,
    { exceptions: [exception] },
    {
      now: new Date("2026-07-26T12:00:00Z"),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.blocked.at(-1).advisoryId, "GHSA-new1-new2-new3");
});

test("bloqueia exceção expirada", () => {
  const result = evaluateAudit(
    report,
    {
      exceptions: [{ ...exception, reviewBy: "2026-07-25" }],
    },
    { now: new Date("2026-07-26T12:00:00Z") },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /expirada/);
});

test("não transforma a exceção em allowlist genérica do pacote", () => {
  const result = evaluateAudit(
    report,
    {
      exceptions: [{ ...exception, advisoryId: "GHSA-different-id" }],
    },
    { now: new Date("2026-07-26T12:00:00Z") },
  );
  assert.equal(result.ok, false);
  assert.equal(result.blocked.length, 2);
});
