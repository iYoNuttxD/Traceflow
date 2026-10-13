import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const boundary = vi.hoisted(() => ({ client: null, calls: 0 }));
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
  githubInstallationClientFactory: {
    forInstallation: () => {
      boundary.calls += 1;
      return boundary.client;
    }
  }
}));

const NOW = new Date('2026-10-20T12:00:00.000Z');
const OCCURRED = new Date('2026-10-20T10:00:00.000Z');
const OUTSIDE_WINDOW = new Date('2026-10-12T10:00:00.000Z');
const LATER = (ms) => new Date(NOW.getTime() + ms);
const MINUTE = 60_000;
const SECRET_TITLE = 'Título sigiloso\r\n{"level":"error","forjado":true}';

let prisma;
let issueRepository;
let pullRequestRepository;
let githubEventRepository;
let createGithubEventNotificationService;
let githubEventNotificationService;
let notificationCoverage;
let githubSyncRunRepository;
let executeGithubSyncRun;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ createGithubEventNotificationService, githubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ notificationCoverage } =
    await import('../../src/modules/notifications/notification.policy.js'));
  ({ githubSyncRunRepository } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  boundary.client = null;
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const service = (now = NOW, overrides = {}) =>
  createGithubEventNotificationService({
    clock: () => now,
    configuration: { githubEventNotificationsLookbackDays: 7 },
    ...overrides
  });
const runJob = (now = NOW, options = {}, overrides = {}) =>
  service(now, overrides).runJob({ dryRun: false, ...options });

async function person(projectId, { role = 'MEMBER', isActive = true, accountStatus } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa S2-03 ${sequence}`,
      username: `s203g${sequence}`,
      email: `s203-g-${sequence}@example.invalid`,
      ...(accountStatus ? { accountStatus } : {})
    }
  });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: user.id, role, isActive }
    });
  return user;
}

async function openIssue(project, number, title = `Issue ${number}`) {
  return prisma.issue.create({
    data: {
      projectId: project.id,
      githubId: `s203-issue-${project.id}-${number}`,
      number,
      title,
      state: 'open',
      labels: [],
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${number}`
    }
  });
}

const issueItem = (issue, state, at) => ({
  projectId: issue.projectId,
  githubId: issue.githubId,
  number: issue.number,
  title: issue.title,
  state,
  closedAtGithub: state === 'closed' ? at : null,
  updatedAtGithub: at,
  githubUrl: issue.githubUrl,
  labels: []
});

const closeIssue = (issue, { at = OCCURRED, detectedAt = NOW } = {}) =>
  issueRepository.upsertMany([issueItem(issue, 'closed', at)], { detectedAt });
const reopenIssue = (issue, { at = OCCURRED, detectedAt = NOW } = {}) =>
  issueRepository.upsertMany([issueItem(issue, 'open', at)], { detectedAt });

async function openPullRequest(project, number, title = `PR ${number}`) {
  return prisma.pullRequest.create({
    data: {
      projectId: project.id,
      githubId: `s203-pr-${project.id}-${number}`,
      number,
      title,
      state: 'open',
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`
    }
  });
}

const pullRequestItem = (pullRequest, state, { closedAt = null, mergedAt = null } = {}) => ({
  projectId: pullRequest.projectId,
  githubId: pullRequest.githubId,
  number: pullRequest.number,
  title: pullRequest.title,
  state,
  closedAtGithub: closedAt,
  mergedAtGithub: mergedAt,
  updatedAtGithub: closedAt || mergedAt || OCCURRED,
  githubUrl: pullRequest.githubUrl
});

const mergePullRequest = (pullRequest, { at = OCCURRED, detectedAt = NOW } = {}) =>
  pullRequestRepository.upsertMany(
    [pullRequestItem(pullRequest, 'closed', { closedAt: at, mergedAt: at })],
    { detectedAt }
  );
const closePullRequest = (pullRequest, { at = OCCURRED, detectedAt = NOW } = {}) =>
  pullRequestRepository.upsertMany([pullRequestItem(pullRequest, 'closed', { closedAt: at })], {
    detectedAt
  });
const reopenPullRequest = (pullRequest, { detectedAt = NOW } = {}) =>
  pullRequestRepository.upsertMany([pullRequestItem(pullRequest, 'open')], { detectedAt });

const linkIssue = (task, issue) =>
  prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
const linkPullRequest = (task, pullRequest) =>
  prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pullRequest.id } });
const comment = (task, user, { deleted = false } = {}) =>
  prisma.taskComment.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      authorUserId: user.id,
      content: 'comentário de verificação',
      deletedAt: deleted ? NOW : null
    }
  });
const effort = (task, user) =>
  prisma.taskTimeEntry.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      source: 'MANUAL',
      startedAt: new Date('2026-10-19T10:00:00.000Z'),
      endedAt: new Date('2026-10-19T11:00:00.000Z'),
      durationSeconds: 3600,
      startedById: user.id,
      endedById: user.id
    }
  });
const preference = (user, type, enabled, enabledAt = null) =>
  prisma.notificationPreference.create({ data: { userId: user.id, type, enabled, enabledAt } });

const notificationsOf = (where = {}) =>
  prisma.notification.findMany({
    where,
    orderBy: [{ recipientUserId: 'asc' }, { taskId: 'asc' }]
  });
const eventsOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({ where: { projectId }, orderBy: { id: 'asc' } });

function excludedWith(overrides = {}) {
  return {
    NO_TASK: 0,
    NO_PARTICIPANT: 0,
    OUTSIDE_WINDOW: 0,
    INACTIVE_ACCOUNT: 0,
    INACTIVE_MEMBER: 0,
    PREFERENCE_OFF: 0,
    ...overrides
  };
}

async function scenario() {
  const project = await createProject(prisma);
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, {
    title: 'Tarefa vinculada S2-03',
    responsibleUserId: responsible.id
  });
  return { project, responsible, task };
}

describe('S2-03 despacho: destinatários e conteúdo (D6, D10, C3)', () => {
  it('G1 responsável, autor de comentário e quem registrou esforço recebem uma notificação cada', async () => {
    const { project, responsible, task } = await scenario();
    const commenter = await person(project.id);
    const worker = await person(project.id);
    const deletedAuthor = await person(project.id);
    await comment(task, responsible);
    await comment(task, commenter);
    await comment(task, commenter);
    await comment(task, deletedAuthor, { deleted: true });
    await effort(task, worker);
    await effort(task, responsible);
    const issue = await openIssue(project, 45, 'Corrigir login');
    await linkIssue(task, issue);
    await closeIssue(issue);
    const [event] = await eventsOf(project.id);

    const report = await runJob();

    const rows = await notificationsOf();
    expect(rows.map((row) => row.recipientUserId)).toEqual(
      [responsible.id, commenter.id, worker.id].sort((a, b) => a - b)
    );
    expect(rows[0]).toMatchObject({
      projectId: project.id,
      taskId: task.id,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${event.id}:task:${task.id}`,
      taskTitle: 'Tarefa vinculada S2-03',
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/45',
      githubOccurredAt: OCCURRED,
      actorUserId: null,
      fromStatus: null,
      toStatus: null,
      dueDate: null,
      readAt: null
    });
    expect(await prisma.gitHubArtifactEvent.findUnique({ where: { id: event.id } })).toMatchObject({
      status: 'DISPATCHED',
      attempts: 1,
      claimToken: null,
      claimedUntil: null,
      dispatchedAt: NOW,
      outcome: {
        tasks: 1,
        participants: 3,
        eligible: 3,
        created: 3,
        alreadyNotified: 0,
        excluded: excludedWith()
      }
    });
    expect(report).toMatchObject({ scanned: 1, claimed: 1, dispatched: 1, created: 3, failed: 0 });
  });

  it('G2 PR vinculada a duas tarefas do mesmo responsável gera duas notificações', async () => {
    const { project, responsible, task } = await scenario();
    const second = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const pullRequest = await openPullRequest(project, 8);
    await linkPullRequest(task, pullRequest);
    await linkPullRequest(second, pullRequest);
    await mergePullRequest(pullRequest);

    await runJob();

    const rows = await notificationsOf();
    expect(rows.map((row) => [row.recipientUserId, row.taskId, row.type, row.githubEvent])).toEqual(
      [
        [responsible.id, task.id, 'PULL_REQUEST_EVENT', 'PULL_REQUEST_MERGED'],
        [responsible.id, second.id, 'PULL_REQUEST_EVENT', 'PULL_REQUEST_MERGED']
      ].sort((a, b) => a[1] - b[1])
    );
  });

  it('G3 cada exclusão é contada pelo seu motivo e não gera notificação', async () => {
    const project = await createProject(prisma);
    const inactiveAccount = await person(project.id, { accountStatus: 'DEACTIVATED' });
    const inactiveMember = await person(project.id, { isActive: false });
    const preferenceOff = await person(project.id);
    const reenabledLater = await person(project.id);
    await preference(preferenceOff, 'ISSUE_EVENT', false);
    await preference(reenabledLater, 'ISSUE_EVENT', true, LATER(1));
    const task = await createTask(prisma, project.id, { responsibleUserId: inactiveAccount.id });
    await comment(task, inactiveMember);
    await effort(task, preferenceOff);
    await comment(task, reenabledLater);
    const empty = await createTask(prisma, project.id);
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await linkIssue(empty, issue);
    await closeIssue(issue);

    const old = await openIssue(project, 2);
    const oldTask = await createTask(prisma, project.id, { responsibleUserId: preferenceOff.id });
    await linkIssue(oldTask, old);
    await closeIssue(old, { at: OUTSIDE_WINDOW });

    const vanished = await openIssue(project, 3);
    const vanishedTask = await createTask(prisma, project.id, {
      responsibleUserId: reenabledLater.id
    });
    await linkIssue(vanishedTask, vanished);
    await closeIssue(vanished);
    await prisma.task.delete({ where: { id: vanishedTask.id } });

    const report = await runJob();

    expect(await prisma.notification.count()).toBe(0);
    const outcomes = Object.fromEntries(
      (await prisma.gitHubArtifactEvent.findMany()).map((event) => [
        event.artifactNumber,
        event.outcome
      ])
    );
    expect(outcomes[1]).toEqual({
      tasks: 2,
      participants: 4,
      eligible: 0,
      created: 0,
      alreadyNotified: 0,
      excluded: excludedWith({
        NO_PARTICIPANT: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 2
      })
    });
    expect(outcomes[2].excluded).toEqual(excludedWith({ OUTSIDE_WINDOW: 1 }));
    expect(outcomes[3]).toMatchObject({ tasks: 0, excluded: excludedWith({ NO_TASK: 1 }) });
    expect(report.excluded).toEqual(
      excludedWith({
        NO_TASK: 1,
        NO_PARTICIPANT: 1,
        OUTSIDE_WINDOW: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 2
      })
    );
    expect(report).toMatchObject({ dispatched: 3, created: 0, failed: 0 });
  });

  it('G10 a preferência é por tipo: ISSUE_EVENT desligado não bloqueia PULL_REQUEST_EVENT', async () => {
    const { project, responsible, task } = await scenario();
    await preference(responsible, 'ISSUE_EVENT', false);
    const issue = await openIssue(project, 1);
    const pullRequest = await openPullRequest(project, 2);
    await linkIssue(task, issue);
    await linkPullRequest(task, pullRequest);
    await closeIssue(issue);
    await closePullRequest(pullRequest);

    await runJob();

    expect((await notificationsOf()).map((row) => [row.type, row.githubEvent])).toEqual([
      ['PULL_REQUEST_EVENT', 'PULL_REQUEST_CLOSED']
    ]);
  });
});

describe('S2-03 despacho: idempotência, concorrência e queda (D9, C4, C5)', () => {
  it('G4 despachar de novo não duplica; reabrir o evento à força só conta como já notificado', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);

    const first = await runJob();
    const second = await runJob();
    const [event] = await eventsOf(project.id);
    await prisma.gitHubArtifactEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', nextAttemptAt: NOW }
    });
    const forced = await runJob();

    expect(first).toMatchObject({ dispatched: 1, created: 1 });
    expect(second).toMatchObject({ scanned: 0, dispatched: 0, created: 0 });
    expect(forced).toMatchObject({ dispatched: 1, created: 0, alreadyNotified: 1 });
    expect(await prisma.notification.count()).toBe(1);
  });

  it('G5 dois despachos simultâneos reservam cada evento uma vez e não duplicam', async () => {
    const { project, responsible } = await scenario();
    for (let number = 1; number <= 20; number += 1) {
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
      const issue = await openIssue(project, number);
      await linkIssue(task, issue);
      await closeIssue(issue);
    }

    const reports = await Promise.all([runJob(), runJob()]);

    expect(reports[0].claimed + reports[1].claimed).toBe(20);
    expect(reports[0].dispatched + reports[1].dispatched).toBe(20);
    expect(reports[0].created + reports[1].created).toBe(20);
    expect(await prisma.notification.count()).toBe(20);
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { status: 'DISPATCHED', attempts: 1 } })
    ).toBe(20);
  });

  it('G6 queda depois de gravar as notificações: outro despacho retoma depois da reserva e não duplica', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);
    vi.spyOn(githubEventRepository, 'finish').mockRejectedValueOnce(new Error('queda'));
    vi.spyOn(githubEventRepository, 'release').mockRejectedValueOnce(new Error('queda'));

    await expect(runJob()).resolves.toMatchObject({ dispatched: 0 });
    const [stuck] = await eventsOf(project.id);
    expect(stuck).toMatchObject({ status: 'PROCESSING', attempts: 1 });
    expect(await prisma.notification.count()).toBe(1);

    const early = await runJob(LATER(MINUTE));
    const resumed = await runJob(LATER(2 * MINUTE + 1));

    expect(early).toMatchObject({ scanned: 0 });
    expect(resumed).toMatchObject({ claimed: 1, dispatched: 1, created: 0, alreadyNotified: 1 });
    expect(await prisma.notification.count()).toBe(1);
    expect((await eventsOf(project.id))[0]).toMatchObject({ status: 'DISPATCHED', attempts: 2 });
  });

  it('G7 falha temporária volta a PENDING com espera de 1 minuto e é despachada depois', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);
    const failure = Object.assign(new Error('Deadlock found when trying to get lock'), {
      code: 'P2034'
    });
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(failure);

    const failed = await runJob();
    const [pending] = await eventsOf(project.id);
    const tooEarly = await runJob(LATER(30_000));
    const retried = await runJob(LATER(MINUTE));

    expect(failed).toMatchObject({ claimed: 1, dispatched: 0, retryScheduled: 1, failed: 0 });
    expect(pending).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastErrorCode: 'P2034',
      nextAttemptAt: LATER(MINUTE),
      claimToken: null
    });
    expect(tooEarly).toMatchObject({ scanned: 0 });
    expect(retried).toMatchObject({ dispatched: 1, created: 1 });
    expect(await prisma.notification.count()).toBe(1);
  });

  it('G8 cinco falhas viram FAILED; o reprocessamento manual devolve à fila e audita', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const failing = vi
      .spyOn(githubEventRepository, 'participationOf')
      .mockRejectedValue(new Error('indisponível'));
    const delays = [0, 1, 5, 30, 120];
    let elapsed = 0;
    const reports = [];
    for (const delay of delays) {
      elapsed += delay * MINUTE;
      reports.push(await runJob(LATER(elapsed), {}, { log }));
    }

    expect(reports.map((report) => [report.retryScheduled, report.failed])).toEqual([
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
      [0, 1]
    ]);
    expect((await eventsOf(project.id))[0]).toMatchObject({
      status: 'FAILED',
      attempts: 5,
      lastErrorCode: 'GITHUB_EVENT_DISPATCH_FAILED'
    });
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'github_event_notification_failed', attempts: 5 })
    );
    expect((await runJob(LATER(elapsed + 600 * MINUTE))).scanned).toBe(0);

    failing.mockRestore();
    const dry = await service(LATER(elapsed)).runJob({ dryRun: true, retryFailed: true });
    const requeued = await runJob(LATER(elapsed), { retryFailed: true });

    expect(dry).toMatchObject({ wouldRequeue: 1, created: 0 });
    expect(requeued).toMatchObject({ requeued: 1, dispatched: 1, created: 1 });
    expect((await eventsOf(project.id))[0]).toMatchObject({ status: 'DISPATCHED', attempts: 1 });
    expect(
      await prisma.auditEvent.findMany({
        where: { action: 'GITHUB_EVENT_NOTIFICATIONS_REQUEUED' },
        select: { actorType: true, actorUserId: true, metadataJson: true }
      })
    ).toEqual([{ actorType: 'SYSTEM', actorUserId: null, metadataJson: { count: 1 } }]);
  });

  it('G12 par perdido por exclusão da tarefa conta como NO_TASK; par perdido sem motivo volta à fila', async () => {
    const { project, responsible, task } = await scenario();
    const survivor = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await linkIssue(survivor, issue);
    await closeIssue(issue);
    const insert = githubEventRepository.insertNotifications;
    vi.spyOn(githubEventRepository, 'insertNotifications').mockImplementationOnce(async (rows) => {
      await prisma.task.delete({ where: { id: task.id } });
      return insert.call(githubEventRepository, rows);
    });

    const report = await runJob();

    const [event] = await eventsOf(project.id);
    expect(event.outcome).toEqual({
      tasks: 1,
      participants: 1,
      eligible: 1,
      created: 1,
      alreadyNotified: 0,
      excluded: excludedWith({ NO_TASK: 1 })
    });
    expect(report).toMatchObject({ dispatched: 1, created: 1, alreadyNotified: 0 });

    const other = await openIssue(project, 2);
    await linkIssue(survivor, other);
    await closeIssue(other);
    vi.spyOn(githubEventRepository, 'insertNotifications').mockResolvedValueOnce(0);

    const lost = await runJob();

    expect(lost).toMatchObject({ dispatched: 0, retryScheduled: 1 });
    expect((await eventsOf(project.id))[1]).toMatchObject({
      status: 'PENDING',
      lastErrorCode: 'NOTIFICATION_NOT_PERSISTED'
    });
  });

  it('G15 par gravado por outro despachante entre a leitura e a inserção não falha nem duplica', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);
    const insert = githubEventRepository.insertNotifications;
    vi.spyOn(githubEventRepository, 'insertNotifications').mockImplementationOnce(async (rows) => {
      await prisma.notification.create({ data: rows[0] });
      return insert.call(githubEventRepository, rows);
    });

    const report = await runJob();

    expect(report).toMatchObject({ dispatched: 1, retryScheduled: 0, failed: 0 });
    expect(await prisma.notification.count()).toBe(1);
    expect((await eventsOf(project.id))[0].status).toBe('DISPATCHED');
  });

  it('G14 o despacho nunca chama o cliente GitHub', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);
    boundary.calls = 0;

    await runJob();
    await githubEventNotificationService.dispatchAfterSync(project.id);

    expect(boundary.calls).toBe(0);
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe('S2-03 despacho: gancho na sincronização (D9, V16.5.3)', () => {
  async function integratedProject() {
    sequence += 1;
    const owner = await person();
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: `s203-dispatch-${sequence}`,
        accountId: `s203-dispatch-account-${sequence}`,
        accountLogin: 'usuario-s203',
        accountType: 'User',
        installedAt: new Date(),
        status: 'ACTIVE'
      }
    });
    const project = await createProject(prisma);
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: owner.id, role: 'OWNER' }
    });
    const repositoryId = String(94000 + sequence);
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

  function githubDouble(repositoryId, { pullRequests = [], issues = [], issuesFail = false }) {
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
      listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: null }])),
      listCommitPages: vi.fn(() => pages([])),
      listPullRequestPages: vi.fn(() => pages(pullRequests)),
      listIssuePages: vi.fn(() => {
        if (issuesFail)
          return (async function* failing() {
            yield* [];
            throw Object.assign(new Error('GitHub indisponível'), { status: 502 });
          })();
        return pages(issues);
      })
    };
  }

  const prItem = (number, state, mergedAt = null) => ({
    githubId: `s203-sync-pr-${number}`,
    number,
    title: `PR ${number}`,
    state,
    closedAtGithub: state === 'closed' ? mergedAt || OCCURRED : null,
    mergedAtGithub: mergedAt,
    githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`
  });

  async function runSync(project, owner) {
    const run = await githubSyncRunRepository.create(project.id, owner.id);
    return executeGithubSyncRun(run.id);
  }

  async function syncedPullRequest() {
    const context = await integratedProject();
    const responsible = await person(context.project.id);
    const task = await createTask(prisma, context.project.id, {
      responsibleUserId: responsible.id
    });
    boundary.client = githubDouble(context.repositoryId, { pullRequests: [prItem(7, 'open')] });
    expect((await runSync(context.project, context.owner)).status).toBe('SUCCEEDED');
    await linkPullRequest(
      task,
      await prisma.pullRequest.findFirst({ where: { projectId: context.project.id } })
    );
    return { ...context, responsible, task };
  }

  it('G9 a execução bem-sucedida despacha os eventos do projeto na hora', async () => {
    const { project, owner, repositoryId, responsible } = await syncedPullRequest();
    boundary.client = githubDouble(repositoryId, { pullRequests: [prItem(7, 'closed', OCCURRED)] });

    const run = await runSync(project, owner);

    expect(run.status).toBe('SUCCEEDED');
    expect((await notificationsOf()).map((row) => [row.recipientUserId, row.githubEvent])).toEqual([
      [responsible.id, 'PULL_REQUEST_MERGED']
    ]);
    expect((await eventsOf(project.id))[0].status).toBe('DISPATCHED');
  });

  it('G9 a execução que falha depois de gravar a página de PRs também despacha o evento dela', async () => {
    const { project, owner, repositoryId, responsible } = await syncedPullRequest();
    boundary.client = githubDouble(repositoryId, {
      pullRequests: [prItem(7, 'closed', OCCURRED)],
      issuesFail: true
    });

    const run = await runSync(project, owner);

    expect(run.status).toBe('FAILED');
    expect((await notificationsOf()).map((row) => row.recipientUserId)).toEqual([responsible.id]);
  });

  it('G9 falha no despacho não muda o resultado da sincronização e fica para o job', async () => {
    const { project, owner, repositoryId } = await syncedPullRequest();
    boundary.client = githubDouble(repositoryId, { pullRequests: [prItem(7, 'closed', OCCURRED)] });
    vi.spyOn(githubEventRepository, 'findDueEventIds').mockRejectedValueOnce(
      Object.assign(new Error('falha'), { code: 'P1001' })
    );
    loggerMock.warn.mockClear();

    const run = await runSync(project, owner);

    expect(run.status).toBe('SUCCEEDED');
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notifications_dispatch_failed',
        projectId: project.id,
        errorCode: 'P1001'
      })
    );
    expect((await eventsOf(project.id))[0].status).toBe('PENDING');
    expect(await prisma.notification.count()).toBe(0);
    expect(await githubEventNotificationService.dispatchAfterSync(project.id)).toMatchObject({
      dispatched: 1
    });
  });
});

describe('S2-03 despacho: logs e saída sem dado sensível (D15, V16.2.5, V16.4.1)', () => {
  it('G11 logs e saída do job trazem só contagens, ids e códigos', async () => {
    const { project, responsible, task } = await scenario();
    const issue = await openIssue(project, 1, SECRET_TITLE);
    await linkIssue(task, issue);
    await closeIssue(issue);
    const pending = await openIssue(project, 2, SECRET_TITLE);
    await linkIssue(task, pending);
    await closeIssue(pending);
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(
      Object.assign(new Error(`erro com ${SECRET_TITLE} e ${responsible.email}`), {
        code: 'P2034'
      })
    );

    const report = await runJob(NOW, {}, { log });

    const logged = JSON.stringify([
      log.info.mock.calls,
      log.warn.mock.calls,
      log.error.mock.calls,
      report
    ]);
    for (const secret of [
      'sigiloso',
      'forjado',
      'https://github.com',
      responsible.email,
      responsible.name,
      'Deadlock'
    ])
      expect(logged).not.toContain(secret);
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notification_attempt_failed',
        projectId: project.id,
        attempt: 1,
        errorCode: 'P2034'
      })
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notifications_dispatch_completed',
        dispatched: 1,
        retryScheduled: 1
      })
    );
  });

  it('o dry-run não grava nada e calcula o que criaria', async () => {
    const { project, task } = await scenario();
    const issue = await openIssue(project, 1);
    await linkIssue(task, issue);
    await closeIssue(issue);

    const report = await service().runJob({ dryRun: true });

    expect(report).toMatchObject({
      dryRun: true,
      scanned: 1,
      claimed: 0,
      dispatched: 0,
      created: 0,
      wouldCreate: 1,
      pendingAfter: 1,
      lookbackDays: 7
    });
    expect(await prisma.notification.count()).toBe(0);
    expect((await eventsOf(project.id))[0]).toMatchObject({ status: 'PENDING', attempts: 0 });
  });
});

describe('S2-03 métrica oficial (C7, D14)', () => {
  async function exclusionScenario(project, transition) {
    const deactivated = await person(project.id, { accountStatus: 'DEACTIVATED' });
    const inactive = await person(project.id, { isActive: false });
    const disabled = await person(project.id);
    const type = transition === 'ISSUE' ? 'ISSUE_EVENT' : 'PULL_REQUEST_EVENT';
    await preference(disabled, type, false);
    const task = await createTask(prisma, project.id, { responsibleUserId: deactivated.id });
    await comment(task, inactive);
    await effort(task, disabled);
    const empty = await createTask(prisma, project.id);
    return [task, empty];
  }

  function metric(events, report) {
    const totals = events.reduce(
      (sum, event) => {
        sum.eligible += event.outcome.eligible;
        sum.delivered += event.outcome.created + event.outcome.alreadyNotified;
        for (const [reason, count] of Object.entries(event.outcome.excluded))
          sum.excluded[reason] = (sum.excluded[reason] || 0) + count;
        return sum;
      },
      { eligible: 0, delivered: 0, excluded: {} }
    );
    expect(totals.excluded).toEqual(report.excluded);
    return { ...totals, coverage: notificationCoverage(totals) };
  }

  it('M3 RF60: 100% sobre os elegíveis, com cada exclusão contada', async () => {
    const project = await createProject(prisma);
    const first = await person(project.id);
    const commenter = await person(project.id);
    const second = await person(project.id);
    const third = await person(project.id);
    const old = await person(project.id);
    const taskA = await createTask(prisma, project.id, { responsibleUserId: first.id });
    await comment(taskA, commenter);
    const taskB = await createTask(prisma, project.id, { responsibleUserId: second.id });
    const taskC = await createTask(prisma, project.id, { responsibleUserId: third.id });
    const taskD = await createTask(prisma, project.id, { responsibleUserId: old.id });
    const closed = await openIssue(project, 1);
    await linkIssue(taskA, closed);
    await linkIssue(taskB, closed);
    const reopened = await openIssue(project, 2);
    await linkIssue(taskC, reopened);
    await closeIssue(reopened, { at: new Date('2026-10-19T10:00:00.000Z') });
    const outside = await openIssue(project, 3);
    await linkIssue(taskD, outside);
    const excluded = await openIssue(project, 4);
    for (const task of await exclusionScenario(project, 'ISSUE')) await linkIssue(task, excluded);
    const unlinked = await openIssue(project, 5);
    await prisma.gitHubArtifactEvent.deleteMany();

    await closeIssue(closed);
    await reopenIssue(reopened);
    await closeIssue(outside, { at: OUTSIDE_WINDOW });
    await closeIssue(excluded);
    await closeIssue(unlinked);
    await closeIssue(closed);
    const report = await runJob();

    const events = await eventsOf(project.id);
    const result = metric(events, report);
    expect(events.map((event) => [event.artifactNumber, event.type])).toEqual([
      [1, 'ISSUE_CLOSED'],
      [2, 'ISSUE_REOPENED'],
      [3, 'ISSUE_CLOSED'],
      [4, 'ISSUE_CLOSED']
    ]);
    expect(result).toMatchObject({ eligible: 4, delivered: 4, coverage: 100 });
    expect(result.excluded).toEqual(
      excludedWith({
        NO_PARTICIPANT: 1,
        OUTSIDE_WINDOW: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 1
      })
    );
    const rows = await notificationsOf({ type: 'ISSUE_EVENT' });
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => `${row.recipientUserId}|${row.dedupeKey}`)).size).toBe(4);
    expect(rows.map((row) => row.recipientUserId).sort((a, b) => a - b)).toEqual(
      [first.id, commenter.id, second.id, third.id].sort((a, b) => a - b)
    );
    expect(report).toMatchObject({ dispatched: 4, created: 4, alreadyNotified: 0 });
  });

  it('M4 RF61: 100% sobre os elegíveis; reabertura de PR não é evento', async () => {
    const project = await createProject(prisma);
    const first = await person(project.id);
    const worker = await person(project.id);
    const second = await person(project.id);
    const reopenedOwner = await person(project.id);
    const old = await person(project.id);
    const taskA = await createTask(prisma, project.id, { responsibleUserId: first.id });
    await effort(taskA, worker);
    const taskB = await createTask(prisma, project.id, { responsibleUserId: second.id });
    const taskC = await createTask(prisma, project.id, { responsibleUserId: reopenedOwner.id });
    const taskD = await createTask(prisma, project.id, { responsibleUserId: old.id });
    const merged = await openPullRequest(project, 10);
    await linkPullRequest(taskA, merged);
    const closed = await openPullRequest(project, 11);
    await linkPullRequest(taskB, closed);
    const reopened = await openPullRequest(project, 12);
    await linkPullRequest(taskC, reopened);
    await closePullRequest(reopened, { at: new Date('2026-10-19T10:00:00.000Z') });
    await prisma.gitHubArtifactEvent.deleteMany();
    const outside = await openPullRequest(project, 13);
    await linkPullRequest(taskD, outside);
    const excluded = await openPullRequest(project, 14);
    for (const task of await exclusionScenario(project, 'PULL_REQUEST'))
      await linkPullRequest(task, excluded);

    await mergePullRequest(merged);
    await closePullRequest(closed);
    await reopenPullRequest(reopened);
    await mergePullRequest(outside, { at: OUTSIDE_WINDOW });
    await closePullRequest(excluded);
    await mergePullRequest(merged);
    const report = await runJob();

    const events = await eventsOf(project.id);
    const result = metric(events, report);
    expect(events.map((event) => [event.artifactNumber, event.type])).toEqual([
      [10, 'PULL_REQUEST_MERGED'],
      [11, 'PULL_REQUEST_CLOSED'],
      [13, 'PULL_REQUEST_MERGED'],
      [14, 'PULL_REQUEST_CLOSED']
    ]);
    expect(result).toMatchObject({ eligible: 3, delivered: 3, coverage: 100 });
    expect(result.excluded).toEqual(
      excludedWith({
        NO_PARTICIPANT: 1,
        OUTSIDE_WINDOW: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 1
      })
    );
    expect(
      (await notificationsOf({ type: 'PULL_REQUEST_EVENT' })).map((row) => row.recipientUserId)
    ).toEqual([first.id, worker.id, second.id].sort((a, b) => a - b));
  });
});
