import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../prisma/migrations/20261017100000_task_artifact_link_periods/migration.sql'
);

let prisma;
let taskIssueService;
let pullRequestLinkService;
let taskCrudService;
let githubRepositoryEventsRepository;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskIssueService } = await import('../../src/modules/tasks/services/task-issue.service.js'));
  ({ pullRequestLinkService } =
    await import('../../src/modules/tasks/services/task-pull-request.service.js'));
  ({ taskCrudService } = await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function scenario() {
  sequence += 1;
  const project = await createProject(prisma);
  const actor = await prisma.user.create({
    data: {
      name: `Pessoa dos vínculos ${sequence}`,
      username: `r2vinculo${sequence}`,
      email: `r2-vinculo-${sequence}@example.invalid`
    }
  });
  const task = await createTask(prisma, project.id);
  return { project, task, context: { actorUserId: actor.id, requestId: `r2-vinculo-${sequence}` } };
}

const periodsOf = (taskId) =>
  prisma.taskArtifactLinkPeriod.findMany({
    where: { taskId },
    orderBy: { id: 'asc' },
    select: { issueId: true, pullRequestId: true, linkedAt: true, unlinkedAt: true }
  });

describe('ADR-023 D4 — período de cada vínculo', () => {
  it('V-01 vincular uma issue abre um período com a data do vínculo', async () => {
    const { project, task, context } = await scenario();
    const issue = await createIssue(prisma, project.id);

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context);

    const link = await prisma.taskIssue.findFirst({ where: { taskId: task.id } });
    expect(await periodsOf(task.id)).toEqual([
      { issueId: issue.id, pullRequestId: null, linkedAt: link.createdAt, unlinkedAt: null }
    ]);
  });

  it('V-02 desvincular a issue fecha o período, e vincular de novo abre outro', async () => {
    const { project, task, context } = await scenario();
    const issue = await createIssue(prisma, project.id);
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context);

    await taskIssueService.unlinkIssue(task.id, issue.id, context);
    const afterUnlink = await periodsOf(task.id);
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context);
    const periods = await periodsOf(task.id);

    expect(afterUnlink).toHaveLength(1);
    expect(afterUnlink[0].unlinkedAt).toBeInstanceOf(Date);
    expect(afterUnlink[0].unlinkedAt.getTime()).toBeGreaterThanOrEqual(
      afterUnlink[0].linkedAt.getTime() - 5
    );
    expect(periods).toHaveLength(2);
    expect(periods[1]).toMatchObject({ issueId: issue.id, unlinkedAt: null });
  });

  it('V-03 trocar a PR fecha o período anterior e abre o novo; limpar fecha o último', async () => {
    const { project, task, context } = await scenario();
    const first = await createPullRequest(prisma, project.id);
    const second = await createPullRequest(prisma, project.id);

    await pullRequestLinkService.linkPullRequest(task.id, { pullRequestId: first.id }, context);
    await pullRequestLinkService.linkPullRequest(task.id, { pullRequestId: first.id }, context);
    await pullRequestLinkService.linkPullRequest(task.id, { pullRequestId: second.id }, context);
    const switched = await periodsOf(task.id);
    await pullRequestLinkService.unlinkPullRequest(task.id, context);
    const cleared = await periodsOf(task.id);

    expect(switched.map((period) => [period.pullRequestId, period.unlinkedAt === null])).toEqual([
      [first.id, false],
      [second.id, true]
    ]);
    expect(cleared.every((period) => period.unlinkedAt instanceof Date)).toBe(true);
  });

  it('V-04 excluir a tarefa fecha os períodos abertos, que ficam sem a tarefa', async () => {
    const { project, task, context } = await scenario();
    const issue = await createIssue(prisma, project.id);
    const pullRequest = await createPullRequest(prisma, project.id);
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context);
    await pullRequestLinkService.linkPullRequest(
      task.id,
      { pullRequestId: pullRequest.id },
      context
    );

    await taskCrudService.deleteTask(task.id, context);

    const periods = await prisma.taskArtifactLinkPeriod.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' }
    });
    expect(periods).toHaveLength(2);
    expect(periods.every((period) => period.taskId === null)).toBe(true);
    expect(periods.every((period) => period.unlinkedAt instanceof Date)).toBe(true);
  });

  it('V-05 a carga inicial abre um período por vínculo existente: a issue com a data do vínculo e a PR com o instante da migration', async () => {
    const { project, task } = await scenario();
    const issue = await createIssue(prisma, project.id);
    const pullRequest = await createPullRequest(prisma, project.id);
    const linkedAt = new Date('2026-09-01T10:00:00.000Z');
    await prisma.taskIssue.create({
      data: { taskId: task.id, issueId: issue.id, createdAt: linkedAt }
    });
    await prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pullRequest.id } });
    const statements = readFileSync(MIGRATION, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('--'))
      .join(' ')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.startsWith('INSERT INTO'));

    const before = Date.now();
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);

    const periods = await periodsOf(task.id);
    expect(statements).toHaveLength(2);
    expect(periods).toEqual([
      { issueId: issue.id, pullRequestId: null, linkedAt, unlinkedAt: null },
      {
        issueId: null,
        pullRequestId: pullRequest.id,
        linkedAt: expect.any(Date),
        unlinkedAt: null
      }
    ]);
    expect(periods[1].linkedAt.getTime()).toBeGreaterThanOrEqual(before - 2000);
  });

  it('V-06 o evento vale para a tarefa só dentro do período: o início conta, o fim não', async () => {
    const { project, task } = await scenario();
    const issue = await createIssue(prisma, project.id, { state: 'closed' });
    const linkedAt = new Date('2026-03-01T12:00:00.000Z');
    const unlinkedAt = new Date('2026-03-02T12:00:00.000Z');
    const minutes = (base, count) => new Date(base.getTime() + count * 60_000);
    await prisma.gitHubEventCoverage.create({
      data: { projectId: project.id, coverageFrom: new Date('2026-01-01T00:00:00.000Z') }
    });
    await prisma.taskArtifactLinkPeriod.create({
      data: { projectId: project.id, taskId: task.id, issueId: issue.id, linkedAt, unlinkedAt }
    });
    const event = (id, eventType, occurredAt) => ({
      providerEventId: `r2-v06-${project.id}-${id}`,
      number: issue.number,
      eventType,
      occurredAt
    });

    await githubRepositoryEventsRepository.record(project.id, {
      pullRequestEvents: [],
      issueEvents: [
        event(1, 'REOPENED', minutes(linkedAt, -5)),
        event(2, 'CLOSED', linkedAt),
        event(3, 'REOPENED', minutes(linkedAt, 5)),
        event(4, 'CLOSED', unlinkedAt),
        event(5, 'REOPENED', minutes(unlinkedAt, 5))
      ],
      readStartedAt: new Date()
    });

    const events = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: project.id },
      orderBy: { occurredAt: 'asc' },
      include: { targets: true }
    });
    expect(
      events.map((item) => [item.type, item.occurredAt, item.targets.map((row) => row.taskId)])
    ).toEqual([
      ['ISSUE_CLOSED', linkedAt, [task.id]],
      ['ISSUE_REOPENED', minutes(linkedAt, 5), [task.id]]
    ]);
    expect(await prisma.issueLifecycleEvent.count({ where: { projectId: project.id } })).toBe(5);
  });
});
