import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const lr5Migration = '20260821120000_lr5_gitbranch_case_sensitive';
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const names = {
  populated: `${sourceDatabase}_lr5_populated_validation`,
  historical: `${sourceDatabase}_lr5_historical_validation`
};
for (const name of Object.values(names)) {
  if (!/^[a-zA-Z0-9_]+_test_lr5_(?:populated|historical)_validation$/.test(name)) {
    throw new Error('Nome de banco temporário LR.5 recusado.');
  }
}

const urls = Object.fromEntries(
  Object.entries(names).map(([key, name]) => {
    const url = new URL(sourceUrl);
    url.pathname = `/${name}`;
    return [key, url.toString()];
  })
);
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const temporaryRoot = mkdtempSync(join(tmpdir(), 'traceflow-lr5-'));
const temporaryPrisma = join(temporaryRoot, 'prisma');
const temporaryMigrations = join(temporaryPrisma, 'migrations');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const temporarySchema = join(temporaryPrisma, 'schema.prisma');
const prismaExecutable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
);
const createdDatabases = [];

function deploy(databaseUrl) {
  const result = spawnSync(prismaExecutable, ['migrate', 'deploy', '--schema', temporarySchema], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(
      `Validação LR.5 falhou ao aplicar migrations. ${result.stderr || result.stdout}`
    );
  }
}

function assertMigrationStatus(databaseUrl) {
  const result = spawnSync(prismaExecutable, ['migrate', 'status', '--schema', temporarySchema], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
  if (result.status !== 0 || !/Database schema is up to date/i.test(result.stdout)) {
    throw new Error(
      `Status LR.5 não confirmou schema atualizado. ${result.stderr || result.stdout}`
    );
  }
}

async function branchPreflight(client) {
  const [column] = await client.$queryRawUnsafe(
    `SELECT COLLATION_NAME AS collation
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch' AND COLUMN_NAME = 'name'`
  );
  const [stats] = await client.$queryRawUnsafe(
    `SELECT COUNT(*) AS total,
            COUNT(DISTINCT CONCAT(projectId, 0x1f, BINARY name)) AS exactDistinct,
            COUNT(DISTINCT CONCAT(projectId, 0x1f, LOWER(name))) AS foldedDistinct
     FROM GitBranch`
  );
  return {
    collation: column?.collation,
    total: Number(stats.total),
    exactDistinct: Number(stats.exactDistinct),
    foldedDistinct: Number(stats.foldedDistinct)
  };
}

async function seedPopulated(client) {
  const user = await client.user.create({
    data: {
      name: 'Pessoa artificial LR5',
      username: 'lr5_populated',
      email: 'lr5-populated@example.invalid',
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const installation = await client.gitHubInstallation.create({
    data: {
      githubInstallationId: 'lr5-populated-installation',
      accountId: 'lr5-account',
      accountLogin: 'lr5-artificial',
      accountType: 'User',
      status: 'ACTIVE',
      installedAt: new Date()
    }
  });
  const project = await client.project.create({
    data: {
      name: 'Projeto populado LR5',
      responsibleTeam: 'Equipe artificial',
      accessCode: 'TRC-LR5-POPULATED',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      requirements: {
        create: { title: 'Requisito artificial', status: 'EM_IMPLEMENTACAO' }
      },
      githubIntegration: {
        create: {
          installationId: installation.id,
          githubRepositoryId: 'lr5-populated-repository',
          repositoryName: 'traceflow-lr5',
          repositoryFullName: 'artificial/traceflow-lr5',
          repositoryUrl: 'https://github.com/artificial/traceflow-lr5',
          defaultBranch: 'main',
          status: 'ACTIVE'
        }
      }
    },
    include: { requirements: true }
  });
  await client.task.create({
    data: {
      projectId: project.id,
      requirementId: project.requirements[0].id,
      title: 'Tarefa artificial LR5',
      responsibleUserId: user.id
    }
  });
  await client.privacyRequest.create({
    data: { userId: user.id, type: 'DATA_EXPORT', status: 'COMPLETED' }
  });
  await client.personalDataExport.create({
    data: {
      userId: user.id,
      status: 'COMPLETED',
      expiresAt: new Date('2099-01-01T00:00:00.000Z')
    }
  });
  const branch = await client.gitBranch.create({
    data: {
      projectId: project.id,
      name: 'main',
      isDefault: true,
      lastSeenAt: new Date()
    }
  });
  const commit = await client.commit.create({
    data: { projectId: project.id, hash: 'lr5-populated-commit' }
  });
  await client.commitBranch.create({ data: { commitId: commit.id, branchId: branch.id } });
  return { user, project };
}

async function seedHistorical(client) {
  const owner = await client.user.create({
    data: {
      name: 'Pessoa histórica LR5',
      username: 'lr5_historical',
      email: 'lr5-historical@example.invalid',
      passwordHash: 'artificial'
    }
  });
  const project = await client.project.create({
    data: {
      name: 'Projeto histórico LR5',
      responsibleTeam: 'Equipe artificial',
      accessCode: 'TRC-LR5-HISTORICAL',
      memberships: { create: { userId: owner.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          repositoryName: 'historical',
          repositoryFullName: 'artificial/historical',
          repositoryUrl: 'https://github.com/artificial/historical',
          defaultBranch: 'Release/Legacy',
          status: 'RECONNECT_REQUIRED'
        }
      }
    }
  });
  await client.projectInvitation.create({
    data: {
      projectId: project.id,
      email: 'invited-historical@example.invalid',
      role: 'VIEWER',
      tokenHash: 'lr5-historical-invitation-token',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      createdById: owner.id
    }
  });
  await client.privacyRequest.create({
    data: {
      userId: owner.id,
      type: 'ACCOUNT_DELETION',
      status: 'PENDING',
      scheduledFor: new Date('2099-01-01T00:00:00.000Z')
    }
  });
  const branch = await client.gitBranch.create({
    data: {
      projectId: project.id,
      name: 'Release/Legacy',
      isActive: false,
      firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
      lastSeenAt: new Date('2026-02-01T00:00:00.000Z'),
      inactiveAt: new Date('2026-03-01T00:00:00.000Z'),
      reactivatedAt: new Date('2026-02-15T00:00:00.000Z'),
      reactivationCount: 1
    }
  });
  const commit = await client.commit.create({
    data: { projectId: project.id, hash: 'lr5-historical-commit' }
  });
  await client.commitBranch.create({ data: { commitId: commit.id, branchId: branch.id } });
  return { owner, project, branch };
}

async function counts(client) {
  const [
    users,
    projects,
    memberships,
    tasks,
    requirements,
    commits,
    branches,
    branchLinks,
    integrations,
    privacyRequests,
    invitations
  ] = await Promise.all([
    client.user.count(),
    client.project.count(),
    client.projectMembership.count(),
    client.task.count(),
    client.requirement.count(),
    client.commit.count(),
    client.gitBranch.count(),
    client.commitBranch.count(),
    client.projectGitHubIntegration.count(),
    client.privacyRequest.count(),
    client.projectInvitation.count()
  ]);
  return {
    users,
    projects,
    memberships,
    tasks,
    requirements,
    commits,
    branches,
    branchLinks,
    integrations,
    privacyRequests,
    invitations
  };
}

try {
  for (const name of Object.values(names)) {
    const existing = await admin.$queryRawUnsafe(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      name
    );
    if (existing.length) throw new Error(`Banco temporário ${name} já existe; remova manualmente.`);
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\``);
    createdDatabases.push(name);
  }

  mkdirSync(temporaryMigrations, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), temporarySchema);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(temporaryMigrations, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === lr5Migration) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(temporaryMigrations, entry.name), {
      recursive: true
    });
  }
  deploy(urls.populated);
  deploy(urls.historical);
  assertMigrationStatus(urls.populated);
  assertMigrationStatus(urls.historical);

  const populated = new PrismaClient({ datasourceUrl: urls.populated });
  const historical = new PrismaClient({ datasourceUrl: urls.historical });
  let populatedFixture;
  let historicalFixture;
  let populatedBefore;
  let historicalBefore;
  let populatedPreflight;
  let historicalPreflight;
  try {
    populatedFixture = await seedPopulated(populated);
    historicalFixture = await seedHistorical(historical);
    populatedBefore = await counts(populated);
    historicalBefore = await counts(historical);
    populatedPreflight = await branchPreflight(populated);
    historicalPreflight = await branchPreflight(historical);
  } finally {
    await populated.$disconnect();
    await historical.$disconnect();
  }

  cpSync(join(sourcePrisma, 'migrations', lr5Migration), join(temporaryMigrations, lr5Migration), {
    recursive: true
  });
  deploy(urls.populated);
  deploy(urls.historical);

  const migratedPopulated = new PrismaClient({ datasourceUrl: urls.populated });
  const migratedHistorical = new PrismaClient({ datasourceUrl: urls.historical });
  try {
    const populatedAfter = await counts(migratedPopulated);
    const historicalAfter = await counts(migratedHistorical);
    if (JSON.stringify(populatedBefore) !== JSON.stringify(populatedAfter)) {
      throw new Error('A migration LR.5 alterou contagens no cenário populado.');
    }
    if (JSON.stringify(historicalBefore) !== JSON.stringify(historicalAfter)) {
      throw new Error('A migration LR.5 alterou contagens no cenário histórico.');
    }

    const namesByCase = ['Feature/Login', 'feature/login', 'FEATURE/LOGIN'];
    await migratedPopulated.gitBranch.createMany({
      data: namesByCase.map((name) => ({
        projectId: populatedFixture.project.id,
        name,
        lastSeenAt: new Date()
      }))
    });
    const caseBranches = await migratedPopulated.gitBranch.findMany({
      where: { projectId: populatedFixture.project.id, name: { in: namesByCase } }
    });
    if (caseBranches.length !== 3 || new Set(caseBranches.map(({ name }) => name)).size !== 3) {
      throw new Error('GitBranch não preservou as três variantes de caixa.');
    }
    for (const name of namesByCase) {
      const exact = await migratedPopulated.gitBranch.findUnique({
        where: { projectId_name: { projectId: populatedFixture.project.id, name } }
      });
      if (exact?.name !== name) throw new Error(`Busca exata de branch falhou para ${name}.`);
    }
    const sharedCommit = await migratedPopulated.commit.create({
      data: { projectId: populatedFixture.project.id, hash: 'lr5-shared-case-commit' }
    });
    await migratedPopulated.commitBranch.createMany({
      data: caseBranches.map((branch) => ({ commitId: sharedCommit.id, branchId: branch.id }))
    });
    const trace = await migratedPopulated.commit.findUnique({
      where: {
        projectId_hash: {
          projectId: populatedFixture.project.id,
          hash: sharedCommit.hash
        }
      },
      include: { branchLinks: { include: { branch: true } } }
    });
    if (trace.branchLinks.length !== 3) {
      throw new Error('A rastreabilidade CommitBranch não preservou as variantes de caixa.');
    }

    let foreignKeyBlocked = false;
    try {
      await migratedPopulated.projectMembership.create({
        data: {
          projectId: populatedFixture.project.id,
          userId: 2147483647,
          role: 'MEMBER'
        }
      });
    } catch (error) {
      foreignKeyBlocked = error?.code === 'P2003';
    }
    if (!foreignKeyBlocked) throw new Error('FK aceitou membership sem usuário.');

    let ownerAtomicityBlocked = false;
    try {
      await migratedPopulated.$transaction(async (tx) => {
        const ownerless = await tx.project.create({
          data: {
            name: 'Projeto sem owner LR5',
            responsibleTeam: 'Equipe artificial',
            accessCode: 'TRC-LR5-NO-OWNER'
          }
        });
        await tx.projectMembership.create({
          data: { projectId: ownerless.id, userId: 2147483647, role: 'OWNER' }
        });
      });
    } catch (error) {
      ownerAtomicityBlocked = error?.code === 'P2003';
    }
    const ownerlessProject = await migratedPopulated.project.findUnique({
      where: { accessCode: 'TRC-LR5-NO-OWNER' }
    });
    if (!ownerAtomicityBlocked || ownerlessProject) {
      throw new Error('A criação atômica permitiu projeto sem OWNER válido.');
    }

    const historicalBranch = await migratedHistorical.gitBranch.findUnique({
      where: { id: historicalFixture.branch.id }
    });
    if (
      historicalBranch?.name !== 'Release/Legacy' ||
      historicalBranch.isActive !== false ||
      historicalBranch.reactivationCount !== 1
    ) {
      throw new Error('O estado histórico de GitBranch não foi preservado.');
    }
    const populatedAudit = await branchPreflight(migratedPopulated);
    const historicalAudit = await branchPreflight(migratedHistorical);
    if (populatedAudit.collation !== 'utf8mb4_bin' || historicalAudit.collation !== 'utf8mb4_bin') {
      throw new Error('A collation final de GitBranch.name não é utf8mb4_bin.');
    }

    process.stdout.write(
      `${JSON.stringify({
        target: sanitizedDatabaseTarget(sourceUrl),
        scenarios: {
          populated: {
            preflight: populatedPreflight,
            preserved: populatedBefore,
            finalCollation: populatedAudit.collation,
            caseVariants: namesByCase.length,
            traceLinks: trace.branchLinks.length,
            foreignKeyGuard: 'blocked-membership-without-user',
            ownerAtomicity: 'rolled-back-project-without-valid-owner',
            migrationStatus: 'up-to-date'
          },
          historical: {
            preflight: historicalPreflight,
            preserved: historicalBefore,
            finalCollation: historicalAudit.collation,
            branchState: 'inactive-history-preserved',
            migrationStatus: 'up-to-date'
          }
        }
      })}\n`
    );
  } finally {
    await migratedPopulated.$disconnect();
    await migratedHistorical.$disconnect();
  }
} finally {
  for (const name of createdDatabases.reverse()) {
    await admin.$executeRawUnsafe(`DROP DATABASE \`${name}\``);
  }
  await admin.$disconnect();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
