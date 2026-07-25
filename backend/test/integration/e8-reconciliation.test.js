import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';
import { runE8Reconciliation } from '../../scripts/lib/e8-reconciliation.js';

let prisma;

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
});

beforeEach(async () => cleanTestDatabase(prisma));
afterAll(async () => { await cleanTestDatabase(prisma); await prisma.$disconnect(); });

describe('E8 backfill expand/switch', () => {
  it('reconcilia dados legados de forma transacional e idempotente sem apagar origem', async () => {
    const user = await prisma.user.create({ data: { name: 'Pessoa Artificial', email: 'pessoa@example.invalid', passwordHash: 'fixture-only' } });
    const project = await prisma.project.create({ data: { name: 'Projeto legado', responsibleTeam: 'Equipe', githubOwner: 'owner', githubRepo: 'repo', githubUrl: 'https://github.com/owner/repo' } });
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: user.id, role: 'MEMBER' } });
    const member = await prisma.projectMember.create({ data: { projectId: project.id, name: 'Pessoa Artificial', email: 'pessoa@example.invalid' } });
    const pullRequest = await prisma.pullRequest.create({ data: { projectId: project.id, githubId: 'pr-1', number: 1, title: 'PR artificial' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa artificial', responsible: 'Pessoa Artificial', pullRequestId: pullRequest.id } });
    await prisma.taskMovement.create({ data: { projectId: project.id, taskId: task.id, fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO', movedBy: 'Pessoa Artificial', projectMemberId: member.id } });

    const dryRun = await runE8Reconciliation({ client: prisma });
    expect(dryRun.pending).toMatchObject({ legacyMemberships: 0, projectCanonicalFields: 1, responsibleUsers: 1, movedByUsers: 1, taskPullRequests: 1, traceLinks: 0 });
    expect(await prisma.taskPullRequest.count()).toBe(0);

    const applied = await runE8Reconciliation({ client: prisma, apply: true });
    expect(applied.after.counts.taskPullRequest).toBe(1);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ responsible: 'Pessoa Artificial', responsibleUserId: user.id, pullRequestId: pullRequest.id });
    expect(await prisma.taskMovement.findFirst({ where: { taskId: task.id } })).toMatchObject({ movedBy: 'Pessoa Artificial', movedByUserId: user.id, projectMemberId: member.id });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toMatchObject({ githubRepo: 'repo', githubRepositoryName: 'repo', githubRepositoryFullName: 'owner/repo' });

    const secondRun = await runE8Reconciliation({ client: prisma, apply: true });
    expect(secondRun.pending).toEqual({ legacyMemberships: 0, projectCanonicalFields: 0, responsibleUsers: 0, movedByUsers: 0, taskPullRequests: 0, traceLinks: 0 });
    expect(await prisma.taskPullRequest.count()).toBe(1);
    expect(await prisma.projectMember.count()).toBe(1);
  });

  it('mantém artefato ao excluir tarefa e remove somente o join canônico', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    const pullRequest = await prisma.pullRequest.create({ data: { projectId: project.id, githubId: 'pr-2', number: 2, title: 'PR preservada' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    await prisma.taskPullRequest.create({ data: { taskId: task.id, pullRequestId: pullRequest.id } });
    await prisma.task.delete({ where: { id: task.id } });
    expect(await prisma.taskPullRequest.count()).toBe(0);
    expect(await prisma.pullRequest.findUnique({ where: { id: pullRequest.id } })).not.toBeNull();
  });

  it('materializa TraceLink suportado, preserva legado e reporta GithubArtifact sem PII', async () => {
    const project = await prisma.project.create({ data: { name: 'Projeto', responsibleTeam: 'Equipe' } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa' } });
    const commit = await prisma.commit.create({ data: { projectId: project.id, hash: 'hash-artificial' } });
    await prisma.githubArtifact.create({ data: { projectId: project.id, type: 'COMMIT', externalId: 'hash-artificial', sha: 'hash-artificial', author: 'Dado que não pode sair no relatório' } });
    await prisma.traceLink.create({ data: { projectId: project.id, sourceType: 'TASK', sourceId: task.id, targetType: 'COMMIT', targetId: commit.id } });

    const first = await runE8Reconciliation({ client: prisma, apply: true });
    expect(first.before.artifacts).toMatchObject({ matchedCommit: 1, unmatched: 0 });
    expect(await prisma.taskCommit.findUnique({ where: { taskId_commitId: { taskId: task.id, commitId: commit.id } } })).not.toBeNull();
    expect(await prisma.traceLink.count()).toBe(1);

    const second = await runE8Reconciliation({ client: prisma, apply: true });
    expect(second.pending.traceLinks).toBe(0);
    expect(JSON.stringify(second)).not.toContain('Dado que não pode sair');
  });
});
