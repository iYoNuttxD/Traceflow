import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

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

const NOW = new Date('2026-10-20T12:00:00.000Z');
const OCCURRED = new Date('2026-10-20T10:00:00.000Z');
const MINUTE = 60_000;
const at = (ms) => new Date(NOW.getTime() + ms);
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');

const STORAGE_MESSAGE =
  'Não foi possível gravar os dados da sincronização. Tente de novo em instantes.';

let prisma;
let issueRepository;
let githubEventRepository;
let createGithubEventNotificationService;
let githubSyncRunRepository;
let executeGithubSyncRun;
let getProjectGithubSyncStatus;
let sequence = 0;

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ githubSyncRunRepository } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun, getProjectGithubSyncStatus } =
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

const closeIssue = (issue, { when = OCCURRED, detectedAt = NOW } = {}) =>
  issueRepository.upsertMany([issueItem(issue, { state: 'closed', closedAtGithub: when })], {
    detectedAt
  });

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
    listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: null }])),
    listCommitPages: vi.fn(() => pages([])),
    listPullRequestPages: vi.fn(() => pages(pullRequests)),
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
  }
  return { ...context, responsible };
}

const deadlock = () =>
  Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'), {
    code: 'P2034'
  });

describe('S2-03 correções — Fase 0: comportamento descrito na regra (S203-A13 a, c)', () => {
  it('C0-01 a primeira sincronização depois da implantação gera evento para a transição desde a anterior; a primeira observação não gera', async () => {
    const { project, responsible, issue } = await linkedIssueScenario();
    const firstSeen = {
      projectId: project.id,
      githubId: `s203-cor-issue-nova-${project.id}`,
      number: 9000,
      title: 'Issue vista pela primeira vez',
      githubUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/9000',
      labels: [],
      state: 'closed',
      closedAtGithub: OCCURRED,
      updatedAtGithub: OCCURRED
    };

    await issueRepository.upsertMany(
      [issueItem(issue, { state: 'closed', closedAtGithub: OCCURRED }), firstSeen],
      { detectedAt: NOW }
    );

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
    vi.spyOn(githubEventRepository, 'recordTransitions').mockRejectedValueOnce(deadlock());
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
