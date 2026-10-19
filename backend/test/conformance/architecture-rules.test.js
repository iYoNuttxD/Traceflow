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

  it('ARQ-19: SQL Unsafe só nos três pontos com constantes ou inteiros validados', () => {
    const offenders = sourceFiles('backend/src')
      .filter((path) => /\$(queryRawUnsafe|executeRawUnsafe)\s*\(/.test(read(path)))
      .map(name)
      .sort();
    expect(offenders).toEqual([
      'backend/src/database/recovery-prisma.js',
      'backend/src/database/transaction-guard.js',
      'backend/src/shared/http/health.js'
    ]);
  });

  it('ARQ-23: o schema não persiste token em claro, só hashes e o identificador interno de reserva', () => {
    const schema = read(join(root, 'backend/prisma/schema.prisma'));
    const tokenFields = [...schema.matchAll(/^\s+(\w*token\w*)\s+(\w+)(\??)/gim)]
      .filter(([, , type]) => type === 'String')
      .map(([, field]) => field);
    expect(tokenFields.length).toBeGreaterThan(0);
    for (const field of tokenFields) expect(field).toMatch(/Hash$|^claimToken$/);
  });

  it('ARQ-06: Octokit só no módulo GitHub', () => {
    const offenders = sourceFiles('backend/src')
      .filter((path) => /from '@octokit\//.test(read(path)))
      .map(name)
      .filter((path) => !path.startsWith('backend/src/modules/github/'));
    expect(offenders).toEqual([]);
  });
});
