import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

export function validateCi({ workflow, backendPackage, frontendPackage }) {
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
    /npm run db:test:migrate/,
    "Migration do banco de teste ausente.",
  );
  requireMatch(
    workflow,
    /npm run db:test:status/,
    "Status das migrations ausente.",
  );
  requireMatch(
    workflow,
    /npm run db:test:validate-empty/,
    "Validação da cadeia vazia ausente.",
  );
  requireMatch(
    workflow,
    /npm run db:test:validate-lr5/,
    "Validação de upgrade populado e histórico LR.5 ausente.",
  );
  requireMatch(
    workflow,
    /npm run db:test:validate-lr2-legacy/,
    "Validação de contract guard ausente.",
  );
  requireMatch(
    workflow,
    /npm run db:lr5:audit/,
    "Auditoria física LR.5 ausente.",
  );
  requireMatch(
    workflow,
    /npm run security:secrets/,
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
