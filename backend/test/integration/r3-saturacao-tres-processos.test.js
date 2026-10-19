import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const child = join(backend, 'test/helpers/pool-saturation-child.js');
const ROLES = [
  ['r3sat-api', 5],
  ['r3sat-worker', 3],
  ['r3sat-command', 2]
];
const BUDGET = 5 + 1 + 3 + 1 + 2 + 1;

let prisma;
let testDatabaseUrl;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
}, 60000);

afterAll(async () => {
  await prisma.$disconnect();
});

function urlWithLimit(limit) {
  const url = new URL(testDatabaseUrl);
  url.searchParams.set('connection_limit', String(limit));
  return url.toString();
}

function childEnv(limit) {
  const env = { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: urlWithLimit(limit) };
  delete env.DATABASE_POOL_LIMIT;
  return env;
}

function run(tag, limit) {
  return new Promise((done, fail) => {
    const processHandle = spawn(process.execPath, [child, JSON.stringify({ tag, seconds: 1.5 })], {
      cwd: backend,
      env: childEnv(limit)
    });
    let stdout = '';
    let stderr = '';
    processHandle.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    processHandle.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    processHandle.on('error', fail);
    processHandle.on('exit', (code) => done({ code, stdout, stderr }));
  });
}

async function sample() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT INFO AS info FROM information_schema.PROCESSLIST WHERE INFO LIKE '%r3sat-%' AND ID <> CONNECTION_ID()"
  );
  const counts = {};
  for (const { info } of rows) {
    const label = /\/\* (r3sat-[a-z]+-(?:app|recovery)) \*\//.exec(String(info))?.[1];
    if (label) counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

describe('ADR-024 D2 e D3 — saturação com API, worker e comando no mesmo banco (TF-REV-016)', () => {
  it('S-01 e S-02: cada processo fica no seu teto, a recuperação fica em 1 e responde com o pool cheio', async () => {
    const children = Promise.all(ROLES.map(([tag, limit]) => run(tag, limit)));
    let finished = false;
    void children.finally(() => {
      finished = true;
    });
    const peak = {};
    let total = 0;
    while (!finished) {
      const counts = await sample();
      for (const [label, count] of Object.entries(counts))
        peak[label] = Math.max(peak[label] ?? 0, count);
      total = Math.max(
        total,
        Object.values(counts).reduce((sum, count) => sum + count, 0)
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const results = await children;

    for (const [index, [tag, limit]] of ROLES.entries()) {
      expect(results[index].code, `${tag}: ${results[index].stderr}`).toBe(0);
      const report = JSON.parse(results[index].stdout.trim().split('\n').at(-1));
      expect(report).toMatchObject({ tag, limit });
      expect(report.recoveryMs, `${tag}: recuperação com o pool cheio`).toBeLessThan(1500);
      expect(peak[`${tag}-app`], `${tag}: pico do cliente da aplicação`).toBe(limit);
      expect(peak[`${tag}-recovery`] ?? 0, `${tag}: pico da recuperação`).toBeLessThanOrEqual(1);
    }
    expect(total).toBeLessThanOrEqual(BUDGET);
  }, 60000);

  it('S-03 o comando acima do teto não sobe; no teto, roda', () => {
    const command = (limit) =>
      spawnSync(
        process.execPath,
        ['src/jobs/cli/notification-metrics.js', '--from=2026-10-01', '--to=2026-10-01'],
        { cwd: backend, env: childEnv(limit), encoding: 'utf8', timeout: 60000 }
      );

    const above = command(3);
    expect(above.status, above.stderr).toBe(1);
    expect(above.stdout).not.toContain('requisitos');

    const within = command(2);
    expect(within.status, within.stderr).toBe(0);
    expect(JSON.parse(within.stdout)).toHaveProperty('requisitos');
  }, 120000);
});
