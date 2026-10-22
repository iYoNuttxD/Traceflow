import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(join(root, directory))) {
    const path = join(root, directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(relative(root, path)));
    else if (/\.(js|jsx|mjs)$/.test(entry)) found.push(path);
  }
  return found;
}

const productionFiles = [...sourceFiles('backend/src'), ...sourceFiles('frontend/src')];
const read = (path) => readFileSync(path, 'utf8');
const name = (path) => relative(root, path).replaceAll('\\', '/');

// Fencing/claim identifiers are not bearer credentials and never grant user access.
// Keep exceptions model-qualified: Session.claimToken and User.leaseToken remain forbidden.
const internalReservations = new Set([
  'ProjectPurgeStorageCleanup.claimToken',
  'GitHubArtifactEvent.claimToken',
  'EvidenceUpload.leaseToken'
]);
function unhashedCredentialFields(schema) {
  return [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].flatMap(([, model, body]) =>
    [...body.matchAll(/^\s+(\w*token\w*)\s+(String)(\??)/gim)]
      .map(([, field]) => `${model}.${field}`)
      .filter((field) => !field.endsWith('Hash') && !internalReservations.has(field))
  );
}

describe('anexo de arquitetura — verificações estáticas', () => {
  it('ARQ-02: nenhum mock, fake, stub, dummy ou lorem no código de produção', () => {
    const offenders = productionFiles
      .filter((path) => /\b(mock|mocked|fake|stub|dummy|lorem)\b/i.test(read(path)))
      .map(name);
    expect(offenders).toEqual([]);
  });

  it('ARQ-09: o frontend não usa Octokit nem chama a API do GitHub', () => {
    const manifest = JSON.parse(read(join(root, 'frontend/package.json')));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    expect(Object.keys(dependencies).filter((dependency) => /octokit/i.test(dependency))).toEqual(
      []
    );
    const offenders = sourceFiles('frontend/src')
      .filter((path) => /@octokit|api\.github\.com/.test(read(path)))
      .map(name);
    expect(offenders).toEqual([]);
  });

  it('ARQ-19: SQL Unsafe restrito aos dois pontos de interrupção com inteiros validados', () => {
    const offenders = sourceFiles('backend/src')
      .filter((path) => /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/.test(read(path)))
      .map(name)
      .sort();
    expect(offenders).toEqual([
      'backend/src/database/recovery-prisma.js',
      'backend/src/database/transaction-guard.js'
    ]);
  });

  it('ARQ-23: credenciais persistidas somente por hash; reservas internas com escopo exato', () => {
    const schema = read(join(root, 'backend/prisma/schema.prisma'));
    expect([...schema.matchAll(/^\s+\w*token\w*\s+String/gim)].length).toBeGreaterThan(0);
    expect(unhashedCredentialFields(schema)).toEqual([]);
  });

  it('ARQ-23: nomes de reserva não autorizam tokens em modelos de autenticação', () => {
    const invalid =
      'model Session {\n  token String\n  claimToken String?\n}\nmodel User {\n  leaseToken String?\n  tokenHash String\n}';
    expect(unhashedCredentialFields(invalid)).toEqual([
      'Session.token',
      'Session.claimToken',
      'User.leaseToken'
    ]);
  });

  it('ARQ-06: Octokit só no módulo GitHub', () => {
    const offenders = sourceFiles('backend/src')
      .filter((path) => /from '@octokit\//.test(read(path)))
      .map(name)
      .filter((path) => !path.startsWith('backend/src/modules/github/'));
    expect(offenders).toEqual([]);
  });
});
