import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const boundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const REGISTRY_START = new Date('2026-01-01T00:00:00.000Z');

let prisma;
let githubSyncRunRepository;
let executeGithubSyncRun;
let taskIssueService;
let pullRequestLinkService;
let createGithubEventNotificationService;
let createNotificationMetricsService;
let notificationMetricsRepository;
let githubEventRepository;
let githubRepositoryEventsRepository;
let sequence = 0;
let eventId = 900000;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubSyncRunRepository } =
    await import('../../src/modules/github/github-sync-run.repository.js'));
  ({ executeGithubSyncRun } =
    await import('../../src/modules/github/services/github-sync-run.service.js'));
  ({ taskIssueService } = await import('../../src/modules/tasks/services/task-issue.service.js'));
  ({ pullRequestLinkService } =
    await import('../../src/modules/tasks/services/task-pull-request.service.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => {
  boundary.client = null;
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, role = 'MEMBER') {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa da fonte durável ${sequence}`,
      username: `r2fonte${sequence}`,
      email: `r2-fonte-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role } });
  return user;
}

async function integratedProject() {
  sequence += 1;
  const owner = await person();
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: `r2-fonte-${sequence}`,
      accountId: `r2-fonte-account-${sequence}`,
      accountLogin: 'usuario-r2',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  const project = await createProject(prisma);
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: owner.id, role: 'OWNER' }
  });
  const repositoryId = String(77000 + sequence);
  await prisma.projectGitHubIntegration.create({
    data: {
      projectId: project.id,
      installationId: installation.id,
      githubRepositoryId: repositoryId,
      repositoryName: 'repositorio-r2',
      repositoryFullName: 'usuario-r2/repositorio-r2',
      repositoryUrl: 'https://github.com/usuario-r2/repositorio-r2',
      defaultBranch: 'trunk',
      status: 'ACTIVE'
    }
  });
  const responsible = await person(project.id);
  return { project, owner, responsible, repositoryId };
}

const ISSUE_CREATED_AT = new Date('2026-01-02T12:00:00.000Z');

const issueItem = (number, state = 'open', closedAt = null) => ({
  githubId: `r2-issue-${number}`,
  number,
  title: `Issue ${number}`,
  state,
  labels: [],
  createdAtGithub: ISSUE_CREATED_AT,
  closedAtGithub: closedAt,
  githubUrl: `https://github.com/usuario-r2/repositorio-r2/issues/${number}`
});

const pullRequestItem = (number, state = 'open', { closedAt = null, mergedAt = null } = {}) => ({
  githubId: `r2-pr-${number}`,
  number,
  title: `PR ${number}`,
  state,
  closedAtGithub: closedAt,
  mergedAtGithub: mergedAt,
  githubUrl: `https://github.com/usuario-r2/repositorio-r2/pull/${number}`
});

function githubEvent(kind, number, eventType, occurredAt) {
  eventId += 1;
  return { kind, providerEventId: String(eventId), number, eventType, occurredAt };
}

function githubDouble(
  repositoryId,
  { issues = [], pullRequests = [], eventPages = [[]], failAtEventPage = null } = {}
) {
  async function* pagesOf(list) {
    for (const value of list) yield value;
  }
  return {
    getRepository: vi.fn().mockResolvedValue({
      githubRepositoryId: repositoryId,
      name: 'repositorio-r2',
      owner: 'usuario-r2',
      fullName: 'usuario-r2/repositorio-r2',
      url: 'https://github.com/usuario-r2/repositorio-r2',
      defaultBranch: 'trunk',
      private: true,
      description: null
    }),
    listBranchPages: vi.fn(() => pagesOf([[{ name: 'trunk', headSha: 'trunk-head' }]])),
    listCommitPages: vi.fn(() => pagesOf([[]])),
    listPullRequestPages: vi.fn(() => pagesOf([pullRequests])),
    listIssuePages: vi.fn(() => pagesOf([issues])),
    listRepositoryEventPages: vi.fn(async function* () {
      for (const [index, page] of eventPages.entries()) {
        if (failAtEventPage === index + 1)
          throw Object.assign(new Error('GitHub indisponível'), { status: 503 });
        yield page;
      }
    })
  };
}

async function sync(context, spec) {
  boundary.client = githubDouble(context.repositoryId, spec);
  const run = await githubSyncRunRepository.create(context.project.id, context.owner.id);
  return executeGithubSyncRun(run.id);
}

const dispatch = () =>
  createGithubEventNotificationService({ clock: () => new Date() }).runJob({ dryRun: false });

const LIFECYCLE = { not: 'ISSUE_LINKED' };

const eventsOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId, type: LIFECYCLE },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    select: { type: true, occurredAt: true, occurrenceKey: true, linkedTaskCount: true }
  });

const notificationsOf = (userId) =>
  prisma.notification.findMany({
    where: {
      recipientUserId: userId,
      type: { in: ['ISSUE_EVENT', 'PULL_REQUEST_EVENT'] },
      githubEvent: LIFECYCLE
    },
    orderBy: { id: 'asc' },
    select: { githubEvent: true, githubOccurredAt: true, taskId: true }
  });

const context = (userId) => ({ actorUserId: userId, requestId: `r2-fonte-${sequence}` });

async function linkedIssue(state = 'open') {
  const scenario = await integratedProject();
  const first = await sync(scenario, { issues: [issueItem(45, state)] });
  expect(first.status, JSON.stringify(first.error)).toBe('SUCCEEDED');
  const task = await createTask(prisma, scenario.project.id, {
    responsibleUserId: scenario.responsible.id
  });
  const issue = await prisma.issue.findFirst({
    where: { projectId: scenario.project.id, number: 45 }
  });
  await taskIssueService.linkIssue(task.id, { issueId: issue.id }, context(scenario.owner.id));
  return { ...scenario, task, issue };
}

async function linkedPullRequest() {
  const scenario = await integratedProject();
  expect((await sync(scenario, { pullRequests: [pullRequestItem(9)] })).status).toBe('SUCCEEDED');
  const task = await createTask(prisma, scenario.project.id, {
    responsibleUserId: scenario.responsible.id
  });
  const pullRequest = await prisma.pullRequest.findFirst({
    where: { projectId: scenario.project.id, number: 9 }
  });
  await pullRequestLinkService.linkPullRequest(
    task.id,
    { pullRequestId: pullRequest.id },
    context(scenario.owner.id)
  );
  return { ...scenario, task, pullRequest };
}

const after = (offset) => new Date(Date.now() + offset);

function metrics() {
  return createNotificationMetricsService({
    repository: {
      ...notificationMetricsRepository,
      registryStarts: async () => ({
        decisions: REGISTRY_START,
        githubEvents: REGISTRY_START,
        issueLinks: REGISTRY_START
      })
    }
  });
}

const TIME_ZONE = 'America/Sao_Paulo';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());

describe('TF-REV-002 — fonte durável dos eventos do RF60 e do RF61', () => {
  it('F-01 fechar e reabrir a issue entre duas sincronizações gera os dois eventos, com a data do GitHub, e dois avisos', async () => {
    const scenario = await linkedIssue();
    const closedAt = after(2 * SECOND);
    const reopenedAt = after(4 * SECOND);

    const run = await sync(scenario, {
      issues: [issueItem(45, 'open')],
      eventPages: [
        [
          githubEvent('ISSUE', 45, 'CLOSED', closedAt),
          githubEvent('ISSUE', 45, 'REOPENED', reopenedAt)
        ]
      ]
    });
    await dispatch();

    expect(run.status, JSON.stringify(run.error)).toBe('SUCCEEDED');
    expect(
      (await eventsOf(scenario.project.id)).map((event) => [event.type, event.occurredAt])
    ).toEqual([
      ['ISSUE_CLOSED', closedAt],
      ['ISSUE_REOPENED', reopenedAt]
    ]);
    expect(await notificationsOf(scenario.responsible.id)).toEqual([
      { githubEvent: 'ISSUE_CLOSED', githubOccurredAt: closedAt, taskId: scenario.task.id },
      { githubEvent: 'ISSUE_REOPENED', githubOccurredAt: reopenedAt, taskId: scenario.task.id }
    ]);
  });

  it('F-02 fechar, reabrir e mesclar a PR entre leituras gera o fechamento e o merge; o closed do merge é absorvido', async () => {
    const scenario = await linkedPullRequest();
    const closedAt = after(2 * SECOND);
    const reopenedAt = after(MINUTE);
    const mergedAt = after(2 * MINUTE);

    await sync(scenario, {
      pullRequests: [pullRequestItem(9, 'closed', { closedAt: mergedAt, mergedAt })],
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'CLOSED', closedAt),
          githubEvent('PULL_REQUEST', 9, 'REOPENED', reopenedAt),
          githubEvent('PULL_REQUEST', 9, 'MERGED', mergedAt),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', new Date(mergedAt.getTime() + SECOND))
        ]
      ]
    });
    await dispatch();

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'PULL_REQUEST_CLOSED',
      'PULL_REQUEST_MERGED'
    ]);
    expect((await notificationsOf(scenario.responsible.id)).map((row) => row.githubEvent)).toEqual([
      'PULL_REQUEST_CLOSED',
      'PULL_REQUEST_MERGED'
    ]);
  });

  it('F-03 lê todas as páginas da listagem', async () => {
    const scenario = await linkedIssue();
    const filler = (count) =>
      Array.from({ length: count }, (_, index) =>
        githubEvent('ISSUE', 4000 + index, 'CLOSED', after(SECOND))
      );

    await sync(scenario, {
      issues: [issueItem(45, 'closed', after(9 * SECOND))],
      eventPages: [
        [...filler(99), githubEvent('ISSUE', 45, 'CLOSED', after(3 * SECOND))],
        [...filler(99), githubEvent('ISSUE', 45, 'REOPENED', after(5 * SECOND))],
        [githubEvent('ISSUE', 45, 'CLOSED', after(9 * SECOND))]
      ]
    });

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'ISSUE_CLOSED',
      'ISSUE_REOPENED',
      'ISSUE_CLOSED'
    ]);
    expect(
      await prisma.issueLifecycleEvent.count({ where: { projectId: scenario.project.id } })
    ).toBe(3);
  });

  it('F-04 a página 2 falha: nada é gravado e a cobertura não anda; a sincronização seguinte grava, avisa e fecha a lacuna', async () => {
    const scenario = await linkedIssue();
    const closedAt = after(2 * SECOND);
    const spec = {
      issues: [issueItem(45, 'closed', closedAt)],
      eventPages: [[githubEvent('ISSUE', 45, 'CLOSED', closedAt)], []]
    };
    const coverageBefore = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });

    const failed = await sync(scenario, { ...spec, failAtEventPage: 2 });
    const coverageAfterFailure = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });
    const gapReport = await metrics().compute({
      from: today(),
      to: today(),
      projectId: scenario.project.id,
      timeZone: TIME_ZONE
    });

    expect(failed.status).toBe('FAILED');
    expect(
      await prisma.issueLifecycleEvent.count({ where: { projectId: scenario.project.id } })
    ).toBe(0);
    expect(await eventsOf(scenario.project.id)).toEqual([]);
    expect(coverageAfterFailure.completeThrough).toEqual(coverageBefore.completeThrough);
    expect(gapReport.requisitos.RF60.lacunas.map((gap) => gap.motivo)).toContain(
      'LACUNA_DE_AQUISICAO'
    );

    const resumed = await sync(scenario, spec);
    await dispatch();
    const coverage = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });

    expect(resumed.status).toBe('SUCCEEDED');
    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'ISSUE_CLOSED'
    ]);
    expect(await notificationsOf(scenario.responsible.id)).toHaveLength(1);
    expect(coverage.completeThrough.getTime()).toBeGreaterThan(
      coverageAfterFailure.completeThrough.getTime()
    );
  });

  it('F-05 reler a mesma lista não duplica eventos nem avisos', async () => {
    const scenario = await linkedIssue();
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));
    const spec = { issues: [issueItem(45, 'closed', closed.occurredAt)], eventPages: [[closed]] };

    await sync(scenario, spec);
    await dispatch();
    await sync(scenario, spec);
    await sync(scenario, spec);
    await dispatch();

    expect(await eventsOf(scenario.project.id)).toHaveLength(1);
    expect((await eventsOf(scenario.project.id))[0].occurrenceKey).toBe(
      `gh:${closed.providerEventId}`
    );
    expect(await notificationsOf(scenario.responsible.id)).toHaveLength(1);
  });

  it('F-06 vale o vínculo no instante do evento: o ocorrido com a tarefa vinculada é avisado mesmo lido depois do desvínculo; o posterior não', async () => {
    const scenario = await linkedIssue();
    const whileLinked = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));
    await new Promise((resolve) => setTimeout(resolve, 3 * SECOND));
    await taskIssueService.unlinkIssue(
      scenario.task.id,
      scenario.issue.id,
      context(scenario.owner.id)
    );
    const afterUnlink = githubEvent('ISSUE', 45, 'REOPENED', after(SECOND));

    await sync(scenario, {
      issues: [issueItem(45, 'open')],
      eventPages: [[whileLinked, afterUnlink]]
    });
    await dispatch();

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'ISSUE_CLOSED'
    ]);
    expect(await notificationsOf(scenario.responsible.id)).toEqual([
      {
        githubEvent: 'ISSUE_CLOSED',
        githubOccurredAt: whileLinked.occurredAt,
        taskId: scenario.task.id
      }
    ]);
  }, 30000);

  it('F-07 corte: o histórico anterior à cobertura não vira aviso, nem na integração antiga nem na nova', async () => {
    const scenario = await linkedIssue();
    const coverage = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });
    await prisma.taskArtifactLinkPeriod.updateMany({
      where: { taskId: scenario.task.id },
      data: { linkedAt: new Date(coverage.coverageFrom.getTime() - 60 * MINUTE) }
    });

    await sync(scenario, {
      issues: [issueItem(45, 'open')],
      eventPages: [
        [
          githubEvent(
            'ISSUE',
            45,
            'CLOSED',
            new Date(coverage.coverageFrom.getTime() - 30 * MINUTE)
          ),
          githubEvent('ISSUE', 45, 'REOPENED', after(2 * SECOND))
        ]
      ]
    });

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'ISSUE_REOPENED'
    ]);
    expect(coverage.comparedBefore).toBe(false);
  });

  it('F-08 evento de artefato que não está no TraceFlow é ignorado sem travar a cobertura', async () => {
    const scenario = await linkedIssue();
    const before = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await sync(scenario, {
      issues: [issueItem(45, 'open')],
      eventPages: [
        [
          githubEvent('ISSUE', 999, 'CLOSED', after(2 * SECOND)),
          githubEvent('PULL_REQUEST', 998, 'MERGED', after(2 * SECOND))
        ]
      ]
    });
    const coverage = await prisma.gitHubEventCoverage.findUnique({
      where: { projectId: scenario.project.id }
    });

    expect(await eventsOf(scenario.project.id)).toEqual([]);
    expect(coverage.completeThrough.getTime()).toBeGreaterThan(before.completeThrough.getTime());
  });

  it('F-09 mudança de estado sem evento na listagem não cria aviso', async () => {
    const scenario = await linkedIssue();

    await sync(scenario, {
      issues: [issueItem(45, 'closed', after(2 * SECOND))],
      eventPages: [[]]
    });

    expect(await eventsOf(scenario.project.id)).toEqual([]);
    expect((await prisma.issue.findUnique({ where: { id: scenario.issue.id } })).state).toBe(
      'closed'
    );
  });

  it('F-10 com o período coberto por leitura completa, a cobertura total do RF60 é calculada', async () => {
    const scenario = await linkedIssue();
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));
    await sync(scenario, {
      issues: [issueItem(45, 'closed', closed.occurredAt)],
      eventPages: [[closed]]
    });
    await dispatch();
    await prisma.gitHubEventCoverage.update({
      where: { projectId: scenario.project.id },
      data: { completeThrough: new Date(Date.now() + 2 * 86_400_000) }
    });

    const report = await metrics().compute({
      from: today(),
      to: today(),
      projectId: scenario.project.id,
      timeZone: TIME_ZONE
    });

    expect(report.requisitos.RF60).toMatchObject({
      eventos: 1,
      ocorridos: 1,
      enviadasCorretamente: 1,
      lacunas: []
    });
    expect(report.requisitos.RF60.coberturaTotal.valor).toBe(100);
  });

  it('F-11 issue vinculada a duas tarefas gera um evento com as duas como alvo e avisa cada uma', async () => {
    const scenario = await linkedIssue();
    const other = await person(scenario.project.id);
    const second = await createTask(prisma, scenario.project.id, { responsibleUserId: other.id });
    await taskIssueService.linkIssue(
      second.id,
      { issueId: scenario.issue.id },
      context(scenario.owner.id)
    );
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));

    await sync(scenario, {
      issues: [issueItem(45, 'closed', closed.occurredAt)],
      eventPages: [[closed]]
    });
    await dispatch();

    const events = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: scenario.project.id, type: LIFECYCLE },
      include: { targets: { orderBy: { taskId: 'asc' } } }
    });
    expect(events).toHaveLength(1);
    expect(events[0].linkedTaskCount).toBe(2);
    expect(events[0].targets.map((target) => target.taskId)).toEqual([scenario.task.id, second.id]);
    expect(await notificationsOf(scenario.responsible.id)).toHaveLength(1);
    expect(await notificationsOf(other.id)).toHaveLength(1);
  });

  it('F-12 o mesmo evento em duas páginas vale uma vez', async () => {
    const scenario = await linkedIssue();
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));

    await sync(scenario, {
      issues: [issueItem(45, 'closed', closed.occurredAt)],
      eventPages: [[closed], [{ ...closed }]]
    });

    expect(
      await prisma.issueLifecycleEvent.count({ where: { projectId: scenario.project.id } })
    ).toBe(1);
    expect(await eventsOf(scenario.project.id)).toHaveLength(1);
  });

  it('F-13 falha no meio da gravação desfaz registro, evento e alvos; a sincronização seguinte grava uma vez', async () => {
    const scenario = await linkedIssue();
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));
    const spec = { issues: [issueItem(45, 'closed', closed.occurredAt)], eventPages: [[closed]] };
    vi.spyOn(githubEventRepository, 'advanceCoverage').mockRejectedValueOnce(
      Object.assign(new Error('Lost connection'), { code: 'P1017' })
    );

    const failed = await sync(scenario, spec);

    expect(failed.status).toBe('FAILED');
    expect(
      await prisma.issueLifecycleEvent.count({ where: { projectId: scenario.project.id } })
    ).toBe(0);
    expect(await eventsOf(scenario.project.id)).toEqual([]);
    expect(
      await prisma.gitHubArtifactEventTask.count({ where: { event: { type: LIFECYCLE } } })
    ).toBe(0);

    const resumed = await sync(scenario, spec);
    await dispatch();

    expect(resumed.status).toBe('SUCCEEDED');
    expect(await eventsOf(scenario.project.id)).toHaveLength(1);
    expect(await notificationsOf(scenario.responsible.id)).toHaveLength(1);
  });

  it('F-14 duas gravações simultâneas da mesma leitura geram um registro e um evento', async () => {
    const scenario = await linkedIssue();
    const occurredAt = after(2 * SECOND);
    const record = () =>
      githubRepositoryEventsRepository.record(scenario.project.id, {
        pullRequestEvents: [],
        issueEvents: [{ providerEventId: '424242', number: 45, eventType: 'CLOSED', occurredAt }],
        readStartedAt: new Date()
      });

    const results = await Promise.all([record(), record()]);

    expect(results.map((result) => result.recorded).sort()).toEqual([0, 1]);
    expect(
      await prisma.issueLifecycleEvent.count({ where: { projectId: scenario.project.id } })
    ).toBe(1);
    expect(await eventsOf(scenario.project.id)).toHaveLength(1);
  });

  it('F-15 período de tarefa de outro projeto, mesmo forjado no banco, não entra no evento', async () => {
    const scenario = await linkedIssue();
    const foreign = await createProject(prisma);
    const foreignTask = await createTask(prisma, foreign.id);
    await prisma.taskArtifactLinkPeriod.create({
      data: {
        projectId: scenario.project.id,
        taskId: foreignTask.id,
        issueId: scenario.issue.id,
        linkedAt: new Date(Date.now() - MINUTE)
      }
    });
    const closed = githubEvent('ISSUE', 45, 'CLOSED', after(2 * SECOND));

    await sync(scenario, {
      issues: [issueItem(45, 'closed', closed.occurredAt)],
      eventPages: [[closed]]
    });

    const events = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: scenario.project.id, type: LIFECYCLE },
      include: { targets: true }
    });
    expect(events).toHaveLength(1);
    expect(events[0].linkedTaskCount).toBe(1);
    expect(events[0].targets.map((target) => target.taskId)).toEqual([scenario.task.id]);
  });

  it('F-16 cem eventos de cem PRs vinculadas numa leitura cabem com folga no prazo da transação', async () => {
    const scenario = await integratedProject();
    const numbers = Array.from({ length: 100 }, (_, index) => 200 + index);
    await sync(scenario, { pullRequests: numbers.map((number) => pullRequestItem(number)) });
    const pullRequests = await prisma.pullRequest.findMany({
      where: { projectId: scenario.project.id },
      orderBy: { number: 'asc' }
    });
    const linkedAt = new Date(Date.now() - MINUTE);
    for (const pullRequest of pullRequests) {
      const task = await createTask(prisma, scenario.project.id, {
        responsibleUserId: scenario.responsible.id,
        pullRequestId: pullRequest.id
      });
      await prisma.taskArtifactLinkPeriod.create({
        data: {
          projectId: scenario.project.id,
          taskId: task.id,
          pullRequestId: pullRequest.id,
          linkedAt
        }
      });
    }
    const mergedAt = after(2 * SECOND);

    const started = performance.now();
    const run = await sync(scenario, {
      pullRequests: numbers.map((number) =>
        pullRequestItem(number, 'closed', { closedAt: mergedAt, mergedAt })
      ),
      eventPages: [numbers.map((number) => githubEvent('PULL_REQUEST', number, 'MERGED', mergedAt))]
    });
    const elapsed = performance.now() - started;

    expect(run.status).toBe('SUCCEEDED');
    expect(await eventsOf(scenario.project.id)).toHaveLength(100);
    expect(elapsed).toBeLessThan(10_000);
  }, 60000);
});

describe('TF-REV-014 — o fechamento só é absorvido pelo merge que o fechou', () => {
  const typesOf = async (projectId) =>
    (await eventsOf(projectId)).map((event) => [event.type, event.occurredAt]);

  it('Q-07 fechada, reaberta e mesclada em 4 s numa leitura: o fechamento distinto e o merge avisam (A3)', async () => {
    const scenario = await linkedPullRequest();
    const closedAt = after(2 * SECOND);
    const mergedAt = after(6 * SECOND);

    const run = await sync(scenario, {
      pullRequests: [pullRequestItem(9, 'closed', { closedAt: mergedAt, mergedAt })],
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'CLOSED', closedAt),
          githubEvent('PULL_REQUEST', 9, 'REOPENED', after(3 * SECOND)),
          githubEvent('PULL_REQUEST', 9, 'MERGED', mergedAt),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', mergedAt)
        ]
      ]
    });
    await dispatch();

    expect(run.status, JSON.stringify(run.error)).toBe('SUCCEEDED');
    expect(await typesOf(scenario.project.id)).toEqual([
      ['PULL_REQUEST_CLOSED', closedAt],
      ['PULL_REQUEST_MERGED', mergedAt]
    ]);
    expect(await notificationsOf(scenario.responsible.id)).toEqual([
      { githubEvent: 'PULL_REQUEST_CLOSED', githubOccurredAt: closedAt, taskId: scenario.task.id },
      { githubEvent: 'PULL_REQUEST_MERGED', githubOccurredAt: mergedAt, taskId: scenario.task.id }
    ]);
  });

  it('Q-07b os quatro eventos no mesmo segundo: a ordem vem do id e o fechamento distinto avisa', async () => {
    const scenario = await linkedPullRequest();
    const instant = after(2 * SECOND);

    await sync(scenario, {
      pullRequests: [pullRequestItem(9, 'closed', { closedAt: instant, mergedAt: instant })],
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'CLOSED', instant),
          githubEvent('PULL_REQUEST', 9, 'REOPENED', instant),
          githubEvent('PULL_REQUEST', 9, 'MERGED', instant),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', instant)
        ]
      ]
    });

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'PULL_REQUEST_CLOSED',
      'PULL_REQUEST_MERGED'
    ]);
  });

  it('Q-08 o fechamento que chega atrasado é comparado com a reabertura gravada na leitura anterior', async () => {
    const scenario = await linkedPullRequest();
    const closedAt = after(2 * SECOND);
    const mergedAt = after(6 * SECOND);
    const lateClosed = githubEvent('PULL_REQUEST', 9, 'CLOSED', closedAt);
    const snapshot = [pullRequestItem(9, 'closed', { closedAt: mergedAt, mergedAt })];

    await sync(scenario, {
      pullRequests: snapshot,
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'REOPENED', after(3 * SECOND)),
          githubEvent('PULL_REQUEST', 9, 'MERGED', mergedAt),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', mergedAt)
        ]
      ]
    });
    const late = await sync(scenario, { pullRequests: snapshot, eventPages: [[lateClosed]] });
    await dispatch();

    expect(late.status, JSON.stringify(late.error)).toBe('SUCCEEDED');
    expect(await typesOf(scenario.project.id)).toEqual([
      ['PULL_REQUEST_CLOSED', closedAt],
      ['PULL_REQUEST_MERGED', mergedAt]
    ]);
  });

  it('Q-08b sem reabertura entre os dois, o merge já gravado absorve só o fechamento mais próximo', async () => {
    const scenario = await linkedPullRequest();
    const mergedAt = after(6 * SECOND);
    const snapshot = [pullRequestItem(9, 'closed', { closedAt: mergedAt, mergedAt })];

    await sync(scenario, {
      pullRequests: snapshot,
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'MERGED', mergedAt),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', mergedAt)
        ]
      ]
    });
    await sync(scenario, {
      pullRequests: snapshot,
      eventPages: [[githubEvent('PULL_REQUEST', 9, 'CLOSED', after(3 * SECOND))]]
    });

    expect((await eventsOf(scenario.project.id)).map((event) => event.type)).toEqual([
      'PULL_REQUEST_CLOSED',
      'PULL_REQUEST_MERGED'
    ]);
  });

  it('Q-09 o RF61 conta o fechamento distinto e o merge, com os dois avisos enviados', async () => {
    const scenario = await linkedPullRequest();
    const mergedAt = after(6 * SECOND);
    await sync(scenario, {
      pullRequests: [pullRequestItem(9, 'closed', { closedAt: mergedAt, mergedAt })],
      eventPages: [
        [
          githubEvent('PULL_REQUEST', 9, 'CLOSED', after(2 * SECOND)),
          githubEvent('PULL_REQUEST', 9, 'REOPENED', after(3 * SECOND)),
          githubEvent('PULL_REQUEST', 9, 'MERGED', mergedAt),
          githubEvent('PULL_REQUEST', 9, 'CLOSED', mergedAt)
        ]
      ]
    });
    await dispatch();

    const report = await metrics().compute({
      from: today(),
      to: today(),
      projectId: scenario.project.id,
      timeZone: TIME_ZONE
    });

    expect(report.requisitos.RF61).toMatchObject({
      eventos: 2,
      ocorridos: 2,
      enviadasCorretamente: 2
    });
  });
});
