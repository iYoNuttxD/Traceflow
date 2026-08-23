import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './lib/database-safety.js';
import { runLr2LegacyRecovery } from './lib/lr2-legacy-recovery.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const lr2Migration = '20260820120000_lr2_contract_legacy_consolidation';
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const databaseNames = {
  success: `${sourceDatabase}_lr2_recovery_success`,
  unresolved: `${sourceDatabase}_lr2_recovery_unresolved`
};
for (const databaseName of Object.values(databaseNames)) {
  if (!/^[a-zA-Z0-9_]+_test_lr2_recovery_(success|unresolved)$/.test(databaseName)) {
    throw new Error('Nome do banco temporário LR.2.1 recusado.');
  }
}

function databaseUrl(databaseName) {
  const url = new URL(sourceUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

const urls = {
  success: databaseUrl(databaseNames.success),
  unresolved: databaseUrl(databaseNames.unresolved)
};
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const temporaryRoot = mkdtempSync(join(tmpdir(), 'traceflow-lr2-recovery-'));
const temporaryPrisma = join(temporaryRoot, 'prisma');
const temporaryMigrations = join(temporaryPrisma, 'migrations');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const temporarySchema = join(temporaryPrisma, 'schema.prisma');
const prismaCli = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
const createdDatabases = [];

function prismaCommand(args, targetUrl) {
  return spawnSync(process.execPath, [prismaCli, ...args, '--schema', temporarySchema], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: targetUrl },
    encoding: 'utf8'
  });
}

function deploy(targetUrl) {
  const result = prismaCommand(['migrate', 'deploy'], targetUrl);
  if (result.status !== 0) {
    throw new Error(`Falha ao aplicar migrations no E2E LR.2.1. ${result.stderr || result.stdout}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedProject(client, accessCode) {
  await client.$executeRawUnsafe(
    `INSERT INTO Project
      (name, responsibleTeam, accessCode, createdAt, updatedAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    'Projeto artificial LR.2.1',
    'Equipe artificial',
    accessCode
  );
  const [{ id }] = await client.$queryRawUnsafe(
    'SELECT id FROM Project WHERE accessCode = ?',
    accessCode
  );
  return id;
}

async function seedTaskAndMovement(client, { projectId, projectMemberId, movedBy }) {
  await client.$executeRawUnsafe(
    `INSERT INTO Task (projectId, title, status, createdAt, updatedAt)
     VALUES (?, ?, 'A_FAZER', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    projectId,
    'Tarefa artificial LR.2.1'
  );
  const [{ id: taskId }] = await client.$queryRawUnsafe(
    'SELECT id FROM Task WHERE projectId = ? ORDER BY id DESC LIMIT 1',
    projectId
  );
  await client.$executeRawUnsafe(
    `INSERT INTO TaskMovement
      (projectId, taskId, fromStatus, toStatus, movedBy, projectMemberId, movedAt, createdAt)
     VALUES (?, ?, 'A_FAZER', 'EM_ANDAMENTO', ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    projectId,
    taskId,
    movedBy,
    projectMemberId
  );
  const [{ id: movementId }] = await client.$queryRawUnsafe(
    'SELECT id FROM TaskMovement WHERE taskId = ? ORDER BY id DESC LIMIT 1',
    taskId
  );
  return { taskId, movementId };
}

async function seedRecoverable(client) {
  const projectId = await seedProject(client, 'TRC-LR2-RECOVERY-SUCCESS');
  await client.$executeRawUnsafe(
    `UPDATE Project
     SET githubOwner = ?, githubRepo = ?, githubUrl = ?,
         githubAutoSyncEnabled = true, githubSyncStatus = ?
     WHERE id = ?`,
    'traceflow-artificial',
    'lr2-recovery-repository',
    'https://github.com/traceflow-artificial/lr2-recovery-repository',
    'SINCRONIZADO',
    projectId
  );
  await client.$executeRawUnsafe(
    `INSERT INTO User (name, email, username, updatedAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))`,
    'Pessoa artificial LR.2.1',
    'lr2-recovery-success@example.invalid',
    'lr2-recovery-success'
  );
  const [{ id: userId }] = await client.$queryRawUnsafe(
    'SELECT id FROM User WHERE username = ?',
    'lr2-recovery-success'
  );
  await client.$executeRawUnsafe(
    `INSERT INTO ProjectMember
      (projectId, name, email, role, isActive, joinedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, 'GERENTE', true, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    projectId,
    'Pessoa artificial LR.2.1',
    'LR2-Recovery-Success@example.invalid',
    new Date('2026-01-02T03:04:05.000Z')
  );
  const [{ id: projectMemberId }] = await client.$queryRawUnsafe(
    'SELECT id FROM ProjectMember WHERE projectId = ?',
    projectId
  );
  const { taskId, movementId } = await seedTaskAndMovement(client, {
    projectId,
    projectMemberId,
    movedBy: 'Snapshot artificial'
  });
  await client.$executeRawUnsafe(
    `INSERT INTO Commit (hash, branch, projectId, createdAt, updatedAt)
     VALUES (?, 'main', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    'lr2-recovery-artificial-hash',
    projectId
  );
  const [{ id: commitId }] = await client.$queryRawUnsafe(
    'SELECT id FROM Commit WHERE projectId = ? AND hash = ?',
    projectId,
    'lr2-recovery-artificial-hash'
  );
  await client.$executeRawUnsafe(
    `INSERT INTO GitBranch
      (projectId, name, isDefault, isActive, lastSeenAt, createdAt, updatedAt)
     VALUES (?, 'main', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    projectId
  );
  const [{ id: branchId }] = await client.$queryRawUnsafe(
    "SELECT id FROM GitBranch WHERE projectId = ? AND name = 'main'",
    projectId
  );
  await client.$executeRawUnsafe(
    'INSERT INTO CommitBranch (commitId, branchId) VALUES (?, ?)',
    commitId,
    branchId
  );
  return { projectId, userId, taskId, movementId, commitId, branchId };
}

async function seedUnresolved(client) {
  const projectId = await seedProject(client, 'TRC-LR2-RECOVERY-UNRESOLVED');
  await client.$executeRawUnsafe(
    `INSERT INTO ProjectMember
      (projectId, name, email, role, isActive, joinedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, 'MEMBRO', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    projectId,
    'Pessoa sem identidade canônica',
    'lr2-recovery-unresolved@example.invalid'
  );
  const [{ id: projectMemberId }] = await client.$queryRawUnsafe(
    'SELECT id FROM ProjectMember WHERE projectId = ?',
    projectId
  );
  const { movementId } = await seedTaskAndMovement(client, {
    projectId,
    projectMemberId,
    movedBy: 'Snapshot não resolvido'
  });
  return { projectId, projectMemberId, movementId };
}

try {
  for (const databaseName of Object.values(databaseNames)) {
    const existing = await admin.$queryRawUnsafe(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      databaseName
    );
    if (existing.length) throw new Error(`Banco temporário LR.2.1 já existe: ${databaseName}.`);
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${databaseName}\``);
    createdDatabases.push(databaseName);
  }

  mkdirSync(temporaryMigrations, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), temporarySchema);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(temporaryMigrations, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === lr2Migration) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(temporaryMigrations, entry.name), {
      recursive: true
    });
  }
  deploy(urls.success);
  deploy(urls.unresolved);

  const successClient = new PrismaClient({ datasourceUrl: urls.success });
  let recoverable;
  try {
    recoverable = await seedRecoverable(successClient);
    const dryRun = await runLr2LegacyRecovery({ client: successClient });
    assert(dryRun.status === 'READY_TO_APPLY', 'Dry-run não identificou recovery aplicável.');
    assert(dryRun.guardPreflight.verdict === 'BLOCKED', 'Preflight não detectou legado.');
    assert(
      dryRun.guardPreflight.commitBranchMismatches === 0 &&
        dryRun.guardPreflight.githubIntegrationMismatches === 0,
      'Preflight encontrou blocker LR.2 fora da fixture de pessoa.'
    );
    assert(dryRun.counts.membershipsToCreate === 1, 'Dry-run não planejou a associação.');
    assert(dryRun.counts.movementActorsToSet === 1, 'Dry-run não planejou o ator canônico.');
    assert(dryRun.counts.unresolved === 0, 'Dry-run encontrou bloqueio inesperado.');

    const applied = await runLr2LegacyRecovery({ client: successClient, apply: true });
    assert(applied.status === 'SAFE_TO_CONTRACT', 'Apply não liberou o contract.');
    assert(
      applied.postRecoveryGuardPreflight?.verdict === 'SAFE_TO_CONTRACT',
      'Preflight pós-recovery não ficou verde.'
    );

    const zeroDryRun = await runLr2LegacyRecovery({ client: successClient });
    assert(zeroDryRun.status === 'SAFE_TO_CONTRACT', 'Dry-run pós-recovery não ficou verde.');
    assert(zeroDryRun.counts.projectMembers === 0, 'Dry-run pós-recovery ainda encontrou membro.');
    assert(
      zeroDryRun.counts.movementReferences === 0,
      'Dry-run pós-recovery ainda encontrou referência.'
    );

    const idempotentApply = await runLr2LegacyRecovery({ client: successClient, apply: true });
    assert(idempotentApply.status === 'SAFE_TO_CONTRACT', 'Segundo apply não foi idempotente.');
    assert(idempotentApply.counts.projectMembers === 0, 'Segundo apply não foi no-op.');
  } finally {
    await successClient.$disconnect();
  }

  const unresolvedClient = new PrismaClient({ datasourceUrl: urls.unresolved });
  let unresolved;
  try {
    unresolved = await seedUnresolved(unresolvedClient);
    const dryRun = await runLr2LegacyRecovery({ client: unresolvedClient });
    assert(dryRun.status === 'BLOCKED', 'Fixture irresolúvel não bloqueou o dry-run.');
    assert(
      dryRun.blockerCounts.CANONICAL_USER_NOT_FOUND === 1,
      'Fixture irresolúvel não informou a causa esperada.'
    );
    const apply = await runLr2LegacyRecovery({ client: unresolvedClient, apply: true });
    assert(apply.status === 'BLOCKED', 'Fixture irresolúvel não abortou o apply.');
    const [preserved] = await unresolvedClient.$queryRawUnsafe(
      `SELECT pm.id AS memberId, tm.projectMemberId, tm.movedByUserId
       FROM ProjectMember pm
       INNER JOIN TaskMovement tm ON tm.projectMemberId = pm.id
       WHERE pm.id = ? AND tm.id = ?`,
      unresolved.projectMemberId,
      unresolved.movementId
    );
    assert(
      preserved?.memberId === unresolved.projectMemberId &&
        preserved?.projectMemberId === unresolved.projectMemberId &&
        preserved?.movedByUserId === null,
      'Apply bloqueado alterou dados irresolúveis.'
    );
  } finally {
    await unresolvedClient.$disconnect();
  }

  cpSync(join(sourcePrisma, 'migrations', lr2Migration), join(temporaryMigrations, lr2Migration), {
    recursive: true
  });
  deploy(urls.success);
  const status = prismaCommand(['migrate', 'status'], urls.success);
  assert(status.status === 0, `migrate status falhou. ${status.stderr || status.stdout}`);

  const migratedClient = new PrismaClient({ datasourceUrl: urls.success });
  try {
    const [project] = await migratedClient.$queryRawUnsafe(
      'SELECT accessCode FROM Project WHERE id = ?',
      recoverable.projectId
    );
    const [membership] = await migratedClient.$queryRawUnsafe(
      `SELECT projectId, userId, role, isActive, joinedAt
       FROM ProjectMembership WHERE projectId = ? AND userId = ?`,
      recoverable.projectId,
      recoverable.userId
    );
    const [movement] = await migratedClient.$queryRawUnsafe(
      'SELECT projectId, taskId, movedByUserId FROM TaskMovement WHERE id = ?',
      recoverable.movementId
    );
    const [commitBranch] = await migratedClient.$queryRawUnsafe(
      `SELECT commitId, branchId FROM CommitBranch
       WHERE commitId = ? AND branchId = ?`,
      recoverable.commitId,
      recoverable.branchId
    );
    const [integration] = await migratedClient.$queryRawUnsafe(
      `SELECT repositoryName, repositoryFullName, repositoryUrl, autoSyncEnabled
       FROM ProjectGitHubIntegration WHERE projectId = ?`,
      recoverable.projectId
    );
    const legacyTables = await migratedClient.$queryRawUnsafe(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ProjectMember'`
    );
    const legacyColumns = await migratedClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'TaskMovement' AND COLUMN_NAME = 'projectMemberId'`
    );
    assert(
      project?.accessCode === 'TRC-LR2-RECOVERY-SUCCESS',
      'Contract não preservou o projeto/access code.'
    );
    assert(
      membership?.projectId === recoverable.projectId &&
        membership?.userId === recoverable.userId &&
        membership?.role === 'MANAGER' &&
        Boolean(membership?.isActive),
      'Contract não preservou a associação canônica.'
    );
    assert(
      movement?.projectId === recoverable.projectId &&
        movement?.taskId === recoverable.taskId &&
        movement?.movedByUserId === recoverable.userId,
      'Contract não preservou o ator canônico do movimento.'
    );
    assert(
      commitBranch?.commitId === recoverable.commitId &&
        commitBranch?.branchId === recoverable.branchId,
      'Contract não preservou o vínculo canônico de branch.'
    );
    assert(
      integration?.repositoryName === 'lr2-recovery-repository' &&
        integration?.repositoryFullName === 'traceflow-artificial/lr2-recovery-repository' &&
        integration?.repositoryUrl ===
          'https://github.com/traceflow-artificial/lr2-recovery-repository' &&
        Boolean(integration?.autoSyncEnabled),
      'Contract não preservou a integração GitHub canônica.'
    );
    assert(legacyTables.length === 0 && legacyColumns.length === 0, 'Contract reteve legado.');

    const canonicalNoOp = await runLr2LegacyRecovery({ client: migratedClient });
    assert(canonicalNoOp.status === 'ALREADY_CANONICAL', 'Banco canônico não resultou em no-op.');
    const canonicalApplyNoOp = await runLr2LegacyRecovery({ client: migratedClient, apply: true });
    assert(
      canonicalApplyNoOp.status === 'ALREADY_CANONICAL',
      'Apply em banco canônico não resultou em no-op.'
    );
  } finally {
    await migratedClient.$disconnect();
  }

  const blockedMigration = prismaCommand(['migrate', 'deploy'], urls.unresolved);
  assert(blockedMigration.status !== 0, 'Guard LR.2 aceitou fixture irresolúvel.');
  const guardClient = new PrismaClient({ datasourceUrl: urls.unresolved });
  try {
    const [{ members }] = await guardClient.$queryRawUnsafe(
      'SELECT COUNT(*) AS members FROM ProjectMember'
    );
    const [{ references }] = await guardClient.$queryRawUnsafe(
      'SELECT COUNT(*) AS `references` FROM TaskMovement WHERE projectMemberId IS NOT NULL'
    );
    assert(Number(members) === 1 && Number(references) === 1, 'Guard LR.2 perdeu legado.');
  } finally {
    await guardClient.$disconnect();
  }

  process.stdout.write(
    `${JSON.stringify({
      target: sanitizedDatabaseTarget(sourceUrl),
      scenario: 'lr2.1-pre-contract-recovery',
      guardPreflight: 'blocked-before-recovery',
      dryRun: 'reconcilable-counts-confirmed',
      apply: 'atomic-and-safe-to-contract',
      secondDryRun: 'zero-residue',
      secondApply: 'idempotent-no-op',
      lr2Migration: 'applied-after-recovery',
      migrateStatus: 'up-to-date',
      canonicalData: 'preserved',
      unresolvedFixture: 'blocked-without-loss',
      canonicalDatabase: 'dry-run-and-apply-no-op'
    })}\n`
  );
} finally {
  for (const databaseName of createdDatabases.reverse()) {
    await admin.$executeRawUnsafe(`DROP DATABASE \`${databaseName}\``);
  }
  await admin.$disconnect();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
