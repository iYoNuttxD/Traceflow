import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const lr9Migration = '20260824120000_lr9_github_oauth_app_decoupling';
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const validationDatabase = `${sourceDatabase}_lr9_lr8_validation`;
if (!/^[a-zA-Z0-9_]+_test_lr9_lr8_validation$/.test(validationDatabase)) {
  throw new Error('Nome de banco temporário LR.9 recusado.');
}

const validationUrl = new URL(sourceUrl);
validationUrl.pathname = `/${validationDatabase}`;
const databaseUrl = validationUrl.toString();
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const temporaryRoot = mkdtempSync(join(tmpdir(), 'traceflow-lr9-'));
const temporaryPrisma = join(temporaryRoot, 'prisma');
const temporaryMigrations = join(temporaryPrisma, 'migrations');
const temporarySchema = join(temporaryPrisma, 'schema.prisma');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaExecutable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
);
let created = false;

function deploy() {
  const result = spawnSync(prismaExecutable, ['migrate', 'deploy', '--schema', temporarySchema], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(
      `Validação LR.9 falhou ao aplicar migrations. ${result.stderr || result.stdout}`
    );
  }
}

async function preservedCounts(client) {
  const [
    installations,
    installationAuthorizations,
    integrations,
    commits,
    pullRequests,
    issues,
    branches,
    syncRuns
  ] = await Promise.all([
    client.gitHubInstallation.count(),
    client.gitHubInstallationAuthorization.count(),
    client.projectGitHubIntegration.count(),
    client.commit.count(),
    client.pullRequest.count(),
    client.issue.count(),
    client.gitBranch.count(),
    client.gitHubSyncRun.count()
  ]);
  return {
    installations,
    installationAuthorizations,
    integrations,
    commits,
    pullRequests,
    issues,
    branches,
    syncRuns
  };
}

async function seedLr8Representative(client) {
  const user = await client.user.create({
    data: {
      name: 'Pessoa artificial LR9',
      username: 'lr9_upgrade',
      email: 'lr9-upgrade@example.invalid',
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const installation = await client.gitHubInstallation.create({
    data: {
      githubInstallationId: 'lr9-installation',
      accountId: 'lr9-account',
      accountLogin: 'lr9-artificial',
      accountType: 'Organization',
      status: 'ACTIVE',
      installedAt: new Date()
    }
  });
  const authorization = await client.gitHubInstallationAuthorization.create({
    data: { installationId: installation.id, userId: user.id, verifiedAt: new Date() }
  });
  const project = await client.project.create({
    data: {
      name: 'Projeto upgrade LR9',
      responsibleTeam: 'Equipe artificial',
      accessCode: 'TRC-LR9-UPGRADE',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          installationId: installation.id,
          githubRepositoryId: 'lr9-repository',
          repositoryName: 'traceflow-lr9',
          repositoryFullName: 'artificial/traceflow-lr9',
          repositoryUrl: 'https://github.com/artificial/traceflow-lr9',
          defaultBranch: 'Feature/LR9',
          status: 'ACTIVE'
        }
      }
    }
  });
  await client.commit.create({ data: { projectId: project.id, hash: 'lr9-commit' } });
  await client.pullRequest.create({
    data: { projectId: project.id, githubId: 'lr9-pr', number: 9, title: 'LR9' }
  });
  await client.issue.create({
    data: { projectId: project.id, githubId: 'lr9-issue', number: 9, title: 'LR9' }
  });
  await client.gitBranch.create({
    data: { projectId: project.id, name: 'Feature/LR9', lastSeenAt: new Date() }
  });
  await client.gitHubSyncRun.create({
    data: { projectId: project.id, requestedByUserId: user.id, status: 'SUCCEEDED' }
  });

  const verifiedAt = new Date('2026-08-23T00:00:00.000Z');
  const expiresAt = new Date('2026-08-30T00:00:00.000Z');
  await client.$executeRawUnsafe(
    `UPDATE GitHubInstallationAuthorization
     SET repositoryAuthorizationVerifiedAt = ?, repositoryAuthorizationExpiresAt = ?
     WHERE id = ?`,
    verifiedAt,
    expiresAt,
    authorization.id
  );
  await client.$executeRawUnsafe(
    `INSERT INTO GitHubRepositoryAuthorization
      (installationId, userId, githubRepositoryId, repositoryFullName, permission,
       verifiedAt, expiresAt, createdAt, updatedAt)
     VALUES (?, ?, 'lr9-repository', 'artificial/traceflow-lr9', 'OWNER', ?, ?, NOW(3), NOW(3))`,
    installation.id,
    user.id,
    verifiedAt,
    expiresAt
  );
  await client.$executeRawUnsafe(
    `INSERT INTO GitHubOAuthState
      (tokenHash, purpose, rememberMe, expiresAt, createdAt)
     VALUES ('lr9-obsolete-state', 'REPOSITORY_AUTHORIZATION', false, ?, NOW(3))`,
    expiresAt
  );
}

try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length) throw new Error('Banco temporário LR.9 já existe; remova manualmente.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;

  mkdirSync(temporaryMigrations, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), temporarySchema);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(temporaryMigrations, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === lr9Migration) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(temporaryMigrations, entry.name), {
      recursive: true
    });
  }
  deploy();

  const beforeClient = new PrismaClient({ datasourceUrl: databaseUrl });
  let before;
  try {
    await seedLr8Representative(beforeClient);
    before = await preservedCounts(beforeClient);
  } finally {
    await beforeClient.$disconnect();
  }

  cpSync(join(sourcePrisma, 'migrations', lr9Migration), join(temporaryMigrations, lr9Migration), {
    recursive: true
  });
  deploy();

  const afterClient = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const after = await preservedCounts(afterClient);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error('LR.9 alterou contagens de instalação, integração, sync ou artefatos.');
    }
    const obsoleteTable = await afterClient.$queryRawUnsafe(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitHubRepositoryAuthorization'`
    );
    const obsoleteColumns = await afterClient.$queryRawUnsafe(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'GitHubInstallationAuthorization'
         AND COLUMN_NAME IN ('repositoryAuthorizationVerifiedAt', 'repositoryAuthorizationExpiresAt')`
    );
    const [purposeColumn] = await afterClient.$queryRawUnsafe(
      `SELECT COLUMN_TYPE AS columnType FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'GitHubOAuthState'
         AND COLUMN_NAME = 'purpose'`
    );
    if (obsoleteTable.length || obsoleteColumns.length) {
      throw new Error('LR.9 não removeu integralmente o snapshot pessoal obsoleto.');
    }
    if (String(purposeColumn?.columnType).includes('REPOSITORY_AUTHORIZATION')) {
      throw new Error('LR.9 não contraiu GitHubOAuthPurpose.');
    }
    process.stdout.write(
      `${JSON.stringify({ database: validationDatabase, baseline: 'LR.8 representative', preserved: after, obsoleteSnapshot: 'removed' })}\n`
    );
  } finally {
    await afterClient.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
