import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

function advisoryId(advisory) {
  const match = advisory.url?.match(/\/advisories\/([^/]+)$/);
  return match?.[1] || String(advisory.source || "UNKNOWN_ADVISORY");
}

function resolveAdvisories(name, vulnerabilities, visited = new Set()) {
  if (visited.has(name)) return [];
  visited.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return [];

  return (vulnerability.via || []).flatMap((entry) => {
    if (typeof entry === "string") {
      return resolveAdvisories(entry, vulnerabilities, visited);
    }
    return [
      {
        id: advisoryId(entry),
        package: entry.dependency || entry.name || name,
        severity: entry.severity || vulnerability.severity,
      },
    ];
  });
}

function validateException(exception, now) {
  const required = [
    "advisoryId",
    "package",
    "dependencyChain",
    "severity",
    "justification",
    "decidedAt",
    "reviewBy",
    "owner",
  ];
  const missing = required.filter((field) => {
    const value = exception[field];
    return value === undefined || value === null || value === "";
  });
  if (missing.length > 0) {
    return `Exceção ${exception.advisoryId || "sem ID"} incompleta: ${missing.join(", ")}.`;
  }
  if (
    !Array.isArray(exception.dependencyChain) ||
    exception.dependencyChain.length === 0
  ) {
    return `Exceção ${exception.advisoryId} deve declarar dependencyChain.`;
  }
  const reviewBy = new Date(`${exception.reviewBy}T23:59:59.999Z`);
  if (Number.isNaN(reviewBy.getTime()) || reviewBy < now) {
    return `Exceção ${exception.advisoryId} expirada em ${exception.reviewBy}.`;
  }
  return null;
}

export function evaluateAudit(report, policy, { now = new Date() } = {}) {
  const vulnerabilities = report.vulnerabilities || {};
  const exceptions = policy.exceptions || [];
  const errors = exceptions
    .map((item) => validateException(item, now))
    .filter(Boolean);
  const approved = [];
  const blocked = [];

  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (!BLOCKING_SEVERITIES.has(vulnerability.severity)) continue;
    const advisories = resolveAdvisories(name, vulnerabilities);
    if (advisories.length === 0) {
      blocked.push({
        package: name,
        advisoryId: "UNRESOLVED",
        severity: vulnerability.severity,
      });
      continue;
    }

    for (const advisory of advisories) {
      const exception = exceptions.find(
        (candidate) =>
          candidate.advisoryId === advisory.id &&
          candidate.package === advisory.package &&
          candidate.severity === advisory.severity &&
          candidate.dependencyChain.includes(name) &&
          candidate.dependencyChain.includes(advisory.package),
      );
      const exceptionError = exception
        ? validateException(exception, now)
        : null;
      if (exception && !exceptionError) {
        approved.push({
          package: name,
          advisoryId: advisory.id,
          severity: advisory.severity,
        });
      } else {
        blocked.push({
          package: name,
          advisoryId: advisory.id,
          severity: advisory.severity,
        });
      }
    }
  }

  return {
    ok: errors.length === 0 && blocked.length === 0,
    errors,
    approved,
    blocked,
    totals: report.metadata?.vulnerabilities || {},
  };
}

function runAudit(projectDirectory) {
  // `shell: true` e obrigatorio no Windows: desde a correcao da CVE-2024-27980
  // (Node 18.20/20.12/22) o spawn recusa .cmd e .bat sem shell. Sem isto o
  // npm nem chega a rodar e o stdout volta undefined.
  const result = spawnSync("npm", ["audit", "--json"], {
    cwd: projectDirectory,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: true,
  });
  if (result.error) throw result.error;
  if (!result.stdout?.trim()) {
    throw new Error(`npm audit não produziu JSON para ${projectDirectory}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `npm audit produziu JSON inválido para ${projectDirectory}.`,
    );
  }
}

function main() {
  const [, , projectArgument, policyArgument] = process.argv;
  if (!projectArgument || !policyArgument) {
    throw new Error(
      "Uso: node scripts/check-npm-audit.mjs <projeto> <arquivo-de-exceções>.",
    );
  }
  const projectDirectory = resolve(projectArgument);
  const policy = JSON.parse(readFileSync(resolve(policyArgument), "utf8"));
  const evaluation = evaluateAudit(runAudit(projectDirectory), policy);

  for (const error of evaluation.errors) process.stderr.write(`${error}\n`);
  for (const item of evaluation.blocked) {
    process.stderr.write(
      `Audit bloqueado: ${item.advisoryId} em ${item.package} (${item.severity}).\n`,
    );
  }
  if (!evaluation.ok) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Audit aprovado: ${evaluation.approved.length} ocorrência(s) coberta(s) por exceção específica; ` +
      `${evaluation.totals.high || 0} high, ${evaluation.totals.critical || 0} critical.\n`,
  );
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) main();
