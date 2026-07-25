import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';
import { legacyTableExists } from '../../scripts/lib/e8-legacy-data.js';
import { runE8Reconciliation } from '../../scripts/lib/e8-reconciliation.js';
import { auditE8Contract, runE8Contract } from '../../scripts/lib/e8-contract.js';

let prisma;
const noConsumers = { taskPullRequest: 0, githubArtifact: 0, traceLink: 0 };

async function createLegacyTables() {
  await prisma.$executeRawUnsafe('CREATE TABLE `TaskPullRequest` (`id` INTEGER NOT NULL AUTO_INCREMENT, `taskId` INTEGER NOT NULL, `pullRequestId` INTEGER NOT NULL, PRIMARY KEY (`id`))');
  await prisma.$executeRawUnsafe('CREATE TABLE `GithubArtifact` (`id` INTEGER NOT NULL AUTO_INCREMENT, `projectId` INTEGER NOT NULL, `type` VARCHAR(191) NOT NULL, `externalId` VARCHAR(191) NULL, `sha` VARCHAR(191) NULL, `title` VARCHAR(191) NULL, `description` TEXT NULL, `author` VARCHAR(191) NULL, `status` VARCHAR(191) NULL, `branch` VARCHAR(191) NULL, `url` VARCHAR(191) NULL, `createdAtGithub` DATETIME(3) NULL, `closedAtGithub` DATETIME(3) NULL, PRIMARY KEY (`id`))');
  await prisma.$executeRawUnsafe('CREATE TABLE `TraceLink` (`id` INTEGER NOT NULL AUTO_INCREMENT, `projectId` INTEGER NOT NULL, `sourceType` VARCHAR(191) NOT NULL, `sourceId` INTEGER NOT NULL, `targetType` VARCHAR(191) NOT NULL, `targetId` INTEGER NOT NULL, PRIMARY KEY (`id`))');
}

async function dropLegacyTables() {
  for (const table of ['TaskPullRequest', 'GithubArtifact', 'TraceLink']) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
  }
}

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
});
beforeEach(async () => { await cleanTestDatabase(prisma); await dropLegacyTables(); await createLegacyTables(); });
afterEach(async () => { await dropLegacyTables(); await cleanTestDatabase(prisma); });
afterAll(async () => { await prisma.$disconnect(); });

describe('E8 reconciliação e contract definitivos', () => {
  it('schema migrado do zero não mantém os três models legados', async () => {
    await dropLegacyTables();
    expect(await legacyTableExists(prisma, 'TaskPullRequest')).toBe(false);
    expect(await legacyTableExists(prisma, 'GithubArtifact')).toBe(false);
    expect(await legacyTableExists(prisma, 'TraceLink')).toBe(false);
  });

  it('reconcilia TaskPullRequest singular e permanece idempotente', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    const pullRequest = await prisma.pullRequest.create({ data: { projectId: project.id, githubId: 'pr-1', number: 1, title: 'PR' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    await prisma.$executeRawUnsafe('INSERT INTO `TaskPullRequest` (`taskId`, `pullRequestId`) VALUES (?, ?)', task.id, pullRequest.id);
    expect((await runE8Reconciliation({ client: prisma })).pending.taskPullRequests).toBe(1);
    await runE8Reconciliation({ client: prisma, apply: true });
    expect((await prisma.task.findUnique({ where: { id: task.id } })).pullRequestId).toBe(pullRequest.id);
    expect((await runE8Reconciliation({ client: prisma, apply: true })).pending.taskPullRequests).toBe(0);
  });

  it('detecta múltiplas PRs e bloqueia contract sem escolher vínculo', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    for (const number of [1, 2]) {
      const pullRequest = await prisma.pullRequest.create({ data: { projectId: project.id, githubId: `pr-${number}`, number, title: `PR ${number}` } });
      await prisma.$executeRawUnsafe('INSERT INTO `TaskPullRequest` (`taskId`, `pullRequestId`) VALUES (?, ?)', task.id, pullRequest.id);
    }
    const reconciliation = await runE8Reconciliation({ client: prisma, apply: true });
    expect(reconciliation.unresolved.taskPullRequests.conflicts).toBe(1);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).pullRequestId).toBeNull();
    await expect(runE8Contract({ client: prisma, apply: true, consumers: noConsumers })).rejects.toMatchObject({ code: 'E8_CONTRACT_BLOCKED' });
  });

  it('reconcilia GithubArtifact correspondente e convertível sem expor conteúdo', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    await prisma.commit.create({ data: { projectId: project.id, hash: 'existente' } });
    await prisma.$executeRawUnsafe('INSERT INTO `GithubArtifact` (`projectId`, `type`, `sha`, `author`) VALUES (?, ?, ?, ?), (?, ?, ?, ?)', project.id, 'COMMIT', 'existente', 'PII proibida', project.id, 'COMMIT', 'novo', 'Outra PII');
    const first = await runE8Reconciliation({ client: prisma, apply: true });
    expect(first.before.artifacts).toMatchObject({ matchedCommit: 1, convertibleCommit: 1, exclusiveRecords: 0 });
    expect(await prisma.commit.findUnique({ where: { projectId_hash: { projectId: project.id, hash: 'novo' } } })).not.toBeNull();
    const second = await runE8Reconciliation({ client: prisma, apply: true });
    expect(second.pending.githubArtifacts).toBe(0);
    expect(JSON.stringify(second)).not.toContain('PII proibida');
  });

  it('detecta GithubArtifact ambíguo e TraceLink desconhecido', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    await prisma.pullRequest.create({ data: { projectId: project.id, githubId: '1', number: 2, title: 'PR A' } });
    await prisma.pullRequest.create({ data: { projectId: project.id, githubId: 'outro', number: 1, title: 'PR B' } });
    await prisma.$executeRawUnsafe('INSERT INTO `GithubArtifact` (`projectId`, `type`, `externalId`) VALUES (?, ?, ?)', project.id, 'PR', '1');
    await prisma.$executeRawUnsafe('INSERT INTO `TraceLink` (`projectId`, `sourceType`, `sourceId`, `targetType`, `targetId`) VALUES (?, ?, ?, ?, ?)', project.id, 'CUSTOM', 1, 'OTHER', 2);
    const audit = await auditE8Contract({ client: prisma, consumers: noConsumers });
    expect(audit.models.githubArtifact.removable).toBe(false);
    expect(audit.models.traceLink.removable).toBe(false);
  });

  it('materializa TraceLink reconhecido e libera contract idempotente', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    const commit = await prisma.commit.create({ data: { projectId: project.id, hash: 'hash' } });
    await prisma.$executeRawUnsafe('INSERT INTO `TraceLink` (`projectId`, `sourceType`, `sourceId`, `targetType`, `targetId`) VALUES (?, ?, ?, ?, ?)', project.id, 'TASK', task.id, 'COMMIT', commit.id);
    await runE8Reconciliation({ client: prisma, apply: true });
    expect(await prisma.taskCommit.findUnique({ where: { taskId_commitId: { taskId: task.id, commitId: commit.id } } })).not.toBeNull();
    expect((await auditE8Contract({ client: prisma, consumers: noConsumers })).allowed).toBe(true);
    await runE8Contract({ client: prisma, apply: true, consumers: noConsumers });
    expect((await auditE8Contract({ client: prisma, consumers: noConsumers })).allowed).toBe(true);
    expect(await prisma.task.count()).toBe(1);
    expect(await prisma.commit.count()).toBe(1);
    expect(await prisma.taskCommit.count()).toBe(1);
  });
});
