import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { extractImportSpecifiers } from '../../scripts/check-architecture.js';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ENTRY = 'src/database/prismaClient.js';
const CLOSURE = [
  'src/database/database-safety.js',
  'src/database/engine-health.js',
  'src/database/lock-wait.js',
  'src/database/prismaClient.js',
  'src/database/recovery-prisma.js',
  'src/database/transaction-guard.js',
  'src/shared/logger/index.js',
  'src/shared/logger/logger.js',
  'src/shared/logger/redaction.js'
];
const PACKAGES = ['@prisma/client', 'dotenv'];
const probeRoot = join(backend, 'node_modules', '.cache', `traceflow-fechamento-${randomUUID()}`);

afterAll(() => rmSync(probeRoot, { recursive: true, force: true }));

function closureOf(entry) {
  const files = new Set();
  const packages = new Set();
  const dynamic = [];
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(join(backend, file), 'utf8');
    if (/\bimport\s*\(/.test(source)) dynamic.push(file);
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.startsWith('.'))
        pending.push(posix.normalize(posix.join(posix.dirname(file), specifier)));
      else packages.add(specifier);
    }
  }
  return { files: [...files].sort(), packages: [...packages].sort(), dynamic };
}

describe('TF-REV-005 — fechamento do cliente Prisma (ADR-024 D6)', () => {
  it('C-01 os imports estáticos a partir do prismaClient.js são os 9 arquivos do ADR-024', () => {
    const closure = closureOf(ENTRY);

    expect(closure.files).toEqual(CLOSURE);
    expect(closure.packages).toEqual(PACKAGES);
    expect(closure.dynamic).toEqual([]);
    expect(closure.files).not.toContain('src/config/env.js');
  });

  it('C-02 com só os arquivos do fechamento copiados, o cliente e o logger carregam sem a configuração da aplicação', () => {
    for (const file of CLOSURE) {
      mkdirSync(dirname(join(probeRoot, file)), { recursive: true });
      copyFileSync(join(backend, file), join(probeRoot, file));
    }
    writeFileSync(join(probeRoot, 'package.json'), JSON.stringify({ type: 'module' }));
    const probe = [
      "const client = await import('./src/database/prismaClient.js');",
      "const { logger } = await import('./src/shared/logger/index.js');",
      "logger.info('Sonda do fechamento do cliente.', { event: 'closure_probe' });",
      'process.stdout.write(JSON.stringify({',
      '  transaction: typeof client.prisma.$transaction,',
      '  create: typeof client.createPrismaClient,',
      '  disconnect: typeof client.disconnectDatabase',
      "}) + '\\n');",
      'await client.disconnectDatabase();'
    ].join('\n');

    const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: probeRoot,
      encoding: 'utf8',
      timeout: 30000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://diagnostico:diagnostico@localhost:3306/traceflow',
        TEST_DATABASE_URL: '',
        DATABASE_POOL_LIMIT: '1'
      }
    });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND|ConfigurationError|Configuração inválida/);
    const [logLine, result] = run.stdout.trim().split('\n');
    expect(JSON.parse(logLine)).toMatchObject({
      level: 'info',
      environment: 'production',
      event: 'closure_probe'
    });
    expect(JSON.parse(result)).toEqual({
      transaction: 'function',
      create: 'function',
      disconnect: 'function'
    });
  });
});
