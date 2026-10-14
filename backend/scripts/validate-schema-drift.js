import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve('.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve('.env'), override: false, quiet: true });
const source = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const target = new URL(source);
const database = `${target.pathname.slice(1)}_schema_drift_validation`;
if (!/^[a-zA-Z0-9_]+_test_schema_drift_validation$/.test(database)) {
  throw new Error('Nome do banco descartável de drift recusado.');
}
target.pathname = `/${database}`;
const url = validateTestDatabaseUrl(target.toString(), process.env.DATABASE_URL);
assert.notEqual(url, source);
const admin = new PrismaClient({ datasourceUrl: source });
const client = new PrismaClient({ datasourceUrl: url });
let created = false;
const schema = resolve('prisma/schema.prisma');
const cli = resolve('node_modules/prisma/build/index.js');

function command(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
    encoding: 'utf8'
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`
    .replaceAll(url, '[TEST_DATABASE_URL]')
    .replaceAll(source, '[TEST_DATABASE_URL]');
  if (result.error || result.status === null) throw new Error('Prisma CLI não concluiu.');
  return { status: result.status, output };
}
function diff() {
  // Prisma 6.12: compare the REAL schema produced by the entire SQL chain.
  // No shadow is needed: migrate deploy materializes it in our owned disposable DB.
  return command([
    'migrate',
    'diff',
    '--from-schema-datasource',
    schema,
    '--to-schema-datamodel',
    schema,
    '--exit-code'
  ]);
}

try {
  const existing = await admin.$queryRaw`
    SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ${database}
  `;
  if (existing.length) throw new Error('Banco de drift já existe; não será reutilizado/removido.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${database}\``);
  created = true;
  const [connected] = await client.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(connected.name, database);
  const deployed = command(['migrate', 'deploy', '--schema', schema]);
  assert.equal(deployed.status, 0, deployed.output);
  const actual = diff();
  assert.equal(actual.status, 0, `Schema drift (exit ${actual.status}):\n${actual.output}`);
  // Negative control: prove that a real FK drift is detected, with exit code 2.
  // This is deliberately applied ONLY after the positive gate in our disposable DB.
  await client.$executeRaw`ALTER TABLE GitHubSyncRun DROP FOREIGN KEY GitHubSyncRun_requestedByUserId_fkey`;
  await client.$executeRaw`ALTER TABLE GitHubSyncRun ADD CONSTRAINT GitHubSyncRun_requestedByUserId_fkey FOREIGN KEY (requestedByUserId) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE`;
  const negative = diff();
  assert.equal(negative.status, 2, `Controle negativo de drift falhou: ${negative.output}`);
  assert.match(negative.output, /GitHubSyncRun/);
  process.stdout.write(
    `${JSON.stringify({ database, fullSqlChain: 'PASS', schemaDrift: 'NONE', negativeControlExit: negative.status })}\n`
  );
} finally {
  await client.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
  await admin.$disconnect();
}
