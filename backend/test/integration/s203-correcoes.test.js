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
  LINKED_SINCE,
  coverGithubEvents,
  lifecycleEventsFor,
  openLinkPeriod,
  recordGithubEvent
} from '../helpers/github-lifecycle.js';
import { slowQuery } from '../helpers/slow-statement.js';

const boundary = vi.hoisted(() => ({ client: null }));
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
const writeTimeout = vi.hoisted(() => ({ value: null }));
vi.mock('../../src/modules/projects/active-project-write.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    withActiveProjectWrite: (projectId, write, options = {}) =>
      original.withActiveProjectWrite(
        projectId,
        write,
        writeTimeout.value && options.timeout
          ? { ...options, timeout: writeTimeout.value }
          : options
      )
  };
});
const queries = vi.hoisted(() => ({ enabled: false, texts: [] }));
vi.mock('../../src/database/prismaClient.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { guardTransactions } = await import('../../src/database/transaction-guard.js');
  const client = guardTransactions(new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }));
  client.$on('query', (event) => {
    if (queries.enabled) queries.texts.push(event.query);
  });
  return { prisma: client };
});

const NOW = new Date('2026-10-20T12:00:00.000Z');
const OCCURRED = new Date('2026-10-20T10:00:00.000Z');
const MINUTE = 60_000;
const at = (ms) => new Date(NOW.getTime() + ms);
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');

const STORAGE_MESSAGE =
  'Não foi possível gravar os dados da sincronização. Tente de novo em instantes.';
const BUSY_MESSAGE =
  'O projeto está com outra alteração em andamento. Tente sincronizar de novo em instantes.';

let prisma;
let issueRepository;
let pullRequestRepository;
let githubEventRepository;
let githubRepositoryEventsRepository;
let createGithubEventNotificationService;
let githubEventNotificationService;
let githubSyncRunRepository;
let executeGithubSyncRun;
let getProjectGithubSyncStatus;
let traceabilityAlertService;
let projectRepository;
let disconnectRecoveryPrisma;
let testDatabaseUrl;
let sequence = 0;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ createGithubEventNotificationService, githubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ traceabilityAlertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ projectRepository } = await import('../../src/modules/projects/project.repository.js'));
  ({ disconnectRecoveryPrisma } = await import('../../src/database/recovery-prisma.js'));
  ({ githubSyncRunRepository } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun, getProjectGithubSyncStatus } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  writeTimeout.value = null;
  vi.restoreAllMocks();
  boundary.client = null;
  queries.enabled = false;
  queries.texts = [];
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await disconnectRecoveryPrisma();
  await prisma.$disconnect();
});

const service = (now = NOW, overrides = {}) =>
  createGithubEventNotificationService({
    clock: () => now,
    ...overrides
  });
const runJob = (now = NOW, options = {}, overrides = {}) =>
  service(now, overrides).runJob({ dryRun: false, ...options });

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa correção ${sequence}`,
      username: `s203cor${sequence}`,
      email: `s203-cor-${sequence}@example.invalid`
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

function issueRow(project, number) {
  return prisma.issue.create({
    data: {
      projectId: project.id,
      githubId: `s203-cor-issue-${project.id}-${number}`,
      number,
      title: `Issue ${number}`,
      labels: [],
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${number}`,
      state: 'open',
      closedAtGithub: null
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

const githubEvent = (artifact, kind, eventType, occurredAt, detectedAt = NOW) =>
  recordGithubEvent(githubRepositoryEventsRepository, prisma, {
    projectId: artifact.projectId,
    kind,
    number: artifact.number,
    eventType,
    occurredAt,
    detectedAt
  });

async function closeIssue(issue, { when = OCCURRED, detectedAt = NOW } = {}) {
  await issueRepository.upsertMany([issueItem(issue, { state: 'closed', closedAtGithub: when })]);
  return githubEvent(issue, 'ISSUE', 'CLOSED', when, detectedAt);
}

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

async function linkedIssueScenario() {
  const project = await newProject();
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
  sequence += 1;
  const issue = await issueRow(project, sequence);
  await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  await openLinkPeriod(prisma, { projectId: project.id, taskId: task.id, issueId: issue.id });
  return { project, responsible, task, issue };
}

async function integratedProject() {
  sequence += 1;
  const owner = await person();
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: `s203-cor-sync-${sequence}`,
      accountId: `s203-cor-sync-account-${sequence}`,
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
  const repositoryId = String(98000 + sequence);
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

function githubDouble(repositoryId, { pullRequests = [] } = {}) {
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
    listRepositoryEventPages: vi.fn(() => pages(lifecycleEventsFor({ pullRequests }))),
    listIssuePages: vi.fn(() => pages([]))
  };
}

const prItem = (number, state, mergedAt = null) => ({
  githubId: `s203-cor-sync-pr-${number}`,
  number,
  title: `PR ${number}`,
  state,
  closedAtGithub: state === 'closed' ? mergedAt || OCCURRED : null,
  mergedAtGithub: mergedAt,
  githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`
});

async function runSync(context) {
  const run = await githubSyncRunRepository.create(context.project.id, context.owner.id);
  return executeGithubSyncRun(run.id);
}

async function syncedPullRequests(numbers) {
  const context = await integratedProject();
  const responsible = await person(context.project.id);
  boundary.client = githubDouble(context.repositoryId, {
    pullRequests: numbers.map((number) => prItem(number, 'open'))
  });
  expect((await runSync(context)).status).toBe('SUCCEEDED');
  for (const number of numbers) {
    const task = await createTask(prisma, context.project.id, {
      responsibleUserId: responsible.id
    });
    const pullRequest = await prisma.pullRequest.findFirst({
      where: { projectId: context.project.id, number }
    });
    await prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pullRequest.id } });
    await openLinkPeriod(prisma, {
      projectId: context.project.id,
      taskId: task.id,
      pullRequestId: pullRequest.id
    });
  }
  return { ...context, responsible };
}

const deadlock = () =>
  Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'), {
    code: 'P2034'
  });

describe('S2-03 correções — Fase 0: comportamento descrito na regra (S203-A13 a, c)', () => {
  it('C0-01 o evento lido do GitHub avisa só a issue vinculada; a issue nova, sem vínculo, não gera evento', async () => {
    const { project, responsible, issue } = await linkedIssueScenario();
    const firstSeen = await issueRow(project, 9000);

    await closeIssue(issue);
    await closeIssue(firstSeen);

    const events = await eventsOf(project.id);
    expect(events.map((event) => [event.type, event.artifactNumber])).toEqual([
      ['ISSUE_CLOSED', issue.number]
    ]);
    await runJob();
    expect(await recipientsOf({ projectId: project.id })).toEqual([responsible.id]);
  });

  it('C0-02 depois de uma retomada, created + alreadyNotified = eligible e a cobertura pela soma é 100%', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    vi.spyOn(githubEventRepository, 'finish').mockRejectedValueOnce(new Error('queda'));
    vi.spyOn(githubEventRepository, 'release').mockRejectedValueOnce(new Error('queda'));

    await runJob();
    vi.restoreAllMocks();
    await runJob(at(3 * MINUTE));

    const [event] = await eventsOf(project.id);
    const { created, alreadyNotified, eligible } = event.outcome;
    expect(event.status).toBe('DISPATCHED');
    expect({ created, alreadyNotified, eligible }).toEqual({
      created: 0,
      alreadyNotified: 1,
      eligible: 1
    });
    expect(((created + alreadyNotified) / eligible) * 100).toBe(100);
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe('S2-03 correções — Fase 1: código estável na falha de gravação (S203-A06)', () => {
  async function failedByDeadlock() {
    const context = await syncedPullRequests([1]);
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    vi.spyOn(githubEventRepository, 'recordFromLifecycle').mockRejectedValueOnce(deadlock());
    loggerMock.warn.mockClear();
    return { context, run: await runSync(context) };
  }

  it('C1-01 erro de banco na gravação da fila sai com GITHUB_SYNC_STORAGE_FAILED e mensagem que não culpa o GitHub (R-H4)', async () => {
    const { context, run } = await failedByDeadlock();

    expect(run.status).toBe('FAILED');
    expect(run.error).toEqual({ code: 'GITHUB_SYNC_STORAGE_FAILED', message: STORAGE_MESSAGE });
    const integration = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId: context.project.id }
    });
    expect(integration.lastSyncError).toBe(STORAGE_MESSAGE);
  });

  it('C1-02 o código interno do Prisma fica só no log da execução', async () => {
    const { context } = await failedByDeadlock();

    const failed = loggerMock.warn.mock.calls.find(
      ([, details]) => details?.event === 'github_sync_run_failed'
    );
    expect(failed[1]).toMatchObject({
      errorCode: 'GITHUB_SYNC_STORAGE_FAILED',
      causeCode: 'P2034'
    });
    const status = await getProjectGithubSyncStatus(context.project.id);
    expect(status.error.code).toBe('GITHUB_SYNC_STORAGE_FAILED');
    expect(JSON.stringify(status)).not.toContain('P2034');
  });
});

describe('S2-03 correções — Fase 2: falha da página registrada e trava limitada (S203-A01)', () => {
  const closed = Object.assign(new Error('Server has closed the connection.'), { code: 'P1017' });
  const missing = Object.assign(new Error('No record was found for an update.'), {
    code: 'P2025'
  });
  const projectLockQuery = /FROM `?Project`? WHERE .*deletedAt IS NULL FOR UPDATE/i;

  function hooks() {
    return {
      reconcile: vi.spyOn(traceabilityAlertService, 'reconcileAfterSync'),
      dispatch: vi.spyOn(githubEventNotificationService, 'dispatchAfterSync')
    };
  }

  function lockedPullRequestPage(context, holdMs) {
    let release = null;
    const locked = new Promise((resolveLocked) => {
      release = resolveLocked;
    });
    const holder = { done: null };
    const double = githubDouble(context.repositoryId);
    double.listPullRequestPages = vi.fn(() =>
      (async function* page() {
        holder.done = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM Project WHERE id = ${context.project.id} FOR UPDATE`;
            release();
            await new Promise((resolveSleep) => setTimeout(resolveSleep, holdMs));
          },
          { timeout: 30000, maxWait: 5000 }
        );
        await locked;
        yield [prItem(1, 'closed', OCCURRED)];
      })()
    );
    double.listRepositoryEventPages = vi.fn(() =>
      pages(lifecycleEventsFor({ pullRequests: [prItem(1, 'closed', OCCURRED)] }))
    );
    return { double, holder };
  }

  it('C2-01 trava do projeto além do prazo: a execução termina FAILED com GITHUB_SYNC_PROJECT_BUSY, os ganchos rodam e a próxima é aceita (EV-S-04)', async () => {
    const context = await syncedPullRequests([1]);
    const { double, holder } = lockedPullRequestPage(context, 7000);
    boundary.client = double;
    const { reconcile, dispatch } = hooks();

    let run;
    try {
      run = await runSync(context);
    } finally {
      await holder.done;
    }

    expect(run.status).toBe('FAILED');
    expect(run.error).toEqual({ code: 'GITHUB_SYNC_PROJECT_BUSY', message: BUSY_MESSAGE });
    const stored = await prisma.gitHubSyncRun.findUnique({ where: { id: run.id } });
    expect(stored).toMatchObject({ status: 'FAILED', activeProjectId: null });
    expect(reconcile).toHaveBeenCalledWith(context.project.id);
    expect(dispatch).toHaveBeenCalledWith(context.project.id);
    expect(
      await prisma.auditEvent.count({
        where: { projectId: context.project.id, action: 'GITHUB_SYNC_FAILED' }
      })
    ).toBe(1);
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { projectId: context.project.id } })
    ).toBe(0);

    vi.restoreAllMocks();
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    expect((await runSync(context)).status).toBe('SUCCEEDED');
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { projectId: context.project.id } })
    ).toBe(1);
    expect(await recipientsOf({ projectId: context.project.id })).toEqual([context.responsible.id]);
  }, 60000);

  it('C2-02 trava do projeto abaixo do prazo: a página espera e a execução termina SUCCEEDED', async () => {
    const context = await syncedPullRequests([1]);
    const { double, holder } = lockedPullRequestPage(context, 1000);
    boundary.client = double;

    let run;
    try {
      run = await runSync(context);
    } finally {
      await holder.done;
    }

    expect(run.status).toBe('SUCCEEDED');
    expect(
      await prisma.gitHubArtifactEvent.count({ where: { projectId: context.project.id } })
    ).toBe(1);
  }, 60000);

  it.each([
    ['P1017', closed],
    ['P2025', missing]
  ])(
    'C2-03 gravação da falha com %s no pool compartilhado: a conexão de recuperação grava FAILED e os ganchos rodam',
    async (_, error) => {
      const context = await syncedPullRequests([1]);
      boundary.client = githubDouble(context.repositoryId, {
        pullRequests: [prItem(1, 'closed', OCCURRED)]
      });
      vi.spyOn(githubEventRepository, 'recordFromLifecycle').mockRejectedValueOnce(deadlock());
      const fail = vi.spyOn(githubSyncRunRepository, 'fail').mockRejectedValueOnce(error);
      const recovery = vi.spyOn(githubSyncRunRepository, 'failOnRecoveryConnection');
      const { reconcile, dispatch } = hooks();

      const run = await runSync(context);

      expect(fail).toHaveBeenCalledTimes(1);
      expect(recovery).toHaveBeenCalledTimes(1);
      expect(run.status).toBe('FAILED');
      expect(run.error.code).toBe('GITHUB_SYNC_STORAGE_FAILED');
      expect(reconcile).toHaveBeenCalledWith(context.project.id);
      expect(dispatch).toHaveBeenCalledWith(context.project.id);
    }
  );

  it('C2-03 sem conseguir gravar a falha em três tentativas: log de erro, ganchos e nenhuma exceção', async () => {
    const context = await syncedPullRequests([1]);
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    vi.spyOn(githubEventRepository, 'recordFromLifecycle').mockRejectedValueOnce(deadlock());
    const fail = vi.spyOn(githubSyncRunRepository, 'fail').mockRejectedValue(closed);
    const recovery = vi
      .spyOn(githubSyncRunRepository, 'failOnRecoveryConnection')
      .mockRejectedValue(closed);
    const { reconcile, dispatch } = hooks();
    loggerMock.error.mockClear();

    const run = await runSync(context);

    expect(fail).toHaveBeenCalledTimes(1);
    expect(recovery).toHaveBeenCalledTimes(2);
    expect(run.status).toBe('RUNNING');
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_sync_run_failure_unrecorded',
        projectId: context.project.id,
        errorCode: 'GITHUB_SYNC_STORAGE_FAILED',
        causeCode: 'P1017'
      })
    );
    expect(reconcile).toHaveBeenCalledWith(context.project.id);
    expect(dispatch).toHaveBeenCalledWith(context.project.id);
  });

  it('C2-04 F2-04 gravação que passa do prazo com uma consulta em andamento: FAILED pelo prazo próprio, sem RUNNING preso, sem contaminar a conexão, e a próxima é aceita', async () => {
    const context = await syncedPullRequests([1]);
    writeTimeout.value = 5000;
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    const original = githubEventRepository.recordFromLifecycle;
    vi.spyOn(githubEventRepository, 'recordFromLifecycle').mockImplementationOnce(
      async (tx, input) => {
        await slowQuery(tx);
        return original.call(githubEventRepository, tx, input);
      }
    );
    loggerMock.warn.mockClear();

    const run = await runSync(context);

    expect(run.status).toBe('FAILED');
    expect(run.error.code).toBe('GITHUB_SYNC_STORAGE_FAILED');
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_sync_run_failed',
        errorCode: 'GITHUB_SYNC_STORAGE_FAILED',
        causeCode: 'TRANSACTION_DEADLINE'
      })
    );
    const stored = await prisma.gitHubSyncRun.findUnique({ where: { id: run.id } });
    expect(stored).toMatchObject({ status: 'FAILED', activeProjectId: null });
    expect(
      await prisma.project.findUnique({ where: { id: context.project.id }, select: { id: true } })
    ).toEqual({ id: context.project.id });
    expect(
      await prisma.user.update({
        where: { id: context.owner.id },
        data: { name: 'Pessoa depois da página lenta' },
        select: { id: true }
      })
    ).toEqual({ id: context.owner.id });

    writeTimeout.value = null;
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    expect((await runSync(context)).status).toBe('SUCCEEDED');
  }, 60000);

  it('C2-05 as escritas da sincronização travam o projeto com NOWAIT; as outras escritas não', async () => {
    const context = await syncedPullRequests([1]);
    boundary.client = githubDouble(context.repositoryId, {
      pullRequests: [prItem(1, 'closed', OCCURRED)]
    });
    vi.spyOn(traceabilityAlertService, 'reconcileAfterSync').mockResolvedValue(undefined);

    queries.enabled = true;
    expect((await runSync(context)).status).toBe('SUCCEEDED');
    queries.enabled = false;
    const syncLocks = queries.texts.filter((text) => projectLockQuery.test(text));
    queries.texts = [];
    queries.enabled = true;
    await projectRepository.updateProject(context.project.id, { name: 'Projeto renomeado' });
    queries.enabled = false;
    const userLocks = queries.texts.filter((text) => projectLockQuery.test(text));

    expect(syncLocks.length).toBeGreaterThanOrEqual(5);
    expect(syncLocks.filter((text) => !/NOWAIT/i.test(text))).toEqual([]);
    expect(userLocks).toHaveLength(1);
    expect(userLocks[0]).not.toMatch(/NOWAIT/i);
  });
});

describe('S2-03 correções — Fase 3: fila gravada em lote (S203-A03, S203-A13 b)', () => {
  async function openPullRequests(project, count) {
    await prisma.pullRequest.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        projectId: project.id,
        githubId: `s203-cor-lote-${project.id}-${index}`,
        number: index + 1,
        title: `PR ${index + 1}`,
        state: 'open',
        githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${index + 1}`
      }))
    });
    return prisma.pullRequest.findMany({
      where: { projectId: project.id },
      orderBy: { number: 'asc' }
    });
  }

  const mergedItem = (row, overrides = {}) => ({
    projectId: row.projectId,
    githubId: row.githubId,
    number: row.number,
    title: row.title,
    state: 'closed',
    closedAtGithub: OCCURRED,
    mergedAtGithub: OCCURRED,
    updatedAtGithub: OCCURRED,
    githubUrl: row.githubUrl,
    ...overrides
  });

  const mergedEvent = (row, occurredAt = OCCURRED) => ({
    providerEventId: `merged-${row.id}-${occurredAt.toISOString()}`,
    number: row.number,
    eventType: 'MERGED',
    occurredAt
  });

  const recordEvents = (project, { pullRequestEvents = [], issueEvents = [] }) =>
    githubRepositoryEventsRepository.record(
      project.id,
      { pullRequestEvents, issueEvents, readStartedAt: NOW },
      NOW
    );

  async function linkTasks(project, row, count, responsibleUserId) {
    const tasks = [];
    for (let copy = 0; copy < count; copy += 1) {
      const task = await createTask(prisma, project.id, {
        responsibleUserId,
        pullRequestId: row.id
      });
      await openLinkPeriod(prisma, {
        projectId: project.id,
        taskId: task.id,
        pullRequestId: row.id
      });
      tasks.push(task);
    }
    return tasks;
  }

  async function pullRequestEvents(linked, fanOut) {
    const project = await newProject();
    const owner = await person(project.id);
    const rows = await openPullRequests(project, 100);
    await coverGithubEvents(prisma, project.id, LINKED_SINCE);
    const linkedRows = rows.slice(0, linked);
    if (linkedRows.length) {
      await prisma.task.createMany({
        data: linkedRows.flatMap((row) =>
          Array.from({ length: fanOut }, (_, copy) => ({
            projectId: project.id,
            title: `Tarefa ${row.number}-${copy}`,
            priority: 'MEDIA',
            status: 'A_FAZER',
            responsibleUserId: owner.id,
            pullRequestId: row.id
          }))
        )
      });
      const tasks = await prisma.task.findMany({
        where: { projectId: project.id, pullRequestId: { not: null } },
        select: { id: true, pullRequestId: true }
      });
      await prisma.taskArtifactLinkPeriod.createMany({
        data: tasks.map((task) => ({
          projectId: project.id,
          taskId: task.id,
          pullRequestId: task.pullRequestId,
          linkedAt: LINKED_SINCE
        }))
      });
    }
    queries.texts = [];
    queries.enabled = true;
    const result = await recordEvents(project, {
      pullRequestEvents: rows.map((row) => mergedEvent(row))
    });
    queries.enabled = false;
    return { result, statements: queries.texts.length };
  }

  function failingTargets(tx) {
    return new Proxy(tx, {
      get(target, key) {
        if (key === 'gitHubArtifactEventTask')
          return { createMany: () => Promise.reject(deadlock()) };
        return target[key];
      }
    });
  }

  it('C3-01 o custo da gravação dos eventos é constante: 100 eventos custam o mesmo que 1, até 5 instruções a mais que nenhum vinculado (R-Q01)', async () => {
    const base = await pullRequestEvents(0, 1);
    expect(base.result.recorded).toBe(0);

    for (const fanOut of [1, 5, 20]) {
      const one = await pullRequestEvents(1, fanOut);
      const hundred = await pullRequestEvents(100, fanOut);

      expect(one.result.recorded).toBe(1);
      expect(hundred.result.recorded).toBe(100);
      expect(hundred.statements).toBe(one.statements);
      expect(one.statements - base.statements).toBeLessThanOrEqual(5);
    }
  }, 180000);

  it('C3-02 falha no lote dos alvos desfaz a gravação inteira; a leitura seguinte grava o evento uma vez', async () => {
    const project = await newProject();
    const owner = await person(project.id);
    const [row] = await openPullRequests(project, 1);
    await coverGithubEvents(prisma, project.id, LINKED_SINCE);
    await linkTasks(project, row, 2, owner.id);
    const original = githubEventRepository.recordFromLifecycle;
    vi.spyOn(githubEventRepository, 'recordFromLifecycle').mockImplementationOnce((tx, input) =>
      original.call(githubEventRepository, failingTargets(tx), input)
    );

    await expect(
      recordEvents(project, { pullRequestEvents: [mergedEvent(row)] })
    ).rejects.toMatchObject({ code: 'P2034' });

    expect(await eventsOf(project.id)).toEqual([]);
    expect(await prisma.pullRequestLifecycleEvent.count({ where: { projectId: project.id } })).toBe(
      0
    );
    vi.restoreAllMocks();
    await recordEvents(project, { pullRequestEvents: [mergedEvent(row)] });
    await recordEvents(project, { pullRequestEvents: [mergedEvent(row)] });
    const events = await eventsOf(project.id);
    expect(events).toHaveLength(1);
    expect(events[0].targets).toHaveLength(2);
  });

  it('C3-03 cada evento leva só as tarefas do próprio artefato, com contagem e snapshot; a anomalia continua na página', async () => {
    const project = await newProject();
    const owner = await person(project.id);
    const [first, second, third, fourth] = await openPullRequests(project, 4);
    await prisma.pullRequest.update({
      where: { id: fourth.id },
      data: { state: 'closed', closedAtGithub: OCCURRED, mergedAtGithub: OCCURRED }
    });
    await coverGithubEvents(prisma, project.id, LINKED_SINCE);
    const firstTasks = await linkTasks(project, first, 2, owner.id);
    const [secondTask] = await linkTasks(project, second, 1, owner.id);
    const [fourthTask] = await linkTasks(project, fourth, 1, owner.id);

    const page = await pullRequestRepository.upsertMany([
      mergedItem(first),
      mergedItem(second, { mergedAtGithub: null, title: 'PR 2 antes' }),
      mergedItem(third),
      { ...mergedItem(fourth), state: 'open', closedAtGithub: null, mergedAtGithub: null },
      mergedItem(second, { mergedAtGithub: null, title: 'PR 2 depois' })
    ]);
    const result = await recordEvents(project, {
      pullRequestEvents: [
        mergedEvent(first),
        {
          providerEventId: `closed-${second.id}`,
          number: second.number,
          eventType: 'CLOSED',
          occurredAt: OCCURRED
        },
        mergedEvent(third)
      ]
    });

    expect(page.anomalies).toBe(1);
    expect(result.recorded).toBe(2);
    const events = await eventsOf(project.id);
    expect(
      events.map((event) => ({
        type: event.type,
        number: event.artifactNumber,
        title: event.artifactTitle,
        url: event.artifactUrl,
        linkedTaskCount: event.linkedTaskCount,
        targets: event.targets.map((target) => target.taskId),
        status: event.status,
        attempts: event.attempts
      }))
    ).toEqual([
      {
        type: 'PULL_REQUEST_MERGED',
        number: 1,
        title: 'PR 1',
        url: first.githubUrl,
        linkedTaskCount: 2,
        targets: firstTasks.map((task) => task.id).sort((left, right) => left - right),
        status: 'PENDING',
        attempts: 0
      },
      {
        type: 'PULL_REQUEST_CLOSED',
        number: 2,
        title: 'PR 2 depois',
        url: second.githubUrl,
        linkedTaskCount: 1,
        targets: [secondTask.id],
        status: 'PENDING',
        attempts: 0
      }
    ]);
    expect(events.flatMap((event) => event.targets.map((target) => target.taskId))).not.toContain(
      fourthTask.id
    );
    expect(events[0].occurrenceKey).toBe(`gh:merged-${first.id}-${OCCURRED.toISOString()}`);
  });
});

describe('S2-03 correções — Fase 5: estoque, pendência vencida e reserva perdida (S203-A05, S203-A11, S203-A12)', () => {
  const DAY = 24 * 60 * MINUTE;
  const failing = () => Object.assign(new Error('falha'), { code: 'P1001' });
  const silentLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

  async function pendingEvents(project, count, { participant = null, detectedAt = NOW } = {}) {
    const tasks = [];
    if (participant)
      for (let index = 0; index < count; index += 1)
        tasks.push(await createTask(prisma, project.id, { responsibleUserId: participant.id }));
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
        occurrenceKey: `ISSUE_CLOSED:fila-${project.id}-${index}:${OCCURRED.toISOString()}`
      }))
    });
    const events = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' },
      select: { id: true }
    });
    if (participant)
      await prisma.gitHubArtifactEventTask.createMany({
        data: events.map((event, index) => ({ eventId: event.id, taskId: tasks[index].id }))
      });
    return events.map((event) => event.id);
  }

  async function failTimes(project, times) {
    let clock = NOW;
    for (let attempt = 1; attempt <= times; attempt += 1) {
      vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(failing());
      await runJob(clock, { projectId: project.id }, { log: silentLog() });
      vi.restoreAllMocks();
      const [event] = await eventsOf(project.id);
      if (event.status === 'FAILED') return event;
      clock = event.nextAttemptAt;
    }
    return (await eventsOf(project.id))[0];
  }

  function slowDispatcher() {
    let release = null;
    let entered = null;
    const gate = new Promise((resolveGate) => {
      release = resolveGate;
    });
    const inside = new Promise((resolveInside) => {
      entered = resolveInside;
    });
    const repository = {
      ...githubEventRepository,
      async participationOf(...args) {
        entered();
        await gate;
        return githubEventRepository.participationOf(...args);
      }
    };
    return { repository, inside, release: () => release() };
  }

  it('C5-01 o estoque de FAILED aparece em toda execução até o reprocessamento (EV-J-09)', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    expect((await failTimes(project, 5)).status).toBe('FAILED');
    const other = await newProject();
    const log = silentLog();

    const later = await runJob(at(DAY), { projectId: project.id }, { log });
    const elsewhere = await runJob(at(DAY), { projectId: other.id }, { log: silentLog() });

    expect(later).toMatchObject({ failed: 0, failedStock: 1 });
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notifications_dispatch_completed',
        failedStock: 1
      })
    );
    expect(elsewhere.failedStock).toBe(0);
    const requeued = await runJob(
      at(DAY),
      { projectId: project.id, retryFailed: true },
      { log: silentLog() }
    );
    expect(requeued).toMatchObject({ requeued: 1, dispatched: 1, failedStock: 0 });
  });

  it('C5-02 a espera normal de retentativa não é pendência vencida; a vencida conta desde o vencimento (EV-J-10)', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    expect((await failTimes(project, 3)).status).toBe('PENDING');

    const during = await runJob(at(31 * MINUTE), { projectId: project.id });

    expect(during).toMatchObject({
      scanned: 0,
      pendingAfter: 1,
      dueAfter: 0,
      oldestDueAgeSeconds: null
    });
    expect(during).not.toHaveProperty('oldestPendingAgeSeconds');

    const late = await newProject();
    await pendingEvents(late, 101, { detectedAt: at(-10 * MINUTE) });
    const hook = await service(NOW).dispatchAfterSync(late.id);
    expect(hook).toMatchObject({ dispatched: 100, dueAfter: 1, oldestDueAgeSeconds: 600 });

    const stuck = await newProject();
    const [eventId] = await pendingEvents(stuck, 1, { detectedAt: at(-30 * MINUTE) });
    await prisma.gitHubArtifactEvent.update({
      where: { id: eventId },
      data: {
        status: 'PROCESSING',
        claimToken: 'reserva-de-outro',
        claimedUntil: at(-5 * MINUTE),
        attempts: 1
      }
    });
    const preview = await service(NOW).runJob({ projectId: stuck.id, dryRun: true });
    expect(preview).toMatchObject({ dueAfter: 1, oldestDueAgeSeconds: 300 });
  }, 60000);

  it('C5-03 a reserva perdida deixa log e conta em claimLost; attempts conta a retomada (EV-K-03)', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 1, { participant });
    const slow = slowDispatcher();
    const log = silentLog();

    const running = service(NOW, { repository: slow.repository, log }).runJob({ dryRun: false });
    await slow.inside;
    await runJob(at(3 * MINUTE), {}, { log: silentLog() });
    slow.release();
    const report = await running;

    const [event] = await eventsOf(project.id);
    expect(report).toMatchObject({ claimed: 1, claimLost: 1, dispatched: 0 });
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'github_event_notification_claim_lost',
        eventId: event.id,
        projectId: project.id
      })
    );
    expect(event).toMatchObject({ status: 'DISPATCHED', attempts: 2 });
    expect(await prisma.notification.count()).toBe(1);
  });

  it('C5-04 a devolução que encontra a reserva perdida também deixa log', async () => {
    const project = await newProject();
    const participant = await person(project.id);
    await pendingEvents(project, 1, { participant });
    vi.spyOn(githubEventRepository, 'participationOf').mockRejectedValueOnce(failing());
    vi.spyOn(githubEventRepository, 'release').mockResolvedValueOnce({
      state: 'LOST',
      attempts: null
    });
    const log = silentLog();

    const report = await runJob(NOW, {}, { log });

    expect(report).toMatchObject({ claimed: 1, claimLost: 1, retryScheduled: 0, failed: 0 });
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'github_event_notification_claim_lost' })
    );
  });
});

describe('S2-03 correções — Fase 6: stdout dos jobs só com o relatório (S203-A13 f)', () => {
  it('C6-01 nos dois scripts de job, o stdout é um JSON só e os logs vão para o stderr', async () => {
    const project = await newProject();
    const runScript = (name) =>
      spawnSync(
        process.execPath,
        [resolve(process.cwd(), 'scripts', name), `--project-id=${project.id}`],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: 'development' },
          encoding: 'utf8'
        }
      );

    for (const [name, completed] of [
      ['dispatch-github-event-notifications.js', 'github_event_notifications_dispatch_completed'],
      ['notify-overdue-tasks.js', 'notifications_due_completed']
    ]) {
      const result = runScript(name);
      expect(result.status, `${name}: ${result.stderr}`).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.dryRun, name).toBe(true);
      expect(report.database.database, name).toMatch(/_test$/);
      const logLines = result.stderr
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line));
      expect(
        logLines.map((line) => line.event),
        name
      ).toContain(completed);
    }
  }, 60000);
});
