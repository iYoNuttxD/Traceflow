import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';
import {
  backdateGithubLinks,
  lifecycleEventsFor,
  openLinkPeriod,
  recordGithubEvent
} from '../helpers/github-lifecycle.js';

const boundary = vi.hoisted(() => ({ client: null }));
const queries = vi.hoisted(() => ({ enabled: false, count: 0 }));
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));
vi.mock('../../src/shared/logger/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: loggerMock
}));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));
vi.mock('../../src/database/prismaClient.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const client = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  client.$on('query', () => {
    if (queries.enabled) queries.count += 1;
  });
  return { prisma: client };
});

const NOW = new Date('2026-10-20T12:00:00.000Z');
const OCCURRED = new Date('2026-10-20T10:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const at = (ms) => new Date(NOW.getTime() + ms);
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');

let prisma;
let env;
let issueRepository;
let pullRequestRepository;
let githubEventRepository;
let githubRepositoryEventsRepository;
let createGithubEventNotificationService;
let notificationService;
let traceabilityAlertService;
let taskLinkRepository;
let githubSyncRunRepository;
let executeGithubSyncRun;
let runPrivacyRetention;
let privacyService;
let runGithubEventNotifications;
let testDatabaseUrl;
let sequence = 0;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ notificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ traceabilityAlertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ taskLinkRepository } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ githubSyncRunRepository } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ runGithubEventNotifications } =
    await import('../../scripts/dispatch-github-event-notifications.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  boundary.client = null;
  queries.enabled = false;
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

function observe(name, value) {
  if (process.env.S203_OBS_OUT)
    appendFileSync(process.env.S203_OBS_OUT, `${JSON.stringify({ name, value })}\n`);
}

const service = (now = NOW, overrides = {}) =>
  createGithubEventNotificationService({
    clock: () => now,
    ...overrides
  });
const runJob = (now = NOW, options = {}, overrides = {}) =>
  service(now, overrides).runJob({ dryRun: false, ...options });

async function person(projectId, { role = 'MEMBER', isActive = true, accountStatus } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa bateria ${sequence}`,
      username: `s203int${sequence}`,
      email: `s203-int-${sequence}@example.invalid`,
      ...(accountStatus ? { accountStatus } : {})
    }
  });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: user.id, role, isActive }
    });
  return user;
}

const newProject = (overrides = {}) =>
  createProject(prisma, { createdAt: PROJECT_CREATED_AT, ...overrides });

async function issueRow(project, number, previous = { state: 'open', closedAtGithub: null }) {
  return prisma.issue.create({
    data: {
      projectId: project.id,
      githubId: `s203-int-issue-${project.id}-${number}`,
      number,
      title: `Issue ${number}`,
      labels: [],
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${number}`,
      ...previous
    }
  });
}

async function pullRequestRow(project, number, previous = { state: 'open' }) {
  return prisma.pullRequest.create({
    data: {
      projectId: project.id,
      githubId: `s203-int-pr-${project.id}-${number}`,
      number,
      title: `PR ${number}`,
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`,
      ...previous
    }
  });
}

const issueItem = (issue, received) => ({
  projectId: issue.projectId,
  githubId: issue.githubId,
  number: issue.number,
  title: issue.title,
  githubUrl: issue.githubUrl,
  labels: [],
  closedAtGithub: null,
  updatedAtGithub: OCCURRED,
  ...received
});

const pullRequestItem = (pullRequest, received) => ({
  projectId: pullRequest.projectId,
  githubId: pullRequest.githubId,
  number: pullRequest.number,
  title: pullRequest.title,
  githubUrl: pullRequest.githubUrl,
  closedAtGithub: null,
  mergedAtGithub: null,
  updatedAtGithub: OCCURRED,
  ...received
});

const githubEvent = (artifact, kind, eventType, occurredAt, detectedAt = NOW) =>
  recordGithubEvent(githubRepositoryEventsRepository, prisma, {
    projectId: artifact.projectId,
    kind,
    number: artifact.number,
    eventType,
    occurredAt,
    detectedAt
  });

async function closeIssue(issue, { when = OCCURRED, detectedAt = NOW, ...extra } = {}) {
  await issueRepository.upsertMany([
    issueItem(issue, { state: 'closed', closedAtGithub: when, ...extra })
  ]);
  return githubEvent(issue, 'ISSUE', 'CLOSED', when ?? detectedAt, detectedAt);
}
async function reopenIssue(issue, { when = OCCURRED, detectedAt = NOW } = {}) {
  await issueRepository.upsertMany([issueItem(issue, { state: 'open', updatedAtGithub: when })]);
  return githubEvent(issue, 'ISSUE', 'REOPENED', when, detectedAt);
}
async function mergePullRequest(pullRequest, { when = OCCURRED, detectedAt = NOW } = {}) {
  await pullRequestRepository.upsertMany([
    pullRequestItem(pullRequest, { state: 'closed', closedAtGithub: when, mergedAtGithub: when })
  ]);
  return githubEvent(pullRequest, 'PULL_REQUEST', 'MERGED', when, detectedAt);
}

async function linkIssue(task, issue) {
  const link = await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  await openLinkPeriod(prisma, { projectId: task.projectId, taskId: task.id, issueId: issue.id });
  return link;
}
async function linkPullRequest(task, pullRequest) {
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { pullRequestId: pullRequest.id }
  });
  await openLinkPeriod(prisma, {
    projectId: task.projectId,
    taskId: task.id,
    pullRequestId: pullRequest.id
  });
  return updated;
}
const comment = (task, user, { deleted = false } = {}) =>
  prisma.taskComment.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      authorUserId: user.id,
      content: 'comentário da bateria',
      deletedAt: deleted ? NOW : null
    }
  });
const effort = (task, starter, { ender = starter, running = false } = {}) =>
  prisma.taskTimeEntry.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      source: running ? 'TIMER' : 'MANUAL',
      startedAt: new Date('2026-10-19T10:00:00.000Z'),
      endedAt: running ? null : new Date('2026-10-19T11:00:00.000Z'),
      durationSeconds: running ? null : 3600,
      startedById: starter.id,
      endedById: running ? null : ender.id
    }
  });
const preference = (user, type, enabled, enabledAt = null) =>
  prisma.notificationPreference.create({ data: { userId: user.id, type, enabled, enabledAt } });

const eventsOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId },
    include: { targets: { orderBy: { taskId: 'asc' } } },
    orderBy: { id: 'asc' }
  });
const recipientsOf = async (where = {}) =>
  (await prisma.notification.findMany({ where, select: { recipientUserId: true } }))
    .map((row) => row.recipientUserId)
    .sort((left, right) => left - right);

function excludedWith(overrides = {}) {
  return {
    NO_TASK: 0,
    NO_PARTICIPANT: 0,
    INACTIVE_ACCOUNT: 0,
    INACTIVE_MEMBER: 0,
    PREFERENCE_OFF: 0,
    ...overrides
  };
}

async function linkedIssueScenario({ responsibleOptions = {}, projectOverrides = {} } = {}) {
  const project = await newProject(projectOverrides);
  const responsible = await person(project.id, responsibleOptions);
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
  sequence += 1;
  const issue = await issueRow(project, sequence);
  await linkIssue(task, issue);
  return { project, responsible, task, issue };
}

async function pendingEvents(
  project,
  count,
  { participant = null, detectedAt = NOW, key = 'carga' } = {}
) {
  let tasks = [];
  if (participant) {
    const marker = `Tarefa ${key} ${project.id} `;
    await prisma.task.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        projectId: project.id,
        title: `${marker}${index}`,
        priority: 'MEDIA',
        status: 'A_FAZER',
        responsibleUserId: participant.id
      }))
    });
    tasks = await prisma.task.findMany({
      where: { projectId: project.id, title: { startsWith: marker } },
      orderBy: { id: 'asc' },
      select: { id: true }
    });
  }
  await prisma.gitHubArtifactEvent.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      projectId: project.id,
      type: 'ISSUE_CLOSED',
      artifactNumber: index + 1,
      artifactTitle: `Issue ${index + 1}`,
      artifactUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${index + 1}`,
      occurredAt: OCCURRED,
      detectedAt,
      nextAttemptAt: detectedAt,
      linkedTaskCount: participant ? 1 : 0,
      occurrenceKey: `ISSUE_CLOSED:${key}-${project.id}-${index}:${OCCURRED.toISOString()}`
    }))
  });
  const events = await prisma.gitHubArtifactEvent.findMany({
    where: { projectId: project.id, occurrenceKey: { startsWith: `ISSUE_CLOSED:${key}-` } },
    orderBy: { id: 'asc' },
    select: { id: true }
  });
  if (participant)
    await prisma.gitHubArtifactEventTask.createMany({
      data: events.map((event, index) => ({ eventId: event.id, taskId: tasks[index].id }))
    });
  return events.map((event) => event.id);
}

describe('S2-03 bateria — bloco T (D2)', () => {
  it('EV-T-06 título mudado junto com a transição vai para o snapshot com o valor novo', async () => {
    const { project, issue } = await linkedIssueScenario();

    await closeIssue(issue, { title: 'Título novo no fechamento' });

    const [event] = await eventsOf(project.id);
    expect(event.artifactTitle).toBe('Título novo no fechamento');
  });

  it('EV-T-11 fechar, reabrir e fechar em três sincronizações dá três eventos e três avisos', async () => {
    const { project, issue, responsible } = await linkedIssueScenario();

    await closeIssue(issue, { when: new Date('2026-10-20T09:00:00.000Z') });
    await reopenIssue(issue, {
      when: new Date('2026-10-20T09:30:00.000Z'),
      detectedAt: at(MINUTE)
    });
    await closeIssue(issue, {
      when: new Date('2026-10-20T10:00:00.000Z'),
      detectedAt: at(2 * MINUTE)
    });
    await runJob(at(3 * MINUTE));

    const events = await eventsOf(project.id);
    expect(events.map((event) => event.type)).toEqual([
      'ISSUE_CLOSED',
      'ISSUE_REOPENED',
      'ISSUE_CLOSED'
    ]);
    expect(new Set(events.map((event) => event.occurrenceKey)).size).toBe(3);
    expect(await recipientsOf()).toEqual([responsible.id, responsible.id, responsible.id]);
  });

  it('EV-T-12 sem tarefa vinculada não há evento, e a issue fechada vira alerta do S2-01', async () => {
    const { project, issue, task } = await linkedIssueScenario();
    await prisma.task.delete({ where: { id: task.id } });

    const result = await closeIssue(issue, { when: new Date('2026-10-20T09:00:00.000Z') });
    await traceabilityAlertService.reconcileAfterSync(project.id);

    expect(result.recorded).toBe(0);
    expect(await eventsOf(project.id)).toEqual([]);
    expect(
      await prisma.traceabilityAlert.count({
        where: { projectId: project.id, issueId: issue.id, type: 'ISSUE_CLOSED_WITHOUT_TASK' }
      })
    ).toBe(1);
  });
});

describe('S2-03 bateria — bloco V: vínculos e retrato (D4)', () => {
  it('EV-V-01 PR vinculada a três tarefas: retrato com as três e uma notificação por responsável', async () => {
    const project = await newProject();
    const people = [await person(project.id), await person(project.id), await person(project.id)];
    const pullRequest = await pullRequestRow(project, 1);
    for (const user of people)
      await linkPullRequest(
        await createTask(prisma, project.id, { responsibleUserId: user.id }),
        pullRequest
      );

    await mergePullRequest(pullRequest);
    await runJob();

    const [event] = await eventsOf(project.id);
    expect(event.linkedTaskCount).toBe(3);
    expect(event.targets).toHaveLength(3);
    expect(await recipientsOf()).toEqual(people.map((user) => user.id).sort((a, b) => a - b));
  });

  it('EV-V-03 desvincular depois da detecção ainda avisa a tarefa do retrato (regra; hipótese H19)', async () => {
    const { project, issue, task, responsible } = await linkedIssueScenario();

    await closeIssue(issue);
    await prisma.taskIssue.deleteMany({ where: { taskId: task.id, issueId: issue.id } });
    await runJob();

    expect(await recipientsOf()).toEqual([responsible.id]);
    expect((await eventsOf(project.id))[0].targets.map((target) => target.taskId)).toEqual([
      task.id
    ]);
  });

  it('EV-V-05 PR vinculada no banco a tarefa de outro projeto fica fora do retrato (V8.4.1)', async () => {
    const project = await newProject();
    const owner = await person(project.id);
    const ownTask = await createTask(prisma, project.id, { responsibleUserId: owner.id });
    const pullRequest = await pullRequestRow(project, 1);
    await linkPullRequest(ownTask, pullRequest);
    const other = await newProject();
    const stranger = await person(other.id);
    const foreignTask = await createTask(prisma, other.id, { responsibleUserId: stranger.id });
    await prisma.task.update({
      where: { id: foreignTask.id },
      data: { pullRequestId: pullRequest.id }
    });

    await mergePullRequest(pullRequest);
    await runJob();

    const [event] = await eventsOf(project.id);
    expect(event.targets.map((target) => target.taskId)).toEqual([ownTask.id]);
    expect(event.linkedTaskCount).toBe(1);
    expect(await recipientsOf()).toEqual([owner.id]);
  });

  it('EV-V-06 PR trocada de tarefa entre a detecção e o despacho: só a tarefa do retrato é avisada', async () => {
    const project = await newProject();
    const first = await person(project.id);
    const second = await person(project.id);
    const taskA = await createTask(prisma, project.id, { responsibleUserId: first.id });
    const taskB = await createTask(prisma, project.id, { responsibleUserId: second.id });
    const pullRequest = await pullRequestRow(project, 1);
    await linkPullRequest(taskA, pullRequest);

    await mergePullRequest(pullRequest);
    await prisma.task.update({ where: { id: taskA.id }, data: { pullRequestId: null } });
    await linkPullRequest(taskB, pullRequest);
    await runJob();

    expect(await recipientsOf()).toEqual([first.id]);
  });

  it('EV-V-07 artefato apagado depois da detecção: o despacho usa o snapshot', async () => {
    const { project, issue, responsible } = await linkedIssueScenario();
    await closeIssue(issue, { title: 'Snapshot preservado' });

    await prisma.issue.delete({ where: { id: issue.id } });
    await runJob();

    const [event] = await eventsOf(project.id);
    expect(event.issueId).toBeNull();
    const [notification] = await prisma.notification.findMany();
    expect(notification).toMatchObject({
      recipientUserId: responsible.id,
      artifactNumber: issue.number,
      artifactTitle: 'Snapshot preservado',
      artifactUrl: issue.githubUrl
    });
  });
});

describe('S2-03 bateria — bloco E: destinatários e exclusões (D6)', () => {
  it('EV-E-01 recebem responsável, comentário não excluído e quem iniciou esforço; não recebe quem só encerrou', async () => {
    const { project, issue, task, responsible } = await linkedIssueScenario();
    const commenter = await person(project.id);
    const deletedCommenter = await person(project.id);
    const manualWorker = await person(project.id);
    const runningWorker = await person(project.id);
    const starter = await person(project.id);
    const ender = await person(project.id);
    const bystander = await person(project.id);
    await comment(task, commenter);
    await comment(task, deletedCommenter, { deleted: true });
    await effort(task, manualWorker);
    await effort(task, runningWorker, { running: true });
    await effort(task, starter, { ender });

    await closeIssue(issue);
    await runJob();

    const expected = [responsible, commenter, manualWorker, runningWorker, starter]
      .map((user) => user.id)
      .sort((left, right) => left - right);
    expect(await recipientsOf()).toEqual(expected);
    for (const user of [deletedCommenter, ender, bystander])
      expect(await recipientsOf({ recipientUserId: user.id })).toEqual([]);
  });

  it('EV-E-02 com duas condições verdadeiras, vale a primeira da ordem documentada', async () => {
    const cases = [
      {
        label: 'projeto excluído e evento antigo não excluem (S203-A02, TF-REV-002)',
        expected: null,
        arrange: async ({ project }) =>
          prisma.project.update({ where: { id: project.id }, data: { deletedAt: NOW } }),
        when: new Date(NOW.getTime() - 10 * DAY)
      },
      {
        label: 'evento antigo com conta restrita: vale INACTIVE_ACCOUNT (TF-REV-002)',
        expected: 'INACTIVE_ACCOUNT',
        arrange: ({ responsible }) =>
          prisma.user.update({
            where: { id: responsible.id },
            data: { accountStatus: 'DEACTIVATED' }
          }),
        when: new Date(NOW.getTime() - 10 * DAY)
      },
      {
        label: 'INACTIVE_ACCOUNT antes de INACTIVE_MEMBER',
        expected: 'INACTIVE_ACCOUNT',
        arrange: async ({ project, responsible }) => {
          await prisma.user.update({
            where: { id: responsible.id },
            data: { accountStatus: 'DEACTIVATED' }
          });
          await prisma.projectMembership.updateMany({
            where: { projectId: project.id, userId: responsible.id },
            data: { isActive: false }
          });
        }
      },
      {
        label: 'INACTIVE_MEMBER antes de PREFERENCE_OFF',
        expected: 'INACTIVE_MEMBER',
        arrange: async ({ project, responsible }) => {
          await prisma.projectMembership.updateMany({
            where: { projectId: project.id, userId: responsible.id },
            data: { isActive: false }
          });
          await preference(responsible, 'ISSUE_EVENT', false);
        }
      }
    ];
    for (const scenario of cases) {
      const context = await linkedIssueScenario();
      await closeIssue(context.issue, { when: scenario.when ?? OCCURRED });
      await scenario.arrange(context);
      await runJob();
      const [event] = await eventsOf(context.project.id);
      expect(event.outcome.excluded, scenario.label).toEqual(
        excludedWith(scenario.expected ? { [scenario.expected]: 1 } : {})
      );
    }

    const empty = await newProject();
    const emptyTask = await createTask(prisma, empty.id);
    const issue = await issueRow(empty, 1);
    await linkIssue(emptyTask, issue);
    await closeIssue(issue);
    await prisma.project.update({ where: { id: empty.id }, data: { deletedAt: NOW } });
    await runJob();
    expect((await eventsOf(empty.id))[0].outcome.excluded).toEqual(
      excludedWith({ NO_PARTICIPANT: 1 })
    );
  });

  it('EV-E-03 contas fora de ACTIVE não recebem; reativada antes do despacho recebe', async () => {
    for (const status of ['DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED']) {
      const context = await linkedIssueScenario({ responsibleOptions: { accountStatus: status } });
      await closeIssue(context.issue);
      await runJob();
      expect((await eventsOf(context.project.id))[0].outcome.excluded, status).toEqual(
        excludedWith({ INACTIVE_ACCOUNT: 1 })
      );
    }
    const reactivated = await linkedIssueScenario({
      responsibleOptions: { accountStatus: 'DEACTIVATED' }
    });
    await closeIssue(reactivated.issue);
    await prisma.user.update({
      where: { id: reactivated.responsible.id },
      data: { accountStatus: 'ACTIVE' }
    });
    await runJob();
    expect(await recipientsOf({ projectId: reactivated.project.id })).toEqual([
      reactivated.responsible.id
    ]);
  });

  it('EV-E-04 membership inativa no despacho exclui; reativada antes recebe; reativada depois não recupera', async () => {
    const setInactive = (context, isActive) =>
      prisma.projectMembership.updateMany({
        where: { projectId: context.project.id, userId: context.responsible.id },
        data: { isActive }
      });
    const before = await linkedIssueScenario();
    await closeIssue(before.issue);
    await setInactive(before, false);
    await setInactive(before, true);
    await runJob();
    expect(await recipientsOf({ projectId: before.project.id })).toEqual([before.responsible.id]);

    const after = await linkedIssueScenario();
    await closeIssue(after.issue);
    await setInactive(after, false);
    await runJob();
    await setInactive(after, true);
    const second = await runJob(at(HOUR));

    expect((await eventsOf(after.project.id))[0].outcome.excluded).toEqual(
      excludedWith({ INACTIVE_MEMBER: 1 })
    );
    expect(second.scanned).toBe(0);
    expect(await recipientsOf({ projectId: after.project.id })).toEqual([]);
  });

  it('EV-E-05 enabledAt igual à detecção vale; religada depois da detecção conta PREFERENCE_OFF', async () => {
    const equal = await linkedIssueScenario();
    await preference(equal.responsible, 'ISSUE_EVENT', true, NOW);
    await closeIssue(equal.issue, { detectedAt: NOW });
    const later = await linkedIssueScenario();
    await preference(later.responsible, 'ISSUE_EVENT', true, at(1));
    await closeIssue(later.issue, { detectedAt: NOW });

    await runJob(at(MINUTE));

    expect(await recipientsOf({ projectId: equal.project.id })).toEqual([equal.responsible.id]);
    expect((await eventsOf(later.project.id))[0].outcome.excluded).toEqual(
      excludedWith({ PREFERENCE_OFF: 1 })
    );
  });

  it('EV-E-06 projeto excluído entre detecção e despacho: a notificação nasce oculta e aparece com a restauração (S203-A02)', async () => {
    const { project, issue, responsible } = await linkedIssueScenario();
    await closeIssue(issue);
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: NOW } });

    await runJob(at(MINUTE));
    const [event] = await eventsOf(project.id);
    expect(event.status).toBe('DISPATCHED');
    expect(event.outcome).toMatchObject({ eligible: 1, created: 1, excluded: excludedWith() });
    expect(await notificationService.unreadCount(responsible.id)).toEqual({ unreadCount: 0 });

    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
    const afterRestore = await runJob(at(2 * MINUTE));

    expect(afterRestore.scanned).toBe(0);
    expect(await notificationService.unreadCount(responsible.id)).toEqual({ unreadCount: 1 });
    expect(await recipientsOf({ projectId: project.id })).toEqual([responsible.id]);
  });

  it('EV-E-07 sem janela: eventos de 7 dias, 7 dias e 1 ms e 400 dias notificam; retentativa 3 h depois (TF-REV-002)', async () => {
    for (const age of [7 * DAY, 7 * DAY + 1, 400 * DAY]) {
      const context = await linkedIssueScenario();
      await backdateGithubLinks(prisma, context.project.id, new Date('2024-01-01T00:00:00.000Z'));
      await closeIssue(context.issue, { when: new Date(NOW.getTime() - age) });
      await runJob(at(MINUTE), { projectId: context.project.id });
      expect(await recipientsOf({ projectId: context.project.id }), String(age)).toEqual([
        context.responsible.id
      ]);
      expect((await eventsOf(context.project.id))[0].outcome.excluded, String(age)).toEqual(
        excludedWith()
      );
    }

    const retried = await linkedIssueScenario();
    await closeIssue(retried.issue, { when: new Date(NOW.getTime() - 7 * DAY + MINUTE) });
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
      Object.assign(new Error('falha temporária'), { code: 'P1001' })
    );
    await runJob(NOW, { projectId: retried.project.id });
    await runJob(at(3 * HOUR), { projectId: retried.project.id });
    expect(await recipientsOf({ projectId: retried.project.id })).toEqual([retried.responsible.id]);
  });

  it('EV-E-08 VIEWER responsável e VIEWER que comentou recebem; MANAGER sem participação não', async () => {
    const project = await newProject();
    const viewer = await person(project.id, { role: 'VIEWER' });
    const formerMember = await person(project.id, { role: 'VIEWER' });
    const manager = await person(project.id, { role: 'MANAGER' });
    const task = await createTask(prisma, project.id, { responsibleUserId: viewer.id });
    await comment(task, formerMember);
    const issue = await issueRow(project, 1);
    await linkIssue(task, issue);

    await closeIssue(issue);
    await runJob();

    expect(await recipientsOf()).toEqual([viewer.id, formerMember.id].sort((a, b) => a - b));
    expect(await recipientsOf({ recipientUserId: manager.id })).toEqual([]);
  });

  it('EV-E-09 dois eventos na mesma tarefa geram duas notificações para a mesma pessoa', async () => {
    const { project, task, responsible } = await linkedIssueScenario();
    const pullRequest = await pullRequestRow(project, 99);
    await linkPullRequest(task, pullRequest);
    const [issue] = await prisma.issue.findMany({ where: { projectId: project.id } });

    await closeIssue(issue);
    await mergePullRequest(pullRequest);
    await runJob();

    const rows = await prisma.notification.findMany({ where: { recipientUserId: responsible.id } });
    expect(rows.map((row) => row.type).sort()).toEqual(['ISSUE_EVENT', 'PULL_REQUEST_EVENT']);
    expect(rows.every((row) => row.taskId === task.id)).toBe(true);
  });
});

describe('S2-03 bateria — bloco J: despacho, retentativas e job (D9, D15)', () => {
  it('EV-J-01 PROCESSING vencido com menos de 5 tentativas é retomado; com 5 vira FAILED interrompido', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    const [resumable, exhausted] = await pendingEvents(project, 2, { participant });
    await prisma.gitHubArtifactEvent.update({
      where: { id: resumable },
      data: { status: 'PROCESSING', attempts: 2, claimToken: 'antigo-1', claimedUntil: at(-1) }
    });
    await prisma.gitHubArtifactEvent.update({
      where: { id: exhausted },
      data: { status: 'PROCESSING', attempts: 5, claimToken: 'antigo-2', claimedUntil: at(-1) }
    });

    const report = await runJob();

    expect(
      await prisma.gitHubArtifactEvent.findUnique({
        where: { id: resumable },
        select: { status: true, attempts: true }
      })
    ).toEqual({ status: 'DISPATCHED', attempts: 3 });
    expect(
      await prisma.gitHubArtifactEvent.findUnique({
        where: { id: exhausted },
        select: { status: true, lastErrorCode: true, claimToken: true }
      })
    ).toEqual({ status: 'FAILED', lastErrorCode: 'DISPATCH_INTERRUPTED', claimToken: null });
    expect(report.failed).toBe(1);
  });

  it('EV-J-02 esperas exatas de 1, 5, 30 e 120 minutos, com o limite de 1 ms', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    const failing = () =>
      vi
        .spyOn(githubEventRepository, 'participationOf')
        .mockRejectedValueOnce(Object.assign(new Error('falha'), { code: 'P1001' }));
    let clock = NOW;
    const observed = [];
    for (const wait of [1, 5, 30, 120]) {
      failing();
      await runJob(clock, { projectId: project.id });
      const [event] = await eventsOf(project.id);
      observed.push((event.nextAttemptAt.getTime() - clock.getTime()) / MINUTE);
      const early = await runJob(new Date(event.nextAttemptAt.getTime() - 1), {
        projectId: project.id
      });
      expect(early.scanned, `${wait} min`).toBe(0);
      clock = event.nextAttemptAt;
      vi.restoreAllMocks();
    }
    failing();
    await runJob(clock, { projectId: project.id });

    expect(observed).toEqual([1, 5, 30, 120]);
    const [event] = await eventsOf(project.id);
    expect(event).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  it('EV-J-03 o dry-run não grava nada, prevê o apply e conta o reprocessamento sem fazer', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 3, { participant });
    const failed = await pendingEvents(project, 2, { participant, key: 'falho' });
    await prisma.gitHubArtifactEvent.updateMany({
      where: { id: { in: failed } },
      data: { status: 'FAILED', attempts: 5, lastErrorCode: 'X' }
    });
    const snapshot = async () => ({
      events: await prisma.gitHubArtifactEvent.findMany({
        orderBy: { id: 'asc' },
        select: {
          status: true,
          attempts: true,
          nextAttemptAt: true,
          claimToken: true,
          lastErrorCode: true,
          outcome: true
        }
      }),
      notifications: await prisma.notification.count(),
      audits: await prisma.auditEvent.count()
    });
    const before = await snapshot();

    const dry = await service().runJob({ dryRun: true });
    const dryRetry = await service().runJob({ dryRun: true, retryFailed: true });

    expect(await snapshot()).toEqual(before);
    expect(dry.wouldCreate).toBe(3);
    expect(dryRetry.wouldRequeue).toBe(2);
    const applied = await runJob();
    expect(applied.created).toBe(dry.wouldCreate);
  });

  it('EV-J-03 o dry-run prevê o apply também para PROCESSING vencido que esgotou as tentativas', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    const [exhausted] = await pendingEvents(project, 1, { participant });
    await prisma.gitHubArtifactEvent.update({
      where: { id: exhausted },
      data: { status: 'PROCESSING', attempts: 5, claimToken: 'antigo', claimedUntil: at(-1) }
    });

    const dry = await service().runJob({ dryRun: true });
    const applied = await runJob();

    expect(dry.scanned).toBe(0);
    expect(dry.wouldCreate).toBe(applied.created);
    expect(applied).toMatchObject({ created: 0, failed: 1 });
  });

  it('EV-J-07 a saída do script tem exatamente os campos do runbook', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 1, { participant });
    const capture = async (args) => {
      let output = '';
      const code = await runGithubEventNotifications({
        args,
        service: service(),
        databaseUrl: testDatabaseUrl,
        write: (text) => {
          output += text;
        },
        writeError: () => {}
      });
      return { code, keys: Object.keys(JSON.parse(output)).sort(), body: JSON.parse(output) };
    };
    const base = [
      'alreadyNotified',
      'busy',
      'claimLost',
      'claimed',
      'created',
      'database',
      'dispatched',
      'dryRun',
      'dueAfter',
      'durationMs',
      'excluded',
      'failed',
      'failedStock',
      'oldestDueAgeSeconds',
      'pendingAfter',
      'projects',
      'retryScheduled',
      'scanned'
    ];

    const dry = await capture([]);
    const dryRetry = await capture(['--retry-failed']);
    const applied = await capture(['--apply']);
    const appliedRetry = await capture(['--apply', '--retry-failed']);

    expect(dry.keys).toEqual([...base, 'wouldCreate'].sort());
    expect(dryRetry.keys).toEqual([...base, 'wouldCreate', 'wouldRequeue'].sort());
    expect(applied.keys).toEqual(base);
    expect(appliedRetry.keys).toEqual([...base, 'requeued'].sort());
    expect(Object.keys(applied.body.excluded).sort()).toEqual(Object.keys(excludedWith()).sort());
    expect(JSON.stringify(applied.body.database)).not.toMatch(/:[^:@/]+@/);
    expect(applied.body.oldestDueAgeSeconds).toBeNull();
  });

  it('EV-J-08 código de erro com quebra de linha sai saneado; o nível do log segue as falhas', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
      Object.assign(new Error('falha'), { code: 'X\r\n{"level":"error","forjado":true}' })
    );

    await runJob(NOW, { projectId: project.id }, { log });
    await runJob(at(2 * MINUTE), { projectId: project.id }, { log });

    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notification_attempt_failed',
        errorCode: 'GITHUB_EVENT_DISPATCH_FAILED'
      })
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'github_event_notifications_dispatch_completed' })
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notifications_dispatch_completed',
        failed: 0,
        retryScheduled: 0
      })
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('forjado');
  });

  it('EV-J-09 depois que o evento vira FAILED, as execuções seguintes não mostram o estoque (hipótese H13)', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    let clock = NOW;
    const reports = [];
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
        Object.assign(new Error('falha'), { code: 'P1001' })
      );
      reports.push(await runJob(clock, { projectId: project.id }));
      vi.restoreAllMocks();
      const [event] = await eventsOf(project.id);
      if (event.status === 'FAILED') break;
      clock = event.nextAttemptAt;
    }
    const later = await runJob(at(DAY), { projectId: project.id });
    const counted = await service(at(DAY)).runJob({ dryRun: true, retryFailed: true });

    expect(reports.at(-1).failed).toBe(1);
    observe('EV-J-09 saída depois do FAILED', {
      failedNaExecucaoSeguinte: later.failed,
      campos: Object.keys(later).sort(),
      wouldRequeue: counted.wouldRequeue
    });
    expect(counted.wouldRequeue).toBe(1);
  });

  it('EV-J-10 a idade do pendente mais antigo passa de 30 min durante a espera normal (hipótese H14)', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue, { detectedAt: NOW });
    let clock = NOW;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
        Object.assign(new Error('falha'), { code: 'P1001' })
      );
      await runJob(clock, { projectId: project.id });
      vi.restoreAllMocks();
      clock = (await eventsOf(project.id))[0].nextAttemptAt;
    }
    const during = await runJob(at(31 * MINUTE), { projectId: project.id });

    const [event] = await eventsOf(project.id);
    observe('EV-J-10 durante a espera', {
      proximaTentativa: event.nextAttemptAt,
      dueAfter: during.dueAfter,
      oldestDueAgeSeconds: during.oldestDueAgeSeconds
    });
    expect(event.status).toBe('PENDING');
    expect(during.scanned).toBe(0);
  });

  it('EV-J-11 o job processa no máximo 10 lotes de 100; o gancho, 100 do projeto sincronizado', async () => {
    const big = await newProject();
    await pendingEvents(big, 1050);
    const report = await runJob();
    expect(report).toMatchObject({ scanned: 1000, dispatched: 1000, pendingAfter: 50 });

    await cleanTestDatabase(prisma);
    const synced = await newProject();
    const other = await newProject();
    await pendingEvents(synced, 150);
    await pendingEvents(other, 20);
    const hook = await service().dispatchAfterSync(synced.id);
    expect(hook).toMatchObject({ dispatched: 100, pendingAfter: 50 });
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { projectId: other.id, status: 'PENDING' } })
    ).toBe(20);
  });

  it('EV-J-12 os comandos do runbook funcionam no banco de teste', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 2, { participant, detectedAt: new Date() });
    const script = resolve(process.cwd(), 'scripts', 'dispatch-github-event-notifications.js');
    const run = (args) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: 'test' },
        encoding: 'utf8'
      });

    const dry = run([`--project-id=${project.id}`]);
    const applied = run(['--apply', `--project-id=${project.id}`]);
    const missing = run(['--apply', '--project-id=2147483000']);
    const retry = run(['--retry-failed']);

    expect(dry.status, dry.stderr).toBe(0);
    expect(JSON.parse(dry.stdout)).toMatchObject({ dryRun: true, wouldCreate: 2 });
    expect(applied.status, applied.stderr).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({ dryRun: false, created: 2 });
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('--project-id=2147483000');
    expect(retry.status, retry.stderr).toBe(0);
    expect(JSON.parse(retry.stdout)).toMatchObject({ dryRun: true, wouldRequeue: 0 });
    const { scripts } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(scripts['notifications:github-events:dry-run']).toBe(
      'node scripts/dispatch-github-event-notifications.js'
    );
    expect(scripts['notifications:github-events']).toBe(
      'node scripts/dispatch-github-event-notifications.js --apply'
    );
  }, 60000);

  it('EV-J-13 sem job agendado, a falha do gancho só volta a ser tentada quando vencida (hipótese H12)', async () => {
    const { project, issue, responsible } = await linkedIssueScenario();
    await closeIssue(issue);
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
      Object.assign(new Error('falha'), { code: 'P1001' })
    );

    const failedHook = await service(NOW).dispatchAfterSync(project.id);
    const tooSoon = await service(at(30_000)).dispatchAfterSync(project.id);
    const due = await service(at(MINUTE)).dispatchAfterSync(project.id);

    observe('EV-J-13 gancho', {
      primeira: { retryScheduled: failedHook.retryScheduled },
      antesDeVencer: { scanned: tooSoon.scanned },
      vencida: { dispatched: due.dispatched }
    });
    expect(failedHook.retryScheduled).toBe(1);
    expect(tooSoon.scanned).toBe(0);
    expect(due.dispatched).toBe(1);
    expect(await recipientsOf()).toEqual([responsible.id]);
  });
});

describe('S2-03 bateria — bloco S: sincronização e gancho (UC04)', () => {
  async function integratedProject() {
    sequence += 1;
    const owner = await person();
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: `s203-int-sync-${sequence}`,
        accountId: `s203-int-sync-account-${sequence}`,
        accountLogin: 'usuario-s203',
        accountType: 'User',
        installedAt: new Date(),
        status: 'ACTIVE'
      }
    });
    const project = await newProject();
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: owner.id, role: 'OWNER' }
    });
    const repositoryId = String(97000 + sequence);
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        installationId: installation.id,
        githubRepositoryId: repositoryId,
        repositoryName: 'repositorio-s203',
        repositoryFullName: 'usuario-s203/repositorio-s203',
        repositoryUrl: 'https://github.com/usuario-s203/repositorio-s203',
        defaultBranch: 'trunk',
        status: 'ACTIVE'
      }
    });
    return { project, owner, repositoryId };
  }

  async function* pages(...values) {
    for (const value of values) yield value;
  }

  function githubDouble(repositoryId, { pullRequests = [], issues = [] } = {}) {
    return {
      getRepository: vi.fn().mockResolvedValue({
        githubRepositoryId: repositoryId,
        name: 'repositorio-s203',
        owner: 'usuario-s203',
        fullName: 'usuario-s203/repositorio-s203',
        url: 'https://github.com/usuario-s203/repositorio-s203',
        defaultBranch: 'trunk',
        private: true,
        description: null
      }),
      listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: 'trunk-head' }])),
      listCommitPages: vi.fn(() => pages([])),
      listPullRequestPages: vi.fn(() => pages(pullRequests)),
      listRepositoryEventPages: vi.fn(() => pages(lifecycleEventsFor({ pullRequests, issues }))),
      listIssuePages: vi.fn(() => pages(issues))
    };
  }

  const prItem = (number, state, mergedAt = null, title = `PR ${number}`) => ({
    githubId: `s203-int-sync-pr-${number}`,
    number,
    title,
    state,
    closedAtGithub: state === 'closed' ? mergedAt || OCCURRED : null,
    mergedAtGithub: mergedAt,
    githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`
  });

  async function runSync(context) {
    const run = await githubSyncRunRepository.create(context.project.id, context.owner.id);
    return executeGithubSyncRun(run.id);
  }

  async function syncedPullRequests(numbers, responsible) {
    const context = await integratedProject();
    const owner = responsible || (await person(context.project.id));
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: numbers.map((number) => prItem(number, 'open'))
    });
    expect((await runSync(context)).status).toBe('SUCCEEDED');
    for (const number of numbers) {
      const task = await createTask(prisma, context.project.id, { responsibleUserId: owner.id });
      await linkPullRequest(
        task,
        await prisma.pullRequest.findFirst({ where: { projectId: context.project.id, number } })
      );
    }
    return { ...context, responsible: owner };
  }

  it('EV-S-08 os logs das etapas trazem os eventos gravados; o de eventos só aparece com evento novo', async () => {
    const context = await syncedPullRequests([1, 2]);
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED, 'Título sigiloso'), prItem(2, 'open')]
    });

    await runSync(context);
    const firstRecorded = loggerMock.info.mock.calls.filter(
      ([, data]) => data?.event === 'github_artifact_events_recorded'
    );
    const steps = loggerMock.info.mock.calls
      .filter(([, data]) => data?.event === 'github_sync_step_completed')
      .map(([, data]) => data);
    loggerMock.info.mockClear();
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'open', null, 'Título sigiloso'), prItem(2, 'open')]
    });
    await runSync(context);

    expect(firstRecorded.map(([, data]) => data)).toEqual([
      expect.objectContaining({ projectId: context.project.id, events: 1 })
    ]);
    expect(steps.find((step) => step.step === 'events')).toMatchObject({ events: 1 });
    expect(steps.find((step) => step.step === 'issues')).not.toHaveProperty('transitions');
    expect(
      loggerMock.info.mock.calls.filter(
        ([, data]) => data?.event === 'github_artifact_events_recorded'
      )
    ).toEqual([]);
    const anomaly = loggerMock.warn.mock.calls.find(
      ([, data]) => data?.event === 'github_pull_request_state_anomaly'
    );
    expect(anomaly[1]).toEqual(
      expect.objectContaining({ projectId: context.project.id, count: 1 })
    );
    expect(JSON.stringify(loggerMock.warn.mock.calls)).not.toContain('sigiloso');
  });
});

describe('S2-03 bateria — bloco K: concorrência e idempotência (V2.3.4)', () => {
  it('EV-K-02 gancho e job ao mesmo tempo: cada evento é despachado uma vez', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 50, { participant });

    const [hook, job] = await Promise.all([service().dispatchAfterSync(project.id), runJob()]);

    expect(hook.dispatched + job.dispatched).toBe(50);
    expect(await prisma.notification.count()).toBe(50);
    observe('EV-K-02 ocupados', { gancho: hook.busy, job: job.busy });
  });

  it('EV-K-03 reserva vencida durante o processamento: sem duplicata; registra o fechamento perdido (hipótese H20)', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 1, { participant });
    let release;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    let entered;
    const inside = new Promise((resolveInside) => {
      entered = resolveInside;
    });
    const slowRepository = {
      ...githubEventRepository,
      async participationOf(...args) {
        entered();
        await gate;
        return githubEventRepository.participationOf(...args);
      }
    };
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const slow = service(NOW, { repository: slowRepository, log }).runJob({ dryRun: false });
    await inside;
    const fast = await runJob(at(3 * MINUTE));
    release();
    const slowReport = await slow;

    const [event] = await eventsOf(project.id);
    observe('EV-K-03 reserva perdida', {
      lento: { claimed: slowReport.claimed, dispatched: slowReport.dispatched },
      rapido: { claimed: fast.claimed, dispatched: fast.dispatched },
      tentativas: event.attempts,
      logsDoLento: [...log.warn.mock.calls, ...log.error.mock.calls].map(([, data]) => data?.event)
    });
    expect(await prisma.notification.count()).toBe(1);
    expect(event.status).toBe('DISPATCHED');
  });

  it('EV-K-03 só quem detém a reserva fecha o evento: o despachante que a perdeu não grava o fechamento', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 1, { participant });
    let release;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    let entered;
    const inside = new Promise((resolveInside) => {
      entered = resolveInside;
    });
    const slowRepository = {
      ...githubEventRepository,
      async participationOf(...args) {
        entered();
        await gate;
        return githubEventRepository.participationOf(...args);
      }
    };

    const slow = service(NOW, { repository: slowRepository }).runJob({ dryRun: false });
    await inside;
    const fast = await runJob(at(3 * MINUTE));
    release();
    const slowReport = await slow;

    const [event] = await eventsOf(project.id);
    expect(fast.dispatched).toBe(1);
    expect(slowReport.dispatched).toBe(0);
    expect(event.dispatchedAt).toEqual(at(3 * MINUTE));
  });

  it('EV-K-04 vínculo criado durante a gravação dos eventos: alvos coerentes e sem deadlock (hipótese H18)', async () => {
    const project = await newProject();
    const owner = await person(project.id);
    const issues = [];
    for (let number = 1; number <= 50; number += 1) {
      const issue = await issueRow(project, number);
      await linkIssue(await createTask(prisma, project.id, { responsibleUserId: owner.id }), issue);
      issues.push(issue);
    }
    await prisma.gitHubEventCoverage.create({
      data: { projectId: project.id, coverageFrom: new Date('2026-01-01T00:00:00.000Z') }
    });
    const late = await createTask(prisma, project.id, { responsibleUserId: owner.id });

    const started = Date.now();
    const timings = {};
    await Promise.all([
      githubRepositoryEventsRepository
        .record(project.id, {
          pullRequestEvents: [],
          issueEvents: issues.map((issue) => ({
            providerEventId: `k04-${issue.id}`,
            number: issue.number,
            eventType: 'CLOSED',
            occurredAt: OCCURRED
          })),
          readStartedAt: NOW
        })
        .then(() => {
          timings.gravacao = Date.now() - started;
        }),
      taskLinkRepository.createIssue(late.id, issues[49].id).then(() => {
        timings.vinculo = Date.now() - started;
      })
    ]);

    const event = (await eventsOf(project.id)).find((row) => row.issueId === issues[49].id);
    const targets = event.targets.map((target) => target.taskId);
    observe('EV-K-04 tempos', { ...timings, tarefaNovaNosAlvos: targets.includes(late.id) });
    expect(targets.length === 1 || targets.length === 2).toBe(true);
    expect(event.linkedTaskCount).toBe(targets.length);
  });

  it('EV-K-05 reprocessamento junto com um despacho não duplica', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    const ids = await pendingEvents(project, 20, { participant });
    await prisma.gitHubArtifactEvent.updateMany({
      where: { id: { in: ids } },
      data: { status: 'FAILED', attempts: 5 }
    });

    await Promise.all([runJob(NOW, { retryFailed: true }), runJob(NOW)]);
    await runJob(at(MINUTE));

    expect(await prisma.notification.count()).toBe(20);
    expect(
      await prisma.gitHubArtifactEvent.count({
        where: { projectId: project.id, status: 'DISPATCHED' }
      })
    ).toBe(20);
  });

  it('EV-K-06 três jobs e um gancho sobre 500 eventos: cada um uma vez', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 500, { participant });

    const reports = await Promise.all([
      runJob(),
      runJob(),
      runJob(),
      service().dispatchAfterSync(project.id)
    ]);

    expect(reports.reduce((sum, report) => sum + report.dispatched, 0)).toBe(500);
    expect(await prisma.notification.count()).toBe(500);
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { status: { not: 'DISPATCHED' } } })
    ).toBe(0);
  }, 120000);

  it('EV-K-07 marcar todas como lidas junto com o despacho mantém o contador coerente', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 30, { participant });

    await Promise.all([runJob(), notificationService.markAllRead(participant.id)]);

    const unread = await prisma.notification.count({
      where: { recipientUserId: participant.id, readAt: null }
    });
    const count = await notificationService.unreadCount(participant.id);
    expect(count).toEqual(expect.objectContaining({ unreadCount: unread }));
  });
});

describe('S2-03 bateria — bloco D: privacidade e ciclo de vida (D16)', () => {
  it('EV-D-02 retenção nas fronteiras exatas, pendentes nunca saem, e a auditoria soma a fila', async () => {
    const project = await newProject();
    const owner = await person(project.id);
    const boundaryInstant = new Date(NOW.getTime() - 180 * DAY);
    const oneMsOlder = new Date(boundaryInstant.getTime() - 1);
    const notification = (createdAt, key) =>
      prisma.notification.create({
        data: {
          recipientUserId: owner.id,
          projectId: project.id,
          type: 'ISSUE_EVENT',
          dedupeKey: key,
          taskTitle: 'Tarefa',
          githubEvent: 'ISSUE_CLOSED',
          artifactNumber: 1,
          artifactTitle: 'Issue',
          createdAt
        }
      });
    const kept = await notification(boundaryInstant, 'RET:fica');
    const gone = await notification(oneMsOlder, 'RET:sai');
    const event = (status, detectedAt, key) =>
      prisma.gitHubArtifactEvent.create({
        data: {
          projectId: project.id,
          type: 'ISSUE_CLOSED',
          artifactNumber: 1,
          artifactTitle: 'Issue',
          detectedAt,
          nextAttemptAt: detectedAt,
          linkedTaskCount: 0,
          occurrenceKey: key,
          status
        }
      });
    const dispatchedOld = await event('DISPATCHED', oneMsOlder, 'R1');
    const failedOld = await event('FAILED', oneMsOlder, 'R2');
    const dispatchedEdge = await event('DISPATCHED', boundaryInstant, 'R3');
    const pendingOld = await event('PENDING', oneMsOlder, 'R4');
    const processingOld = await event('PROCESSING', oneMsOlder, 'R5');
    const configuration = { ...env, notificationRetentionDays: 180 };

    const dry = await runPrivacyRetention({ now: NOW, configuration });
    const applied = await runPrivacyRetention({ apply: true, now: NOW, configuration });

    expect(dry.counts).toMatchObject({ notifications: 1, githubArtifactEvents: 2 });
    expect(applied.counts).toMatchObject({ notifications: 1, githubArtifactEvents: 2 });
    expect(await prisma.notification.findUnique({ where: { id: kept.id } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: gone.id } })).toBeNull();
    const remaining = (await prisma.gitHubArtifactEvent.findMany({ select: { id: true } })).map(
      (row) => row.id
    );
    expect(remaining.sort((a, b) => a - b)).toEqual(
      [dispatchedEdge.id, pendingOld.id, processingOld.id].sort((a, b) => a - b)
    );
    expect(remaining).not.toContain(dispatchedOld.id);
    expect(remaining).not.toContain(failedOld.id);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'RETENTION_CLEANUP_EXECUTED' },
      orderBy: { id: 'desc' }
    });
    observe('EV-D-02 auditoria', audit?.metadataJson);
    expect(audit.metadataJson.count).toBeGreaterThanOrEqual(3);
  });

  it('EV-D-03 autor de comentário anonimizado passa a contar INACTIVE_ACCOUNT nos eventos seguintes', async () => {
    const { project, issue, task, responsible } = await linkedIssueScenario();
    await person(project.id, { role: 'OWNER' });
    const commenter = await person(project.id);
    await comment(task, commenter);
    await prisma.privacyRequest.create({
      data: {
        userId: commenter.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });

    await closeIssue(issue);
    await runJob();

    const [event] = await eventsOf(project.id);
    observe('EV-D-03 depois da anonimização', {
      comentariosDoAnonimizado: await prisma.taskComment.count({
        where: { authorUserId: commenter.id }
      }),
      outcome: event.outcome
    });
    expect(await recipientsOf()).toEqual([responsible.id]);
    expect(await recipientsOf({ recipientUserId: commenter.id })).toEqual([]);
  });
});

describe('S2-03 bateria — bloco M: métrica oficial (C7, D14)', () => {
  async function rfScenario(kind) {
    const project = await newProject();
    const participant = async (options = {}) => person(project.id, options);
    const make = async (users, extra = {}) => {
      const task = await createTask(prisma, project.id, {
        responsibleUserId: users[0]?.id ?? null
      });
      for (const user of users.slice(1)) await comment(task, user);
      sequence += 1;
      const artifact =
        kind === 'ISSUE'
          ? await issueRow(project, sequence)
          : await pullRequestRow(project, sequence);
      if (kind === 'ISSUE') await linkIssue(task, artifact);
      else await linkPullRequest(task, artifact);
      const transition = (when = OCCURRED) =>
        kind === 'ISSUE' ? closeIssue(artifact, { when }) : mergePullRequest(artifact, { when });
      return { task, artifact, transition, ...extra };
    };
    const r1 = await participant();
    const c1 = await participant();
    const deactivated = await participant({ accountStatus: 'DEACTIVATED' });
    const inactive = await participant({ isActive: false });
    const outside = await participant();
    const deleted = await participant();
    const disabled = await participant();
    await preference(disabled, kind === 'ISSUE' ? 'ISSUE_EVENT' : 'PULL_REQUEST_EVENT', false);
    const eligible = await make([r1, c1]);
    const withDeactivated = await make([deactivated]);
    const withInactive = await make([inactive]);
    const withOutside = await make([outside]);
    const withDeleted = await make([deleted]);
    const empty = await make([]);
    const withDisabled = await make([disabled]);
    for (const item of [eligible, withDeactivated, withInactive, withDeleted, empty, withDisabled])
      await item.transition();
    await withOutside.transition(new Date(NOW.getTime() - 10 * DAY));
    await prisma.task.delete({ where: { id: withDeleted.task.id } });
    return { project, people: { r1, c1, outside } };
  }

  function totals(events) {
    return events.reduce(
      (sum, event) => {
        sum.eligible += event.outcome.eligible;
        sum.created += event.outcome.created;
        sum.alreadyNotified += event.outcome.alreadyNotified;
        sum.participants += event.outcome.participants;
        for (const [reason, count] of Object.entries(event.outcome.excluded))
          sum.excluded[reason] += count;
        return sum;
      },
      { eligible: 0, created: 0, alreadyNotified: 0, participants: 0, excluded: excludedWith() }
    );
  }

  it('EV-M-01 EV-M-02 recálculo independente por RF bate com o outcome e com os invariantes', async () => {
    for (const kind of ['ISSUE', 'PULL_REQUEST']) {
      const { project, people } = await rfScenario(kind);
      await runJob();
      const events = await eventsOf(project.id);
      const sum = totals(events);
      const delivered = await prisma.notification.findMany({
        where: { projectId: project.id },
        select: { recipientUserId: true, dedupeKey: true }
      });

      expect(events, kind).toHaveLength(7);
      expect(sum.excluded, kind).toEqual(
        excludedWith({
          NO_TASK: 1,
          NO_PARTICIPANT: 1,
          INACTIVE_ACCOUNT: 1,
          INACTIVE_MEMBER: 1,
          PREFERENCE_OFF: 1
        })
      );
      expect(sum.eligible, kind).toBe(3);
      expect(
        delivered.map((row) => row.recipientUserId).sort((a, b) => a - b),
        kind
      ).toEqual([people.r1.id, people.c1.id, people.outside.id].sort((a, b) => a - b));
      expect((delivered.length / sum.eligible) * 100, kind).toBe(100);
      for (const event of events) {
        const pairs = Object.entries(event.outcome.excluded)
          .filter(([reason]) => !['NO_TASK', 'NO_PARTICIPANT'].includes(reason))
          .reduce((count, [, value]) => count + value, 0);
        expect(event.outcome.created + event.outcome.alreadyNotified, kind).toBe(
          event.outcome.eligible
        );
        expect(event.outcome.participants, kind).toBe(event.outcome.eligible + pairs);
        expect(event.outcome.excluded.NO_TASK, kind).toBe(
          event.linkedTaskCount - event.targets.length
        );
      }
    }
  });

  it('EV-M-03 depois de uma retomada, created é zero e alreadyNotified carrega a entrega (hipótese H6)', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    vi.spyOn(githubEventRepository, 'finish').mockRejectedValueOnce(new Error('queda'));
    vi.spyOn(githubEventRepository, 'release').mockRejectedValueOnce(new Error('queda'));

    await runJob();
    vi.restoreAllMocks();
    await runJob(at(3 * MINUTE));

    const [event] = await eventsOf(project.id);
    const byCreated = (event.outcome.created / event.outcome.eligible) * 100;
    const byDelivered =
      ((event.outcome.created + event.outcome.alreadyNotified) / event.outcome.eligible) * 100;
    observe('EV-M-03 cobertura depois da retomada', {
      outcome: event.outcome,
      coberturaPorCreated: byCreated,
      coberturaPorCreatedMaisJaNotificadas: byDelivered
    });
    expect(event.outcome).toMatchObject({ eligible: 1, created: 0, alreadyNotified: 1 });
    expect(await prisma.notification.count()).toBe(1);
  });

  it('EV-M-04 EV-M-05 sequência com falha e job: as fontes de contagem e a quantidade emitida', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 6, { participant });
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
      Object.assign(new Error('falha'), { code: 'P1001' })
    );
    const reports = [];
    reports.push(await service(NOW).dispatchAfterSync(project.id));
    vi.restoreAllMocks();
    reports.push(await runJob(at(2 * MINUTE)));

    const createdByReports = reports.reduce((sum, report) => sum + report.created, 0);
    const events = await eventsOf(project.id);
    const sum = totals(events);
    const rows = await prisma.notification.count({ where: { projectId: project.id } });
    const emitted = await prisma.notification.groupBy({
      by: ['type'],
      where: { projectId: project.id, createdAt: { gte: new Date(Date.now() - DAY) } },
      _count: { _all: true }
    });
    observe('EV-M-04 fontes', {
      createdPelasSaidas: createdByReports,
      createdPeloOutcome: sum.created,
      linhas: rows,
      emitidasPorTipo: emitted
    });
    expect(createdByReports).toBe(rows);
    expect(sum.created + sum.alreadyNotified).toBe(rows);
    expect(emitted).toEqual([{ type: 'ISSUE_EVENT', _count: { _all: 6 } }]);
  });
});

describe('S2-03 bateria — bloco Q: custo local (V15.1.3, V15.2.2)', () => {
  it('EV-Q-05 custo do despacho por evento conforme participantes e tarefas', async () => {
    const results = [];
    for (const [participants, tasksPerEvent] of [
      [1, 1],
      [10, 1],
      [100, 1],
      [1, 50]
    ]) {
      await cleanTestDatabase(prisma);
      const project = await newProject();
      const owner = await person(project.id);
      const others = [];
      for (let index = 1; index < participants; index += 1) others.push(await person(project.id));
      const pullRequest = await pullRequestRow(project, 1);
      for (let index = 0; index < tasksPerEvent; index += 1) {
        const task = await createTask(prisma, project.id, {
          responsibleUserId: owner.id,
          pullRequestId: pullRequest.id
        });
        await openLinkPeriod(prisma, {
          projectId: project.id,
          taskId: task.id,
          pullRequestId: pullRequest.id
        });
        for (const user of others) await comment(task, user);
      }
      await mergePullRequest(pullRequest);
      const started = performance.now();
      const report = await runJob();
      results.push({
        participants,
        tasksPerEvent,
        created: report.created,
        durationMs: Math.round(performance.now() - started)
      });
    }
    observe('EV-Q-05 despacho por evento', results);
    expect(results.map((row) => row.created)).toEqual([1, 10, 100, 50]);
  }, 180000);

  it('EV-Q-06 job com 1.000 e 5.000 eventos pendentes', async () => {
    const results = [];
    for (const total of [1000, 5000]) {
      await cleanTestDatabase(prisma);
      const project = await newProject();
      const participant = await person(project.id);
      await pendingEvents(project, total, { participant });
      const runs = [];
      for (let index = 0; index < 10; index += 1) {
        const started = performance.now();
        const report = await runJob(at(index * 15 * MINUTE));
        runs.push({
          dispatched: report.dispatched,
          pendingAfter: report.pendingAfter,
          durationMs: Math.round(performance.now() - started)
        });
        if (!report.pendingAfter) break;
      }
      results.push({ total, executions: runs.length, runs });
    }
    observe('EV-Q-06 job', results);
    expect(results[0].executions).toBe(1);
    expect(results[1].executions).toBe(5);
  }, 600000);
});
