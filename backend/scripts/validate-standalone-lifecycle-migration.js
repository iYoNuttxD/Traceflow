import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';
import {
  seedStandaloneMigration,
  validateStandaloneMigration
} from './lib/standalone-migration-fixture.js';

dotenv.config({ path: resolve('.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve('.env'), override: false, quiet: true });
const migrations = [
  '20261013170000_manual_test_execution_reference',
  '20261013171000_requirement_lifecycle_basis'
];
const source = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const target = new URL(source);
const database = `${target.pathname.slice(1)}_standalone_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_standalone_upgrade_validation$/.test(database)) {
  throw new Error('Nome do banco descartável standalone recusado.');
}
target.pathname = `/${database}`;
// Keep connection-local collation probes on one connection.
target.searchParams.set('connection_limit', '1');
const url = validateTestDatabaseUrl(target.toString(), process.env.DATABASE_URL);
assert.notEqual(url, source);
const admin = new PrismaClient({ datasourceUrl: source });
const client = new PrismaClient({ datasourceUrl: url });
const root = mkdtempSync(join(tmpdir(), 'traceflow-standalone-upgrade-'));
const migrationDirectory = join(root, 'prisma', 'migrations');
const schemaPath = join(root, 'prisma', 'schema.prisma');
const sourcePrisma = resolve('prisma');
let created = false;

function deploy() {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
      encoding: 'utf8'
    }
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`
    .replaceAll(url, '[TEST_DATABASE_URL]')
    .replaceAll(source, '[TEST_DATABASE_URL]');
  assert.equal(result.status, 0, `Deploy standalone falhou: ${output}`);
}

async function assertMixedCollationFixture() {
  const [schema] = await client.$queryRaw`
    SELECT DEFAULT_COLLATION_NAME AS collationName FROM INFORMATION_SCHEMA.SCHEMATA
    WHERE SCHEMA_NAME=${database}`;
  assert.equal(schema.collationName, 'utf8mb4_general_ci');
  const columns = await client.$queryRaw`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLLATION_NAME AS collationName
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=${database}
    AND ((TABLE_NAME='RequirementTraceabilityState' AND COLUMN_NAME='currentSituation')
      OR (TABLE_NAME='Requirement' AND COLUMN_NAME='status'))`;
  assert.equal(columns.length, 2);
  for (const column of columns) assert.equal(column.collationName, 'utf8mb4_unicode_ci');
  // Two stored columns have equal coercibility. This reproduces CI's original 1267
  // independently of Prisma's session defaults and proves the regression fixture is sensitive.
  await client.$executeRawUnsafe(`CREATE TEMPORARY TABLE _StandaloneCollationProbe (
    situation VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL)`);
  try {
    await client.$executeRawUnsafe("INSERT INTO _StandaloneCollationProbe VALUES ('PLANEJADO')");
    await assert.rejects(
      client.$queryRawUnsafe(`SELECT s.currentSituation <> p.situation AS differs
        FROM RequirementTraceabilityState s CROSS JOIN _StandaloneCollationProbe p LIMIT 1`),
      (error) => error.code === 'P2010' && error.meta?.code === '1267',
      'The deliberate mixed-column comparison must reproduce MySQL 1267.'
    );
  } finally {
    await client.$executeRawUnsafe('DROP TEMPORARY TABLE IF EXISTS _StandaloneCollationProbe');
  }
}

try {
  const existing =
    await admin.$queryRaw`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=${database}`;
  assert.equal(
    existing.length,
    0,
    'Banco descartável já existe; não será reutilizado ou removido.'
  );
  await admin.$executeRawUnsafe(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  created = true;
  const [connected] = await client.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(connected.name, database);
  mkdirSync(migrationDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < migrations[0])
      cpSync(join(sourcePrisma, 'migrations', entry.name), join(migrationDirectory, entry.name), {
        recursive: true
      });
  }
  deploy();
  const columns =
    await client.$queryRaw`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=${database} AND TABLE_NAME='Requirement' AND COLUMN_NAME='lifecycleBasis'`;
  assert.equal(columns.length, 0, 'Fixture deve nascer antes da nova coluna.');
  const fixtures = await seedStandaloneMigration(client);
  await assertMixedCollationFixture();
  const oldHistory = await client.requirementTraceabilityHistoryEntry.findMany({
    orderBy: { id: 'asc' }
  });
  const oldExecutions = await client.testExecution.findMany({ orderBy: { id: 'asc' } });
  const oldRequirements = await client.$queryRaw`SELECT * FROM Requirement ORDER BY id`;
  const oldStates = await client.requirementTraceabilityState.findMany({ orderBy: { id: 'asc' } });
  for (const migration of migrations) {
    cpSync(join(sourcePrisma, 'migrations', migration), join(migrationDirectory, migration), {
      recursive: true
    });
    deploy();
  }
  await validateStandaloneMigration(
    client,
    fixtures,
    oldHistory,
    oldExecutions,
    oldRequirements,
    oldStates
  );
  const sample = fixtures[0];
  await client.requirement.update({
    where: { id: sample.requirement.id },
    data: { status: 'PLANEJADO' }
  });
  await assert.rejects(
    validateStandaloneMigration(
      client,
      fixtures,
      oldHistory,
      oldExecutions,
      oldRequirements,
      oldStates
    ),
    /done-pass: macro/
  );
  await client.requirement.update({
    where: { id: sample.requirement.id },
    data: { status: sample.expected.requirement.status }
  });
  await validateStandaloneMigration(
    client,
    fixtures,
    oldHistory,
    oldExecutions,
    oldRequirements,
    oldStates
  );
  process.stdout.write(
    `${JSON.stringify({
      schema: database,
      upgrade: 'ok',
      scenarios: fixtures.length,
      oldExecutionsPreserved: oldExecutions.length,
      negativeControl: 'detected',
      mixedCollationNegativeControl: '1267 detected',
      databaseCollation: 'utf8mb4_general_ci',
      historicalColumnCollation: 'utf8mb4_unicode_ci'
    })}\n`
  );
} finally {
  await client.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
