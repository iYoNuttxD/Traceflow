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
        workflow: `${baseline.workflow}\n# npm test || true`,
      }),
    /não pode mascarar falhas/,
  );
});

test("bloqueia action com referência flutuante", () => {
  assert.throws(
    () =>
      validateCi({
        ...baseline,
        workflow: `${baseline.workflow}\n# uses: example/action@main`,
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
    /Migration do banco de teste ausente/,
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
    /Validação de upgrade populado e histórico LR.5 ausente/,
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
    /Validação de upgrade representativo LR\.8 para LR\.9 ausente/,
  );
});
