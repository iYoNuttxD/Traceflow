import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requireBackend = createRequire(
  resolve(REPOSITORY_ROOT, "backend/package.json"),
);
const { parseDocument } = requireBackend("yaml");

const REQUIRED_CHECKS = [
  "Quality",
  "Backend Tests",
  "Frontend Tests",
  "Supply Chain",
  "Dependency Review",
];

const REQUIRED_SCRIPTS = {
  backend: [
    "lint",
    "format:check",
    "test",
    "test:unit",
    "test:integration",
    "test:coverage",
    "architecture:check",
    "security:secrets",
    "db:test:migrate",
    "db:test:status",
    "db:test:validate-empty",
    "db:test:validate-lr2-legacy",
    "db:test:validate-lr5",
    "db:test:validate-lr9",
    "db:test:validate-s2-p1",
    "db:test:validate-dashboard-preference",
    "db:test:validate-task-responsibility",
    "db:lr5:audit",
  ],
  frontend: ["lint", "format:check", "test", "test:coverage", "build"],
};

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function forbidMatch(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function normalizeRun(run) {
  return run
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join(" ");
}

// YAML is parsed before policy checks: comments and strings in unrelated fields
// cannot stand in for executable gates. Conditions intentionally use a small
// reviewed allowlist, rather than attempting to interpret GitHub expressions.
function executableWorkflow(source) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error(`YAML inválido: ${document.errors[0].message}`);
  const parsed = document.toJS();
  if (
    !parsed ||
    typeof parsed.jobs !== "object" ||
    Array.isArray(parsed.jobs)
  ) {
    throw new Error("Jobs da CI ausentes.");
  }
  const jobs = [
    ["quality", "Quality"],
    ["backend-tests", "Backend Tests"],
    ["frontend-tests", "Frontend Tests"],
    ["supply-chain", "Supply Chain"],
    ["dependency-review", "Dependency Review"],
  ];
  const unconditional = (value) =>
    value === undefined ||
    value === true ||
    value === "true" ||
    value === "${{ true }}";
  const normalized = [];
  for (const [id, name] of jobs) {
    const job = parsed.jobs[id];
    if (!job || job.name !== name) throw new Error(`Check ausente: ${name}`);
    if (id === "dependency-review") {
      if (job.if !== "${{ github.event_name == 'pull_request' }}") {
        throw new Error(
          `Check desabilitado ou condicional não aprovado: ${name}`,
        );
      }
    } else if (!unconditional(job.if)) {
      throw new Error(
        `Check desabilitado ou condicional não aprovado: ${name}`,
      );
    }
    if (Object.hasOwn(job, "continue-on-error"))
      throw new Error("A CI não pode mascarar falhas.");
    if (!Array.isArray(job.steps) || job.steps.length === 0)
      throw new Error(`Steps ausentes: ${name}`);
    const requiredCommands = {
      quality: [
        ["npm run lint", "backend"],
        ["npm run format:check", "backend"],
        ["npm run lint", "frontend"],
        ["npm run format:check", "frontend"],
        ["node --test scripts/validate-ci.test.mjs", "."],
      ],
      "backend-tests": [
        ...[
          "db:test:migrate",
          "db:test:status",
          "db:test:validate-empty",
          "db:test:validate-lr5",
          "db:test:validate-lr9",
          "db:test:validate-s2-p1",
          "db:test:validate-dashboard-preference",
          "db:test:validate-task-responsibility",
          "db:test:validate-s2-p3",
          "db:test:validate-s2-p5-1",
          "db:test:validate-lr2-legacy",
          "architecture:check",
          "security:secrets",
        ].map((script) => [`npm run ${script}`, "backend"]),
        ["npm run db:lr5:audit -- --test", "backend"],
      ],
      "frontend-tests": [
        ["npm run test:coverage", "frontend"],
        ["npm run build", "frontend"],
      ],
      "supply-chain": [
        [
          "node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json",
          ".",
        ],
        [
          "node scripts/check-npm-audit.mjs frontend docs/security/npm-audit-exceptions.json",
          ".",
        ],
        ["npm run security:secrets", "backend"],
      ],
    };
    for (const [command, directory] of requiredCommands[id] || []) {
      const found = job.steps.some((step) => {
        const workingDirectory =
          step?.["working-directory"] ??
          job.defaults?.run?.["working-directory"] ??
          parsed.defaults?.run?.["working-directory"] ??
          ".";
        return (
          workingDirectory === directory &&
          typeof step?.run === "string" &&
          normalizeRun(step.run) === command
        );
      });
      if (!found)
        throw new Error(
          `Gate obrigatório ausente em ${name}: ${command} (${directory}).`,
        );
    }
    normalized.push(`  ${id}:`, `    name: ${name}`);
    if (job.services?.mysql?.image)
      normalized.push(`    image: ${job.services.mysql.image}`);
    for (const step of job.steps) {
      if (!step || typeof step !== "object")
        throw new Error(`Step inválido: ${name}`);
      const artifact =
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/upload-artifact@");
      if (
        !unconditional(step.if) &&
        !(artifact && step.if === "${{ always() }}")
      ) {
        throw new Error(
          `Step desabilitado ou condicional não aprovado: ${name}`,
        );
      }
      if (Object.hasOwn(step, "continue-on-error"))
        throw new Error("A CI não pode mascarar falhas.");
      if (step.uses) normalized.push(`        uses: ${step.uses}`);
      if (step.with?.["node-version"])
        normalized.push(`          node-version: ${step.with["node-version"]}`);
      if (step.with?.["fail-on-severity"])
        normalized.push(
          `          fail-on-severity: ${step.with["fail-on-severity"]}`,
        );
      if (step.run !== undefined) {
        const shell =
          step.shell ?? job.defaults?.run?.shell ?? parsed.defaults?.run?.shell;
        if (shell !== undefined && !["bash", "sh"].includes(shell)) {
          throw new Error(`Shell não aprovado: ${name}`);
        }
        if (typeof step.run !== "string")
          throw new Error(`Comando inválido: ${name}`);
        {
          const command = normalizeRun(step.run);
          if (
            id === "backend-tests" &&
            command.trim() === "npm run test:coverage"
          ) {
            const workingDirectory =
              step["working-directory"] ??
              job.defaults?.run?.["working-directory"] ??
              parsed.defaults?.run?.["working-directory"] ??
              ".";
            if (workingDirectory !== "backend")
              throw new Error(
                "Backend Tests deve executar exatamente um gate completo de cobertura no backend.",
              );
          }
          // Entire shell-comment lines cannot supply missing commands or mask failures.
          if (command.trim() && !command.trimStart().startsWith("#")) {
            normalized.push(`        run: ${command.trim()}`);
          }
        }
      }
    }
  }
  return normalized.join("\n") + "\n";
}

export function validateCi({ workflow, backendPackage, frontendPackage }) {
  workflow = executableWorkflow(workflow);
  for (const check of REQUIRED_CHECKS) {
    requireMatch(
      workflow,
      new RegExp(`name:\\s*${check.replaceAll(" ", "\\s+")}`),
      `Check ausente: ${check}`,
    );
  }

  forbidMatch(
    workflow,
    /--if-present|continue-on-error|\|\|\s*true/,
    "A CI não pode mascarar falhas.",
  );
  forbidMatch(
    workflow,
    /uses:\s*[^\s]+@(main|master)\s*$/m,
    "Actions não podem usar referências flutuantes.",
  );
  requireMatch(
    workflow,
    /image:\s*mysql:8\.4\.8/,
    "MySQL deve usar versão explícita.",
  );
  requireMatch(
    workflow,
    /node-version:\s*22/,
    "Node 22 deve ser a versão canônica.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:migrate(?:\s|$)/m,
    "Migration do banco de teste ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:status(?:\s|$)/m,
    "Status das migrations ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:validate-empty(?:\s|$)/m,
    "Validação da cadeia vazia ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:validate-lr5(?:\s|$)/m,
    "Validação de upgrade populado e histórico LR.5 ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:validate-lr9(?:\s|$)/m,
    "Validação de upgrade representativo LR.8 para LR.9 ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:validate-s2-p1(?:\s|$)/m,
    "Validação de upgrade representativo S2 P1 ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:test:validate-lr2-legacy(?:\s|$)/m,
    "Validação de contract guard ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run db:lr5:audit(?:\s|$)/m,
    "Auditoria física LR.5 ausente.",
  );
  requireMatch(
    workflow,
    /^        run: npm run security:secrets(?:\s|$)/m,
    "Scanner de segredos ausente.",
  );
  requireMatch(
    workflow,
    /actions\/dependency-review-action@v4/,
    "Dependency Review oficial ausente.",
  );
  requireMatch(
    workflow,
    /fail-on-severity:\s*high/,
    "Dependency Review deve bloquear high.",
  );

  for (const [name, manifest] of [
    ["backend", backendPackage],
    ["frontend", frontendPackage],
  ]) {
    for (const script of REQUIRED_SCRIPTS[name]) {
      if (typeof manifest.scripts?.[script] !== "string") {
        throw new Error(`${name}: script ausente ${script}`);
      }
    }
  }

  // Keep the focused scripts available locally, but CI must run the full suite
  // with coverage rather than execute the same tests a second time.
  if (backendPackage.scripts["test:coverage"] !== "vitest run --coverage") {
    throw new Error(
      "Backend coverage deve executar a suíte completa sem filtros.",
    );
  }
  const backendJob =
    workflow.match(
      /^  backend-tests:\n([\s\S]*?)(?=^  [\w-]+:|$(?![\s\S]))/m,
    )?.[1] || "";
  const coverageRuns =
    backendJob.match(/^\s+run: npm run test:coverage\s*$/gm) || [];
  if (coverageRuns.length !== 1) {
    throw new Error(
      "Backend Tests deve executar exatamente um gate completo de cobertura.",
    );
  }
  forbidMatch(
    backendJob,
    /run: npm run test:(unit|integration)\b/,
    "Backend Tests não deve repetir as suítes já executadas pela cobertura.",
  );

  return true;
}

export function validateRepositoryCi() {
  return validateCi({
    workflow: readFileSync(
      resolve(REPOSITORY_ROOT, ".github/workflows/ci.yml"),
      "utf8",
    ),
    backendPackage: JSON.parse(
      readFileSync(resolve(REPOSITORY_ROOT, "backend/package.json"), "utf8"),
    ),
    frontendPackage: JSON.parse(
      readFileSync(resolve(REPOSITORY_ROOT, "frontend/package.json"), "utf8"),
    ),
  });
}
