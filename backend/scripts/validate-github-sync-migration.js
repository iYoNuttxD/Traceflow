import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const liveness = process.argv.includes('--liveness');
const migrations = [
  liveness ? '20261011010000_github_scheduler_liveness' : '20261011000000_github_automatic_sync'
];
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const validationDatabase = `${sourceDatabase}_github_sync_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_github_sync_upgrade_validation$/.test(validationDatabase)) {
  throw new Error('Nome do banco descartável de validação GitHubSync recusado.');
}
const validationUrl = new URL(sourceUrl);
validationUrl.pathname = `/${validationDatabase}`;
const databaseUrl = validationUrl.toString();
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const root = mkdtempSync(join(tmpdir(), 'traceflow-github-sync-'));
const prismaDirectory = join(root, 'prisma');
const migrationsDirectory = join(prismaDirectory, 'migrations');
const schemaPath = join(prismaDirectory, 'schema.prisma');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaExecutable = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
let created = false;

function deploy() {
  const result = spawnSync(
    process.execPath,
    [prismaExecutable, 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
      encoding: 'utf8'
    }
  );
  if (result.status !== 0)
    throw new Error(`Deploy GitHubSync falhou: ${result.stderr || result.stdout}`);
}

let snapshot;
const tables = [
  'User',
  'Project',
  'ProjectMembership',
  'GitHubInstallation',
  'ProjectGitHubIntegration',
  'GitHubSyncRun',
  'Commit'
];
async function readHistory(client) {
  const result = {};
  for (const table of tables)
    result[table] = await client.$queryRawUnsafe(`SELECT * FROM \`${table}\` ORDER BY id`);
  return result;
}
async function seed(client) {
  await client.$executeRaw`INSERT INTO User (id,name,email,username,createdAt,updatedAt) VALUES (1,'Sync fixture','sync@example.invalid','sync_fixture',NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO Project (id,name,responsibleTeam,accessCode,createdAt,updatedAt) VALUES (1,'Sync fixture','Equipe','SYNC-UPGRADE',NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO ProjectMembership (projectId,userId,role,createdAt,updatedAt) VALUES (1,1,'OWNER',NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO GitHubInstallation (id,githubInstallationId,accountId,accountLogin,accountType,status,installedAt,createdAt,updatedAt) VALUES (1,'1','1','fixture','User','ACTIVE',NOW(3),NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO ProjectGitHubIntegration (projectId,installationId,githubRepositoryId,repositoryName,repositoryFullName,status,autoSyncEnabled,lastSyncAt,createdAt,updatedAt) VALUES (1,1,'1','repo','fixture/repo','ACTIVE',true,NOW(3),NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO GitHubSyncRun (projectId,requestedByUserId,status,step,createdAt,updatedAt) VALUES (1,1,'SUCCEEDED','COMPLETED',NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO Commit (projectId,hash,message,createdAt,updatedAt) VALUES (1,'preserved','Upgrade fixture',NOW(3),NOW(3))`;
  snapshot = await readHistory(client);
}

try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length)
    throw new Error('Banco descartável GitHubSync já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;
  mkdirSync(migrationsDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationsDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name >= migrations[0]) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(migrationsDirectory, entry.name), {
      recursive: true
    });
  }
  deploy();
  const beforeClient = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await seed(beforeClient);
  } finally {
    await beforeClient.$disconnect();
  }
  for (const migration of migrations) {
    cpSync(join(sourcePrisma, 'migrations', migration), join(migrationsDirectory, migration), {
      recursive: true
    });
  }
  deploy();
  const afterClient = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const after = await readHistory(afterClient);
    for (const table of tables) {
      const preserved = after[table].map((row, index) =>
        Object.fromEntries(Object.keys(snapshot[table][index]).map((key) => [key, row[key]]))
      );
      assert.deepEqual(preserved, snapshot[table], `History changed in ${table}`);
    }
    assert.equal(after.GitHubSyncRun[0].origin, 'MANUAL');
    assert.equal(after.ProjectGitHubIntegration[0].nextSyncAt, null);
    assert.equal(after.ProjectGitHubIntegration[0].consecutiveSyncFailures, 0);
    const run = await afterClient.gitHubSyncRun.create({
      data: {
        projectId: 1,
        requestedByUserId: null,
        origin: 'AUTOMATIC',
        activeProjectId: 1,
        automaticSlot: 1,
        automaticInstallationId: 1
      }
    });
    assert.equal(run.requestedByUserId, null);
    if (liveness) {
      assert.equal(await afterClient.gitHubSchedulerWorker.count(), 0);
      await afterClient.gitHubSchedulerWorker.create({
        data: { id: '00000000-0000-0000-0000-000000000001', heartbeatAt: new Date() }
      });
    }
    const beforeReapply = await readHistory(afterClient);
    deploy();
    assert.deepEqual(await readHistory(afterClient), beforeReapply);
    process.stdout.write(
      `${JSON.stringify({ database: validationDatabase, migrations, upgrade: 'PASS', preservedTables: tables, automaticActor: null, reapply: 'PASS' })}\n`
    );
  } finally {
    await afterClient.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
