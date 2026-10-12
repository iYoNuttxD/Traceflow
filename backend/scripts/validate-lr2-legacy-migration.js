import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const lr2Migration = '20260820120000_lr2_contract_legacy_consolidation';
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const targetUrl = new URL(sourceUrl);
const sourceDatabase = targetUrl.pathname.slice(1);
const validationDatabase = `${sourceDatabase}_lr2_legacy_validation`;
if (!/^[a-zA-Z0-9_]+_test_lr2_legacy_validation$/.test(validationDatabase)) {
  throw new Error('Nome do banco temporário LR.2 recusado.');
}
targetUrl.pathname = `/${validationDatabase}`;
const guardUrl = new URL(sourceUrl);
const guardDatabase = `${sourceDatabase}_lr2_guard_validation`;
if (!/^[a-zA-Z0-9_]+_test_lr2_guard_validation$/.test(guardDatabase)) {
  throw new Error('Nome do banco temporário de guard LR.2 recusado.');
}
guardUrl.pathname = `/${guardDatabase}`;
validateTestDatabaseUrl(targetUrl.toString(), process.env.DATABASE_URL);
validateTestDatabaseUrl(guardUrl.toString(), process.env.DATABASE_URL);

const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const temporaryRoot = mkdtempSync(join(tmpdir(), 'traceflow-lr2-'));
const temporaryPrisma = join(temporaryRoot, 'prisma');
const temporaryMigrations = join(temporaryPrisma, 'migrations');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaExecutable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
);
let created = false;
let guardCreated = false;
const migrations = readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (!migrations.includes(lr2Migration)) throw new Error('Migration LR.2 não encontrada.');

async function assertDatabase(client, expected) {
  const [{ databaseName }] = await client.$queryRawUnsafe('SELECT DATABASE() AS databaseName');
  if (databaseName !== expected)
    throw new Error('Conexão do validador LR.2 fora do schema esperado.');
}

function copyMigration(name) {
  cpSync(join(sourcePrisma, 'migrations', name), join(temporaryMigrations, name), {
    recursive: true
  });
}

async function assertHistory(client, expected) {
  const applied = await client.$queryRawUnsafe(
    'SELECT migration_name FROM `_prisma_migrations` WHERE finished_at IS NOT NULL ORDER BY migration_name'
  );
  // Compare the same filename ordering, independent of MySQL punctuation collation.
  if (JSON.stringify(applied.map((row) => row.migration_name).sort()) !== JSON.stringify(expected))
    throw new Error('A fase histórica LR.2 contém migrations fora da sequência esperada.');
}

async function snapshot(client) {
  return JSON.stringify(
    await Promise.all([
      client.$queryRawUnsafe('SELECT id, name, accessCode FROM Project ORDER BY id'),
      client.$queryRawUnsafe('SELECT * FROM ProjectGitHubIntegration ORDER BY id'),
      client.$queryRawUnsafe('SELECT id, hash, projectId FROM Commit ORDER BY id'),
      client.$queryRawUnsafe('SELECT * FROM CommitBranch ORDER BY commitId, branchId'),
      client.$queryRawUnsafe('SELECT id, projectId, name FROM GitBranch ORDER BY id')
    ])
  );
}

function deploy(schemaPath, databaseUrl = targetUrl.toString()) {
  const result = spawnSync(prismaExecutable, ['migrate', 'deploy', '--schema', schemaPath], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(
      `Validação LR.2 falhou ao aplicar migrations. ${result.stderr || result.stdout}`
    );
  }
}

try {
  await assertDatabase(admin, sourceDatabase);
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length)
    throw new Error('O banco temporário LR.2 já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;
  const existingGuard = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    guardDatabase
  );
  if (existingGuard.length)
    throw new Error('O banco temporário de guard LR.2 já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${guardDatabase}\``);
  guardCreated = true;

  mkdirSync(temporaryMigrations, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), join(temporaryPrisma, 'schema.prisma'));
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(temporaryMigrations, 'migration_lock.toml')
  );
  const beforeLr2 = migrations.filter((name) => name < lr2Migration);
  for (const name of beforeLr2) copyMigration(name);

  const temporarySchema = join(temporaryPrisma, 'schema.prisma');
  deploy(temporarySchema);
  deploy(temporarySchema, guardUrl.toString());

  const guardLegacy = new PrismaClient({ datasourceUrl: guardUrl.toString() });
  try {
    await assertDatabase(guardLegacy, guardDatabase);
    await assertHistory(guardLegacy, beforeLr2);
    await guardLegacy.$executeRawUnsafe(
      `INSERT INTO \`Project\` (
        \`name\`, \`responsibleTeam\`, \`accessCode\`, \`createdAt\`, \`updatedAt\`
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      'Projeto com membro não reconciliado',
      'Equipe artificial',
      'TRC-LR2-GUARD-ARTIFICIAL'
    );
    const [{ id: guardProjectId }] = await guardLegacy.$queryRawUnsafe(
      'SELECT `id` FROM `Project` WHERE `accessCode` = ?',
      'TRC-LR2-GUARD-ARTIFICIAL'
    );
    await guardLegacy.$executeRawUnsafe(
      `INSERT INTO \`ProjectMember\` (
        \`projectId\`, \`name\`, \`email\`, \`role\`, \`isActive\`, \`joinedAt\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (?, ?, ?, 'MEMBRO', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      guardProjectId,
      'Pessoa artificial não reconciliada',
      'lr2-guard@example.invalid'
    );
  } finally {
    await guardLegacy.$disconnect();
  }

  const legacy = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  try {
    await assertDatabase(legacy, validationDatabase);
    await assertHistory(legacy, beforeLr2);
    const prematureColumns = await legacy.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ProjectGitHubIntegration'
       AND COLUMN_NAME IN ('autoSyncEnabled', 'nextSyncAt')`,
      validationDatabase
    );
    if (prematureColumns.length) throw new Error('Schema pré-LR.2 contém colunas posteriores.');
    await legacy.$executeRawUnsafe(
      `INSERT INTO \`Project\` (
        \`name\`, \`responsibleTeam\`, \`githubOwner\`, \`githubRepo\`, \`githubUrl\`,
        \`githubAutoSyncEnabled\`, \`githubSyncStatus\`, \`accessCode\`, \`inviteLink\`,
        \`createdAt\`, \`updatedAt\`
      ) VALUES (?, ?, ?, ?, ?, true, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      'Projeto legado artificial',
      'Equipe artificial',
      'traceflow-artificial',
      'legacy-repository',
      'https://github.com/traceflow-artificial/legacy-repository',
      'SINCRONIZADO',
      'TRC-LR2-LEGACY-ARTIFICIAL',
      'https://legacy.invalid/join/TRC-LR2-LEGACY-ARTIFICIAL'
    );
    const [{ id: projectId }] = await legacy.$queryRawUnsafe(
      'SELECT `id` FROM `Project` WHERE `accessCode` = ?',
      'TRC-LR2-LEGACY-ARTIFICIAL'
    );
    await legacy.$executeRawUnsafe(
      'INSERT INTO `Commit` (`hash`, `branch`, `projectId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
      'lr2-artificial-hash',
      'main',
      projectId
    );
    const [{ id: commitId }] = await legacy.$queryRawUnsafe(
      'SELECT `id` FROM `Commit` WHERE `projectId` = ? AND `hash` = ?',
      projectId,
      'lr2-artificial-hash'
    );
    await legacy.$executeRawUnsafe(
      'INSERT INTO `GitBranch` (`projectId`, `name`, `isDefault`, `isActive`, `lastSeenAt`, `createdAt`, `updatedAt`) VALUES (?, ?, true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
      projectId,
      'main'
    );
    const [{ id: branchId }] = await legacy.$queryRawUnsafe(
      'SELECT `id` FROM `GitBranch` WHERE `projectId` = ? AND `name` = ?',
      projectId,
      'main'
    );
    await legacy.$executeRawUnsafe(
      'INSERT INTO `CommitBranch` (`commitId`, `branchId`) VALUES (?, ?)',
      commitId,
      branchId
    );
  } finally {
    await legacy.$disconnect();
  }

  copyMigration(lr2Migration);
  const blocked = spawnSync(prismaExecutable, ['migrate', 'deploy', '--schema', temporarySchema], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: guardUrl.toString() },
    encoding: 'utf8'
  });
  const blockedOutput = `${blocked.stderr || ''}\n${blocked.stdout || ''}`;
  if (
    blocked.status === 0 ||
    !blockedOutput.includes(lr2Migration) ||
    !blockedOutput.includes('1062') ||
    !/_LR2ProjectMemberContractGuard\.PRIMARY/i.test(blockedOutput)
  ) {
    throw new Error('A falha esperada do guard de ProjectMember LR.2 não foi comprovada.');
  }
  const guardCheck = new PrismaClient({ datasourceUrl: guardUrl.toString() });
  try {
    await assertDatabase(guardCheck, guardDatabase);
    await assertHistory(guardCheck, beforeLr2);
    const [{ members }] = await guardCheck.$queryRawUnsafe(
      'SELECT COUNT(*) AS `members` FROM `ProjectMember`'
    );
    const movementColumns = await guardCheck.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'TaskMovement' AND COLUMN_NAME = 'projectMemberId'`,
      guardDatabase
    );
    if (Number(members) !== 1 || movementColumns.length !== 1) {
      throw new Error('O guard LR.2 não preservou as estruturas legadas antes do contract.');
    }
  } finally {
    await guardCheck.$disconnect();
  }
  deploy(temporarySchema);

  const migrated = new PrismaClient({ datasourceUrl: targetUrl.toString() });
  try {
    await assertDatabase(migrated, validationDatabase);
    await assertHistory(migrated, [...beforeLr2, lr2Migration]);
    // Only a successful historical consolidation may precede modern migrations.
    for (const name of migrations.filter((name) => name > lr2Migration)) copyMigration(name);
    deploy(temporarySchema);
    await assertHistory(migrated, migrations);
    const beforeReapplication = await snapshot(migrated);
    deploy(temporarySchema);
    await assertHistory(migrated, migrations);
    if ((await snapshot(migrated)) !== beforeReapplication)
      throw new Error('Reaplicação alterou dados reconciliados LR.2.');
    const [integration] = await migrated.$queryRawUnsafe(
      `SELECT \`repositoryName\`, \`repositoryFullName\`, \`repositoryUrl\`, \`status\`,
              \`autoSyncEnabled\`, \`lastSyncStatus\`
       FROM \`ProjectGitHubIntegration\``
    );
    const removedTables = await migrated.$queryRawUnsafe(
      'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      validationDatabase,
      'ProjectMember'
    );
    const removedColumns = await migrated.$queryRawUnsafe(
      `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND (
         (TABLE_NAME = 'Project' AND COLUMN_NAME IN ('githubOwner', 'inviteLink')) OR
         (TABLE_NAME = 'Commit' AND COLUMN_NAME = 'branch') OR
         (TABLE_NAME = 'TaskMovement' AND COLUMN_NAME = 'projectMemberId')
       )`,
      validationDatabase
    );
    const [{ branchLinks }] = await migrated.$queryRawUnsafe(
      `SELECT COUNT(*) AS branchLinks FROM CommitBranch link
       INNER JOIN Commit c ON c.id = link.commitId
       INNER JOIN GitBranch b ON b.id = link.branchId
       INNER JOIN Project p ON p.id = c.projectId AND p.id = b.projectId
       WHERE c.hash = 'lr2-artificial-hash' AND b.name = 'main'
       AND p.accessCode = 'TRC-LR2-LEGACY-ARTIFICIAL'`
    );
    const [{ workers }] = await migrated.$queryRawUnsafe(
      'SELECT COUNT(*) AS workers FROM GitHubSchedulerWorker'
    );
    const schedules = await migrated.$queryRawUnsafe(
      'SELECT nextSyncAt, consecutiveSyncFailures FROM ProjectGitHubIntegration'
    );
    if (
      integration?.repositoryName !== 'legacy-repository' ||
      integration?.repositoryFullName !== 'traceflow-artificial/legacy-repository' ||
      integration?.repositoryUrl !== 'https://github.com/traceflow-artificial/legacy-repository' ||
      integration?.status !== 'RECONNECT_REQUIRED' ||
      !integration?.autoSyncEnabled ||
      integration?.lastSyncStatus !== 'SINCRONIZADO' ||
      removedTables.length !== 0 ||
      removedColumns.length !== 0 ||
      Number(branchLinks) !== 1 ||
      Number(workers) !== 0 ||
      schedules.length !== 1 ||
      schedules[0].nextSyncAt !== null ||
      schedules[0].consecutiveSyncFailures !== 0
    ) {
      throw new Error('A reconciliação LR.2 não preservou o estado artificial esperado.');
    }
    process.stdout.write(
      `${JSON.stringify({
        target: sanitizedDatabaseTarget(targetUrl.toString()),
        scenario: 'representative-legacy-data',
        migrations: 'ok',
        preLr2Migrations: beforeLr2.length,
        finalMigrations: migrations.length,
        reapplication: 'unchanged',
        projectMemberGuard: 'blocked-unreconciled-data-before-drop',
        integration: 'reconciled',
        branchLinks: Number(branchLinks),
        removedLegacyStructures: true
      })}\n`
    );
  } finally {
    await migrated.$disconnect();
  }
} finally {
  await assertDatabase(admin, sourceDatabase);
  if (guardCreated) await admin.$executeRawUnsafe(`DROP DATABASE \`${guardDatabase}\``);
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
