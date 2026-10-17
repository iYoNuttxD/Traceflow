import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

const TIME_ZONE = 'America/Sao_Paulo';
const REGISTRY_START = new Date('2026-01-01T00:00:00.000Z');

let prisma;
let taskIssueService;
let createNotificationMetricsService;
let notificationMetricsRepository;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskIssueService } = await import('../../src/modules/tasks/services/task-issue.service.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function member(projectId) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa da abertura ${sequence}`,
      username: `r2abertura${sequence}`,
      email: `r2-abertura-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({ data: { projectId, userId: user.id, role: 'MEMBER' } });
  return user;
}

async function scenario({
  state = 'open',
  createdAtGithub = new Date(Date.now() - 3_600_000)
} = {}) {
  const project = await createProject(prisma);
  const responsible = await member(project.id);
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
  const issue = await createIssue(prisma, project.id, {
    state,
    createdAtGithub,
    closedAtGithub: state === 'closed' ? createdAtGithub : null
  });
  return { project, responsible, task, issue, createdAtGithub };
}

const context = (userId) => ({ actorUserId: userId, requestId: `r2-abertura-${sequence}` });

const openingsOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId, type: 'ISSUE_OPENED' },
    include: { targets: true },
    orderBy: { id: 'asc' }
  });

const notificationsOf = (userId) =>
  prisma.notification.findMany({
    where: { recipientUserId: userId, type: 'ISSUE_EVENT' },
    select: { githubEvent: true, githubOccurredAt: true, taskId: true }
  });

describe('ADR-023 D6 — "aberta" do RF60 no vínculo de issue aberta', () => {
  it('A-01 vincular issue aberta registra ISSUE_OPENED com a data de criação e avisa os envolvidos', async () => {
    const { project, responsible, task, issue, createdAtGithub } = await scenario();

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    const [opening] = await openingsOf(project.id);
    expect(opening).toMatchObject({
      issueId: issue.id,
      occurredAt: createdAtGithub,
      linkedTaskCount: 1,
      occurrenceKey: `opened:${issue.id}:task:${task.id}`,
      status: 'DISPATCHED'
    });
    expect(opening.targets.map((target) => target.taskId)).toEqual([task.id]);
    expect(await notificationsOf(responsible.id)).toEqual([
      { githubEvent: 'ISSUE_OPENED', githubOccurredAt: createdAtGithub, taskId: task.id }
    ]);
  });

  it('A-02 issue fechada no instante do vínculo não gera abertura', async () => {
    const { project, responsible, task, issue } = await scenario({ state: 'closed' });

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    expect(await openingsOf(project.id)).toEqual([]);
    expect(await notificationsOf(responsible.id)).toEqual([]);
  });

  it('A-03 desvincular e vincular de novo o mesmo par não repete a abertura', async () => {
    const { project, responsible, task, issue } = await scenario();

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    await taskIssueService.unlinkIssue(task.id, issue.id, context(responsible.id));
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    expect(await openingsOf(project.id)).toHaveLength(1);
    expect(await notificationsOf(responsible.id)).toHaveLength(1);
  });

  it('A-04 a mesma issue em duas tarefas gera uma abertura por par', async () => {
    const { project, responsible, task, issue } = await scenario();
    const other = await member(project.id);
    const second = await createTask(prisma, project.id, { responsibleUserId: other.id });

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    await taskIssueService.linkIssue(second.id, { issueId: issue.id }, context(responsible.id));

    const openings = await openingsOf(project.id);
    expect(openings.map((event) => event.targets.map((target) => target.taskId))).toEqual([
      [task.id],
      [second.id]
    ]);
    expect(await notificationsOf(responsible.id)).toHaveLength(1);
    expect(await notificationsOf(other.id)).toHaveLength(1);
  });

  it('A-05 a abertura conta no RF60, no período da criação da issue', async () => {
    const { project, responsible, task, issue, createdAtGithub } = await scenario();
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(createdAtGithub);

    const report = await createNotificationMetricsService({
      repository: {
        ...notificationMetricsRepository,
        registryStarts: async () => ({ decisions: REGISTRY_START, githubEvents: REGISTRY_START })
      }
    }).compute({ from: day, to: day, projectId: project.id, timeZone: TIME_ZONE });

    expect(report.requisitos.RF60).toMatchObject({
      eventos: 1,
      ocorridos: 1,
      enviadasCorretamente: 1,
      lacunas: []
    });
    expect(report.requisitos.RF60.coberturaTotal.valor).toBe(100);
  });
});
