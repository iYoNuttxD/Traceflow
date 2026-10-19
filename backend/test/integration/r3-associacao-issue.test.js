import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

const TIME_ZONE = 'America/Sao_Paulo';
const REGISTRY_START = new Date('2026-01-01T00:00:00.000Z');
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../prisma/migrations');
const OPENED_MIGRATION = '20261017120000_issue_opened_event';
const LINKED_MIGRATION = '20261018100000_issue_linked_event';

let prisma;
let taskIssueService;
let notificationService;
let createNotificationMetricsService;
let notificationMetricsRepository;
let createGithubEventNotificationService;
let githubRepositoryEventsRepository;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ taskIssueService } = await import('../../src/modules/tasks/services/task-issue.service.js'));
  ({ notificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
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
      name: `Pessoa da associação ${sequence}`,
      username: `r3associacao${sequence}`,
      email: `r3-associacao-${sequence}@example.invalid`
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

const context = (userId) => ({ actorUserId: userId, requestId: `r3-associacao-${sequence}` });

const linksOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId, type: 'ISSUE_LINKED' },
    include: { targets: true },
    orderBy: { id: 'asc' }
  });

const notificationsOf = (userId) =>
  prisma.notification.findMany({
    where: { recipientUserId: userId, type: 'ISSUE_EVENT' },
    orderBy: { id: 'asc' },
    select: { githubEvent: true, githubOccurredAt: true, taskId: true }
  });

const linkInstantOf = async (taskId, issueId) =>
  (
    await prisma.taskIssue.findUniqueOrThrow({
      where: { taskId_issueId: { taskId, issueId } },
      select: { createdAt: true }
    })
  ).createdAt;

const localDay = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(instant);

const metrics = () =>
  createNotificationMetricsService({
    repository: {
      ...notificationMetricsRepository,
      registryStarts: async () => ({
        decisions: REGISTRY_START,
        githubEvents: REGISTRY_START,
        issueLinks: REGISTRY_START
      })
    }
  });

function statementsOf(migration) {
  return readFileSync(join(MIGRATIONS, migration, 'migration.sql'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function columnTypes() {
  const rows = await prisma.$queryRaw`
    SELECT LOWER(TABLE_NAME) AS tableName, COLUMN_TYPE AS columnType
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND ((LOWER(TABLE_NAME) = 'notification' AND COLUMN_NAME = 'githubEvent')
        OR (LOWER(TABLE_NAME) = 'githubartifactevent' AND COLUMN_NAME = 'type'))
    ORDER BY tableName`;
  return rows.map((row) => [row.tableName, String(row.columnType)]);
}

describe('TF-REV-002 — associação de issue aberta separada da abertura (ADR-023 D6)', () => {
  it('L-01 vincular issue aberta grava ISSUE_LINKED com o instante do vínculo, não com a criação da issue', async () => {
    const { project, responsible, task, issue, createdAtGithub } = await scenario();

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    const linkedAt = await linkInstantOf(task.id, issue.id);
    const [link] = await linksOf(project.id);
    expect(link).toMatchObject({
      issueId: issue.id,
      occurredAt: linkedAt,
      detectedAt: linkedAt,
      linkedTaskCount: 1,
      occurrenceKey: `linked:${issue.id}:task:${task.id}`,
      status: 'DISPATCHED'
    });
    expect(link.occurredAt).not.toEqual(createdAtGithub);
    expect(link.targets.map((target) => target.taskId)).toEqual([task.id]);
    expect(await notificationsOf(responsible.id)).toEqual([
      { githubEvent: 'ISSUE_LINKED', githubOccurredAt: linkedAt, taskId: task.id }
    ]);
  });

  it('L-02 o aviso leva o evento ISSUE_LINKED e o instante do vínculo no contexto', async () => {
    const { responsible, task, issue } = await scenario();

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    const linkedAt = await linkInstantOf(task.id, issue.id);
    const { notifications } = await notificationService.list(responsible.id, { status: 'ALL' });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: 'ISSUE_EVENT',
      context: {
        event: 'ISSUE_LINKED',
        occurredAt: linkedAt,
        artifact: { kind: 'ISSUE', number: issue.number }
      }
    });
  });

  it('L-03 a métrica separa a associação do ciclo de vida, e a associação não depende da listagem do GitHub', async () => {
    const { project, responsible, task, issue } = await scenario();
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    const readStartedAt = new Date();
    const closedAt = new Date(readStartedAt.getTime() + 2000);
    await githubRepositoryEventsRepository.begin(project.id, readStartedAt);
    await githubRepositoryEventsRepository.record(project.id, {
      pullRequestEvents: [],
      issueEvents: [
        {
          providerEventId: `r3-l03-${project.id}`,
          number: issue.number,
          eventType: 'CLOSED',
          occurredAt: closedAt
        }
      ],
      readStartedAt
    });
    await createGithubEventNotificationService({ clock: () => new Date() }).runJob({
      dryRun: false
    });

    const report = await metrics().compute({
      from: localDay(closedAt),
      to: localDay(closedAt),
      projectId: project.id,
      timeZone: TIME_ZONE
    });

    expect(report.requisitos.RF60).toMatchObject({
      eventos: 1,
      ocorridos: 1,
      enviadasCorretamente: 1
    });
    expect(report.requisitos.RF60.lacunas.map((gap) => gap.motivo)).toContain(
      'LACUNA_DE_AQUISICAO'
    );
    expect(report.requisitos.RF60_ASSOCIACAO).toMatchObject({
      unidade: 'PAR_EVENTO_PARTICIPANTE',
      eventos: 1,
      ocorridos: 1,
      enviadasCorretamente: 1,
      lacunas: []
    });
    expect(report.requisitos.RF60_ASSOCIACAO.coberturaTotal.valor).toBe(100);
    expect(Object.keys(report.requisitos)).toEqual([
      'RF30',
      'RF59',
      'RF60',
      'RF60_ASSOCIACAO',
      'RF61'
    ]);
  });

  it('L-04 a migration converte as linhas antigas: tipo, chave e instante do vínculo; o resto não muda', async () => {
    const { project, responsible, task, issue, createdAtGithub } = await scenario();
    const linkedAt = new Date('2026-10-17T15:30:00.000Z');
    const closedAt = new Date('2026-10-17T16:00:00.000Z');
    const eventData = {
      projectId: project.id,
      issueId: issue.id,
      artifactNumber: issue.number,
      artifactTitle: issue.title,
      linkedTaskCount: 1,
      status: 'DISPATCHED'
    };
    const notificationData = (eventId, githubOccurredAt) => ({
      recipientUserId: responsible.id,
      projectId: project.id,
      taskId: task.id,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${eventId}:task:${task.id}`,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: issue.number,
      githubOccurredAt
    });

    try {
      for (const statement of statementsOf(OPENED_MIGRATION))
        await prisma.$executeRawUnsafe(statement);
      const legacy = await prisma.gitHubArtifactEvent.create({
        data: {
          ...eventData,
          type: 'ISSUE_CLOSED',
          occurredAt: createdAtGithub,
          detectedAt: linkedAt,
          occurrenceKey: `opened:${issue.id}:task:${task.id}`
        }
      });
      const closed = await prisma.gitHubArtifactEvent.create({
        data: {
          ...eventData,
          type: 'ISSUE_CLOSED',
          occurredAt: closedAt,
          detectedAt: closedAt,
          occurrenceKey: `gh:r3-l04-${project.id}`
        }
      });
      const legacyNotification = await prisma.notification.create({
        data: notificationData(legacy.id, createdAtGithub)
      });
      const closedNotification = await prisma.notification.create({
        data: notificationData(closed.id, closedAt)
      });
      await prisma.$executeRaw`UPDATE GitHubArtifactEvent SET type = 'ISSUE_OPENED' WHERE id = ${legacy.id}`;
      await prisma.$executeRaw`UPDATE Notification SET githubEvent = 'ISSUE_OPENED' WHERE id = ${legacyNotification.id}`;

      for (const statement of statementsOf(LINKED_MIGRATION))
        await prisma.$executeRawUnsafe(statement);

      expect(
        await prisma.gitHubArtifactEvent.findMany({
          where: { projectId: project.id },
          orderBy: { id: 'asc' },
          select: { id: true, type: true, occurrenceKey: true, occurredAt: true }
        })
      ).toEqual([
        {
          id: legacy.id,
          type: 'ISSUE_LINKED',
          occurrenceKey: `linked:${issue.id}:task:${task.id}`,
          occurredAt: linkedAt
        },
        {
          id: closed.id,
          type: 'ISSUE_CLOSED',
          occurrenceKey: `gh:r3-l04-${project.id}`,
          occurredAt: closedAt
        }
      ]);
      expect(
        await prisma.notification.findMany({
          where: { projectId: project.id },
          orderBy: { id: 'asc' },
          select: { id: true, githubEvent: true, githubOccurredAt: true }
        })
      ).toEqual([
        { id: legacyNotification.id, githubEvent: 'ISSUE_LINKED', githubOccurredAt: linkedAt },
        { id: closedNotification.id, githubEvent: 'ISSUE_CLOSED', githubOccurredAt: closedAt }
      ]);
      for (const [, columnType] of await columnTypes()) {
        expect(columnType).not.toContain('ISSUE_OPENED');
        expect(columnType).toMatch(/'ISSUE_LINKED'\)$/);
      }
    } finally {
      await cleanTestDatabase(prisma);
      for (const statement of statementsOf(LINKED_MIGRATION).slice(-2))
        await prisma.$executeRawUnsafe(statement);
    }
  });

  it('L-05 desvincular e vincular de novo o mesmo par não repete a associação', async () => {
    const { project, responsible, task, issue } = await scenario();

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    await taskIssueService.unlinkIssue(task.id, issue.id, context(responsible.id));
    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    expect(await linksOf(project.id)).toHaveLength(1);
    expect(await notificationsOf(responsible.id)).toHaveLength(1);
  });

  it('L-06 issue fechada no instante do vínculo não gera associação', async () => {
    const { project, responsible, task, issue } = await scenario({ state: 'closed' });

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));

    expect(await linksOf(project.id)).toEqual([]);
    expect(await notificationsOf(responsible.id)).toEqual([]);
  });

  it('a mesma issue em duas tarefas gera uma associação por par', async () => {
    const { project, responsible, task, issue } = await scenario();
    const other = await member(project.id);
    const second = await createTask(prisma, project.id, { responsibleUserId: other.id });

    await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(responsible.id));
    await taskIssueService.linkIssue(second.id, { issueId: issue.id }, context(responsible.id));

    const links = await linksOf(project.id);
    expect(links.map((event) => event.targets.map((target) => target.taskId))).toEqual([
      [task.id],
      [second.id]
    ]);
    expect(await notificationsOf(responsible.id)).toHaveLength(1);
    expect(await notificationsOf(other.id)).toHaveLength(1);
  });
});
