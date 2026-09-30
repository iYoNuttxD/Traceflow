import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCi, validateRepositoryCi } from "./validate-ci.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = {
  workflow: readFileSync(
    resolve(repositoryRoot, ".github/workflows/ci.yml"),
    "utf8",
  ),
  backendPackage: JSON.parse(
    readFileSync(resolve(repositoryRoot, "backend/package.json"), "utf8"),
  ),
  frontendPackage: JSON.parse(
    readFileSync(resolve(repositoryRoot, "frontend/package.json"), "utf8"),
  ),
};

test("aprova a política estrutural versionada", () => {
  assert.equal(validateRepositoryCi(), true);
});

test("bloqueia script obrigatório ausente", () => {
  const backendPackage = structuredClone(baseline.backendPackage);
  delete backendPackage.scripts.test;
  assert.throws(
    () => validateCi({ ...baseline, backendPackage }),
    /script ausente test/,
  );
});

test("bloqueia falha mascarada", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "run: npm run lint",
          "run: npm run lint\n      - name: Masked failure\n        run: npm test || true",
        ),
      }),
    /não pode mascarar falhas/,
  );
});

test("bloqueia action com referência flutuante", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "uses: actions/checkout@v4",
          "uses: actions/checkout@main",
        ),
      }),
    /referências flutuantes/,
  );
});

test("bloqueia ausência do gate de migrations", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "npm run db:test:migrate",
          "npm run test",
        ),
      }),
    /Gate obrigatório ausente.*db:test:migrate/,
  );
});

test("bloqueia ausência dos cenários de evolução LR.5", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "npm run db:test:validate-lr5",
          "npm run test",
        ),
      }),
    /Gate obrigatório ausente.*db:test:validate-lr5/,
  );
});

test("bloqueia ausência do upgrade representativo LR.8 para LR.9", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "npm run db:test:validate-lr9",
          "npm run test",
        ),
      }),
    /Gate obrigatório ausente.*db:test:validate-lr9/,
  );
});

test("bloqueia ausência do upgrade representativo S2 P1", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "npm run db:test:validate-s2-p1",
          "npm run test",
        ),
      }),
    /Gate obrigatório ausente.*db:test:validate-s2-p1/,
  );
});

for (const phase of ["p3", "p5-1"]) {
  test(`exige execução do upgrade representativo S2 ${phase}`, () => {
    const command = `npm run db:test:validate-s2-${phase}`;
    for (const replacement of [
      "run: echo removed",
      `run: echo removed # ${command}`,
      `if: false\n        run: ${command}`,
    ]) {
      const workflow = baseline.workflow.replace(
        `run: ${command}`,
        replacement,
      );
      assert.notEqual(workflow, baseline.workflow);
      assert.throws(
        () => validateCi({ ...baseline, workflow }),
        /Gate obrigatório ausente|Step desabilitado/,
      );
    }
  });
}

test("bloqueia ausência do gate completo de cobertura backend", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: baseline.workflow.replace(
          "run: npm run test:coverage",
          "run: npm run test:unit",
        ),
      }),
    /exatamente um gate completo de cobertura/,
  );
});

test("bloqueia cobertura backend limitada a um subconjunto", () => {
  const backendPackage = structuredClone(baseline.backendPackage);
  backendPackage.scripts["test:coverage"] = "vitest run test/unit --coverage";
  assert.throws(
    () => validateCi({ ...baseline, backendPackage }),
    /suíte completa sem filtros/,
  );
});

test("bloqueia execução redundante das suítes backend", () => {
  for (const suite of ["unit", "integration", "coverage"]) {
    const workflow = baseline.workflow.replace(
      "run: npm run test:coverage",
      `run: npm run test:coverage\n      - name: Redundant suite\n        run: npm run test:${suite}`,
    );
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /não deve repetir|exatamente um gate completo/,
    );
  }
});

test("comentários não são steps executáveis nem falhas mascaradas", () => {
  const workflow = `${baseline.workflow}\n# npm test || true\n# uses: example/action@main\n# continue-on-error: true\n`;
  assert.equal(validateCi({ ...baseline, workflow }), true);
});

test("comentário não substitui migration obrigatória", () => {
  const workflow = baseline.workflow.replace(
    "run: npm run db:test:migrate",
    "run: npm run test # npm run db:test:migrate",
  );
  assert.throws(
    () => validateCi({ ...baseline, workflow }),
    /Gate obrigatório ausente.*db:test:migrate/,
  );
});

for (const job of [
  "quality",
  "backend-tests",
  "frontend-tests",
  "supply-chain",
  "dependency-review",
]) {
  for (const condition of [
    "false",
    "${{ false }}",
    "${{ github.event_name == 'never' }}",
  ]) {
    test(`bloqueia job ${job} desabilitado por ${condition}`, () => {
      const workflow =
        job === "dependency-review"
          ? baseline.workflow.replace(
              "if: ${{ github.event_name == 'pull_request' }}",
              `if: ${condition}`,
            )
          : baseline.workflow.replace(
              `  ${job}:`,
              `  ${job}:\n    if: ${condition}`,
            );
      assert.throws(
        () => validateCi({ ...baseline, workflow }),
        /Check desabilitado/,
      );
    });
  }
}

for (const command of [
  "npm run db:test:migrate",
  "npm run test:coverage",
  "node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json",
]) {
  test(`bloqueia step obrigatório desabilitado: ${command}`, () => {
    const workflow = baseline.workflow.replace(
      `run: ${command}`,
      `if: false\n        run: ${command}`,
    );
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /Step desabilitado/,
    );
  });
}

test("bloqueia continue-on-error e --if-present em steps reais", () => {
  for (const replacement of [
    "continue-on-error: true\n        run: npm run lint",
    "run: npm run lint\n      - name: Masked failure\n        run: npm test --if-present",
  ]) {
    const workflow = baseline.workflow.replace(
      "run: npm run lint",
      replacement,
    );
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /não pode mascarar falhas/,
    );
  }
});

test("lê comando de migration em bloco literal e ignora comentários do shell", () => {
  const workflow = baseline.workflow.replace(
    "run: npm run db:test:migrate",
    "run: |\n          # npm run test || true\n          npm run db:test:migrate",
  );
  assert.equal(validateCi({ ...baseline, workflow }), true);
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: workflow.replace(
          "          npm run db:test:migrate",
          "          # npm run db:test:migrate",
        ),
      }),
    /Gate obrigatório ausente.*db:test:migrate/,
  );
});

test("nome de check comentado não substitui job", () => {
  const workflow = baseline.workflow.replace(
    "    name: Quality",
    "    # name: Quality\n    name: Other",
  );
  assert.throws(
    () => validateCi({ ...baseline, workflow }),
    /Check ausente: Quality/,
  );
});

for (const [job, command] of [
  ["frontend-tests", "npm run test:coverage"],
  ["frontend-tests", "npm run build"],
  [
    "supply-chain",
    "node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json",
  ],
  [
    "supply-chain",
    "node scripts/check-npm-audit.mjs frontend docs/security/npm-audit-exceptions.json",
  ],
  ["supply-chain", "npm run security:secrets"],
]) {
  test(`exige gate executável em ${job}: ${command}`, () => {
    const start = baseline.workflow.indexOf(`  ${job}:`);
    const prefix = baseline.workflow.slice(0, start);
    const suffix = baseline.workflow.slice(start);
    for (const substitute of [
      "run: echo removed",
      `run: echo removed # ${command}`,
      `run: |\n          # ${command}\n          echo removed`,
    ]) {
      const workflow = prefix + suffix.replace(`run: ${command}`, substitute);
      assert.throws(
        () => validateCi({ ...baseline, workflow }),
        /Gate obrigatório ausente/,
      );
    }
  });
}

test("cobertura deve executar no projeto correto", () => {
  for (const job of ["backend-tests", "frontend-tests"]) {
    const start = baseline.workflow.indexOf(`  ${job}:`);
    const workflow =
      baseline.workflow.slice(0, start) +
      baseline.workflow
        .slice(start)
        .replace(
          /working-directory: (backend|frontend)\n        run: npm run test:coverage/,
          "working-directory: other\n        run: npm run test:coverage",
        );
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /gate completo de cobertura no backend|Gate obrigatório ausente/,
    );
  }
});

test("YAML com chaves duplicadas não pode ocultar condição", () => {
  const workflow = baseline.workflow.replace(
    "  backend-tests:",
    "  backend-tests:\n    if: true\n    if: false",
  );
  assert.throws(() => validateCi({ ...baseline, workflow }), /YAML inválido/);
});

for (const job of ["backend-tests", "frontend-tests", "supply-chain"]) {
  test(`heredoc ou echo não executa gate em ${job}`, () => {
    const start = baseline.workflow.indexOf(`  ${job}:`);
    const command =
      job === "supply-chain"
        ? "node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json"
        : "npm run test:coverage";
    for (const replacement of [
      `run: |\n          : <<'COMMENT'\n          ${command}\n          COMMENT`,
      `run: echo '${command}'`,
      `run: |\n          if false; then\n          ${command}\n          fi`,
    ]) {
      const workflow =
        baseline.workflow.slice(0, start) +
        baseline.workflow.slice(start).replace(`run: ${command}`, replacement);
      assert.throws(
        () => validateCi({ ...baseline, workflow }),
        /Gate obrigatório ausente|exatamente um gate completo/,
      );
    }
  });
}

for (const [command, directory] of [
  ["npm run lint", "backend"],
  ["npm run format:check", "backend"],
  ["npm run lint", "frontend"],
  ["npm run format:check", "frontend"],
  ["node --test scripts/validate-ci.test.mjs", null],
]) {
  test(`exige Quality: ${command} ${directory || "root"}`, () => {
    const target = directory
      ? `working-directory: ${directory}\n        run: ${command}`
      : `run: ${command}`;
    const workflow = baseline.workflow.replace(
      target,
      `run: echo removed # ${command}`,
    );
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /Gate obrigatório ausente em Quality/,
    );
  });
}

for (const scope of ["step", "job", "workflow"]) {
  test(`bloqueia shell no-op em ${scope}`, () => {
    const workflow =
      scope === "step"
        ? baseline.workflow.replace(
            "run: npm run test:coverage",
            "shell: echo {0}\n        run: npm run test:coverage",
          )
        : scope === "job"
          ? baseline.workflow.replace(
              "  backend-tests:",
              "  backend-tests:\n    defaults:\n      run:\n        shell: echo {0}",
            )
          : `defaults:\n  run:\n    shell: echo {0}\n${baseline.workflow}`;
    assert.throws(
      () => validateCi({ ...baseline, workflow }),
      /Shell não aprovado/,
    );
  });
}

test("migration não pode mudar de job ou diretório", () => {
  const workflow = baseline.workflow.replace(
    "working-directory: backend\n        run: npm run db:test:migrate",
    "working-directory: frontend\n        run: npm run db:test:migrate",
  );
  assert.throws(
    () => validateCi({ ...baseline, workflow }),
    /Gate obrigatório ausente em Backend Tests.*db:test:migrate/,
  );
});
