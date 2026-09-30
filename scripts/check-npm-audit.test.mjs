import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { evaluateAudit } from "./check-npm-audit.mjs";

const advisory = {
  source: 1124282,
  name: "react-router",
  dependency: "react-router",
  url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
  severity: "high",
};

const report = {
  auditReportVersion: 2,
  vulnerabilities: {
    "react-router": { name: "react-router", severity: "high", via: [advisory] },
    "react-router-dom": {
      name: "react-router-dom",
      severity: "high",
      via: ["react-router"],
    },
  },
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 0,
      total: 2,
    },
  },
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
  assert.equal(evaluateAudit(cleanReport(), { exceptions: [] }).ok, true);
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
  changed.metadata.vulnerabilities.high += 1;
  changed.metadata.vulnerabilities.total += 1;
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

function cleanReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    },
  };
}

test("bloqueia advisory critical independentemente de high", () => {
  const critical = cleanReport();
  critical.vulnerabilities.dangerous = {
    name: "dangerous",
    severity: "critical",
    via: [
      {
        dependency: "dangerous",
        severity: "critical",
        url: "https://github.com/advisories/GHSA-critical",
      },
    ],
  };
  critical.metadata.vulnerabilities.critical = 1;
  critical.metadata.vulnerabilities.total = 1;
  const result = evaluateAudit(critical, { exceptions: [] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blocked, [
    { package: "dangerous", advisoryId: "GHSA-critical", severity: "critical" },
  ]);
});

for (const [label, change, blockedCount] of [
  ["pacote", { package: "different-package" }, 2],
  ["severidade", { severity: "critical" }, 2],
  ["cadeia do pacote dependente", { dependencyChain: ["react-router"] }, 1],
  ["cadeia do advisory", { dependencyChain: ["react-router-dom"] }, 2],
]) {
  test(`bloqueia exceção com ${label} incorreto`, () => {
    const result = evaluateAudit(
      report,
      { exceptions: [{ ...exception, ...change }] },
      { now: new Date("2026-07-26T12:00:00Z") },
    );
    assert.equal(result.ok, false);
    assert.equal(result.blocked.length, blockedCount);
    assert.deepEqual(result.errors, []);
  });
}

// Exercise the real entrypoint and subprocess boundary without registry/network access.
function runCli(
  t,
  output,
  status = 0,
  policy = { exceptions: [] },
  failure = null,
) {
  const directory = mkdtempSync(join(tmpdir(), "traceflow-audit-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executable = join(
    directory,
    process.platform === "win32" ? "npm.cmd" : "npm",
  );
  const body = `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)}); ${failure === "signal" ? 'process.kill(process.pid, "SIGTERM")' : `process.exit(${status})`};\n`;
  writeFileSync(
    executable,
    process.platform === "win32"
      ? `@"${process.execPath}" "%~dp0fake-npm.cjs"\r\n`
      : body,
  );
  writeFileSync(join(directory, "fake-npm.cjs"), body);
  chmodSync(executable, 0o755);
  const policyPath = join(directory, "policy.json");
  writeFileSync(policyPath, JSON.stringify(policy));
  return spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./check-npm-audit.mjs", import.meta.url)),
      failure === "missing-directory" ? join(directory, "missing") : directory,
      policyPath,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
      },
    },
  );
}

for (const [label, output, status] of [
  ["JSON malformado", "{", 0],
  ["stdout vazio", "", 0],
  ["erro ENOTFOUND", JSON.stringify({ error: { code: "ENOTFOUND" } }), 1],
  [
    "erro junto ao relatório",
    JSON.stringify({ ...cleanReport(), error: { code: "E503" } }),
    1,
  ],
  [
    "metadata ausente",
    JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }),
    0,
  ],
  [
    "vulnerabilities ausente",
    JSON.stringify({ auditReportVersion: 2, metadata: cleanReport().metadata }),
    0,
  ],
  [
    "versão desconhecida",
    JSON.stringify({ ...cleanReport(), auditReportVersion: 99 }),
    0,
  ],
  [
    "contagem inconsistente",
    JSON.stringify({ ...report, vulnerabilities: {} }),
    1,
  ],
  ["schema vazio", "{}", 0],
  ["null", "null", 0],
  ["falha do processo", JSON.stringify(cleanReport()), 2],
  ["status 1 sem vulnerabilidades", JSON.stringify(cleanReport()), 1],
]) {
  test(`CLI falha fechada: ${label}`, (t) => {
    const result = runCli(t, output, status);
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /Audit aprovado/);
    assert.match(result.stderr, /npm audit/);
  });
}

test("CLI aceita relatório limpo e status 0", (t) => {
  const result = runCli(t, JSON.stringify(cleanReport()));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Audit aprovado.*0 high, 0 critical/);
});

test("CLI aceita status 1 com exceção específica válida", (t) => {
  const result = runCli(t, JSON.stringify(report), 1, {
    exceptions: [{ ...exception, reviewBy: "2099-10-26" }],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 ocorrência/);
});

test("CLI bloqueia status 1 com advisory não aprovado ou exceção expirada", (t) => {
  for (const exceptions of [[], [{ ...exception, reviewBy: "2000-01-01" }]]) {
    const result = runCli(t, JSON.stringify(report), 1, { exceptions });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Audit bloqueado.*GHSA-qwww-vcr4-c8h2/);
    assert.doesNotMatch(result.stdout, /Audit aprovado/);
  }
});

for (const failure of ["signal", "missing-directory"]) {
  test(`CLI bloqueia falha real do subprocesso: ${failure}`, (t) => {
    const result = runCli(
      t,
      JSON.stringify(cleanReport()),
      0,
      { exceptions: [] },
      failure,
    );
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /Audit aprovado/);
    assert.match(result.stderr, /npm audit|ENOENT/);
  });
}

test("CLI aceita status 1 de vulnerabilidade moderate sem exceção", (t) => {
  const moderate = cleanReport();
  moderate.vulnerabilities.example = {
    name: "example",
    severity: "moderate",
    via: [{ dependency: "example", severity: "moderate", source: 12345 }],
  };
  moderate.metadata.vulnerabilities.moderate = 1;
  moderate.metadata.vulnerabilities.total = 1;
  const result = runCli(t, JSON.stringify(moderate), 1);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Audit aprovado/);
});
