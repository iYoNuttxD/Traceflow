import { appendFileSync } from 'node:fs';
import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';
import { backdateGithubLinks, lifecycleEventsFor } from '../helpers/github-lifecycle.js';
import { mapGithubIssue, mapGithubPullRequest } from '../../src/modules/github/github.mapper.js';

const boundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));

const password = 'SenhaSegura123';
const OWNER_LOGIN = 'usuario-s203';
const REPOSITORY = 'repositorio-s203';
const OPENED_AT = '2026-10-01T10:00:00Z';
const UPDATED_AT = '2026-10-12T11:00:00Z';
const CLOSED_AT = '2026-10-12T13:00:00Z';
const MERGED_AT = '2026-10-12T14:00:00Z';
const REOPENED_AT = '2026-10-12T15:00:00Z';
const ALL_ON = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true,
  TRACEABILITY_INCONSISTENCY: true
};
const GITHUB_TYPES = ['ISSUE_EVENT', 'PULL_REQUEST_EVENT'];
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');

let app;
let prisma;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: expressApp } = await import('../../src/app.js');
  app = await startTestServer(expressApp);
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

function observe(name, value) {
  if (process.env.S203_OBS_OUT)
    appendFileSync(process.env.S203_OBS_OUT, `${JSON.stringify({ name, value })}\n`);
}

async function register(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa bateria S2-03 ${sequence}`,
    username: `s203bat${sequence}`,
    email: `s203-bateria-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId) await join(projectId, response.body.user.id, role);
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

function join(projectId, userId, role = 'MEMBER') {
  return prisma.projectMembership.create({ data: { projectId, userId, role } });
}

async function integratedProject(overrides = {}) {
  sequence += 1;
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: `s203-bateria-${sequence}`,
      accountId: `s203-bateria-account-${sequence}`,
      accountLogin: OWNER_LOGIN,
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  const project = await createProject(prisma, { createdAt: PROJECT_CREATED_AT, ...overrides });
  const repositoryId = String(96000 + sequence);
  await prisma.projectGitHubIntegration.create({
    data: {
      projectId: project.id,
      installationId: installation.id,
      githubRepositoryId: repositoryId,
      repositoryName: REPOSITORY,
      repositoryFullName: `${OWNER_LOGIN}/${REPOSITORY}`,
      repositoryUrl: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}`,
      defaultBranch: 'trunk',
      status: 'ACTIVE'
    }
  });
  return { ...project, repositoryId };
}

const rawIssue = (number, state, overrides = {}) => ({
  id: 60000 + number,
  number,
  title: `Issue ${number}`,
  body: 'corpo-da-issue-s203',
  state,
  user: { login: 'autor-github-s203' },
  assignee: { login: 'responsavel-github-s203' },
  labels: [{ id: 1, name: 'rotulo-s203', color: 'ff0000', description: null }],
  milestone: null,
  html_url: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}/issues/${number}`,
  created_at: OPENED_AT,
  updated_at: UPDATED_AT,
  closed_at: state === 'closed' ? CLOSED_AT : null,
  ...overrides
});

const rawPullRequest = (number, state, overrides = {}) => ({
  id: 80000 + number,
  number,
  title: `PR ${number}`,
  body: 'corpo-da-pr-s203',
  state,
  user: { login: 'autor-github-s203' },
  head: { ref: `feature/${number}` },
  base: { ref: 'trunk' },
  html_url: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}/pull/${number}`,
  created_at: OPENED_AT,
  updated_at: UPDATED_AT,
  closed_at: state === 'closed' ? CLOSED_AT : null,
  merged_at: null,
  ...overrides
});

const merged = (number, overrides = {}) =>
  rawPullRequest(number, 'closed', { closed_at: MERGED_AT, merged_at: MERGED_AT, ...overrides });

async function* pagesOf(list, map) {
  for (const page of list) {
    if (page instanceof Error) throw page;
    yield page.map(map).filter(Boolean);
  }
}

function githubDouble(
  project,
  { issuePages = [[]], pullRequestPages = [[]], issueGate = Promise.resolve() } = {}
) {
  return {
    getRepository: vi.fn().mockResolvedValue({
      githubRepositoryId: project.repositoryId,
      name: REPOSITORY,
      owner: OWNER_LOGIN,
      fullName: `${OWNER_LOGIN}/${REPOSITORY}`,
      url: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}`,
      defaultBranch: 'trunk',
      private: true,
      description: null
    }),
    listBranchPages: vi.fn(() =>
      pagesOf([[{ name: 'trunk', headSha: 'trunk-head' }]], (item) => item)
    ),
    listCommitPages: vi.fn(() => pagesOf([[]], (item) => item)),
    listPullRequestPages: vi.fn(() => pagesOf(pullRequestPages, mapGithubPullRequest)),
    listRepositoryEventPages: vi.fn(() =>
      pagesOf(
        [
          lifecycleEventsFor({
            issues: issuePages.filter(Array.isArray).flat(),
            pullRequests: pullRequestPages.filter(Array.isArray).flat()
          })
        ],
        (item) => item
      )
    ),
    listIssuePages: vi.fn(async function* () {
      await issueGate;
      yield* pagesOf(issuePages, mapGithubIssue);
    })
  };
}

async function finishedRun(actor, project) {
  let run = null;
  await vi.waitFor(
    async () => {
      const status = await actor.agent.get(`/api/projects/${project.id}/github/sync/status`);
      run = status.body.run;
      expect(['SUCCEEDED', 'FAILED']).toContain(run?.status);
    },
    { timeout: 15000, interval: 20 }
  );
  return run;
}

async function settled(project) {
  await vi.waitFor(
    async () => {
      const due = await prisma.gitHubArtifactEvent.count({
        where: {
          projectId: project.id,
          OR: [{ status: 'PENDING', nextAttemptAt: { lte: new Date() } }, { status: 'PROCESSING' }]
        }
      });
      expect(due).toBe(0);
    },
    { timeout: 15000, interval: 20 }
  );
}

async function syncVia(actor, project, spec = {}) {
  boundary.client = githubDouble(project, {
    issuePages: spec.issuePages || [spec.issues || []],
    pullRequestPages: spec.pullRequestPages || [spec.pullRequests || []]
  });
  const started = await actor.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
  expect(started.status, JSON.stringify(started.body)).toBe(202);
  const run = await finishedRun(actor, project);
  await settled(project);
  return run;
}

const issueOf = (project, number) =>
  prisma.issue.findUnique({ where: { projectId_number: { projectId: project.id, number } } });
const pullRequestOf = (project, number) =>
  prisma.pullRequest.findUnique({ where: { projectId_number: { projectId: project.id, number } } });

async function linkIssue(actor, task, project, number, { backdate = true } = {}) {
  const issue = await issueOf(project, number);
  const linked = await actor
    .mutate('post', `/api/tasks/${task.id}/issues`)
    .send({ issueId: issue.id });
  expect(linked.status, JSON.stringify(linked.body)).toBe(201);
  if (backdate) await backdateGithubLinks(prisma, project.id);
  return issue;
}

async function linkPullRequest(actor, task, project, number, { backdate = true } = {}) {
  const pullRequest = await pullRequestOf(project, number);
  const linked = await actor
    .mutate('patch', `/api/tasks/${task.id}/pull-request`)
    .send({ pullRequestId: pullRequest.id });
  expect(linked.status, JSON.stringify(linked.body)).toBe(200);
  if (backdate) await backdateGithubLinks(prisma, project.id);
  return pullRequest;
}

async function githubNotificationsOf(person, { links = false } = {}) {
  const response = await person.agent.get('/api/notifications?status=ALL&limit=100');
  expect(response.status).toBe(200);
  return response.body.notifications.filter(
    (item) => GITHUB_TYPES.includes(item.type) && (links || item.context.event !== 'ISSUE_LINKED')
  );
}

async function storedNotification(recipient, projectId, overrides = {}) {
  sequence += 1;
  const task = await createTask(prisma, projectId, { title: `Tarefa armazenada ${sequence}` });
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      taskId: task.id,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${900000 + sequence}:task:${task.id}`,
      taskTitle: task.title,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}/issues/45`,
      githubOccurredAt: new Date(CLOSED_AT),
      ...overrides
    }
  });
}

const withoutRequestId = (body) => {
  const copy = JSON.parse(JSON.stringify(body));
  if (copy?.error) delete copy.error.requestId;
  delete copy.requestId;
  return copy;
};

describe('S2-03 bateria — bloco C: documento oficial e casos de uso', () => {
  it('EV-C-01 UC04 passos 4 a 6: issue vinculada fechada notifica, sem vínculo vira alerta', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(1, 'open'), rawIssue(2, 'open')] });
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });
    await linkIssue(manager, task, project, 1);

    const run = await syncVia(manager, project, {
      issues: [rawIssue(1, 'closed'), rawIssue(2, 'closed')]
    });

    expect(run.status).toBe('SUCCEEDED');
    const notifications = await githubNotificationsOf(participant);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: 'ISSUE_EVENT',
      task: { id: task.id },
      context: { event: 'ISSUE_CLOSED', artifact: { kind: 'ISSUE', number: 1 } }
    });
    const alerts = await manager.agent.get(
      `/api/projects/${project.id}/traceability/alerts?type=ISSUE_CLOSED_WITHOUT_TASK`
    );
    expect(alerts.status).toBe(200);
    expect(alerts.body.alerts).toHaveLength(1);
    const detail = await manager.agent.get(
      `/api/projects/${project.id}/traceability/alerts/${alerts.body.alerts[0].id}`
    );
    expect(detail.body.alert.context.number).toBe(2);
  });

  it('EV-C-02 UC04 E2: falha na segunda página de issues é informada; os eventos vêm na sincronização seguinte, sem perda', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, {
      pullRequests: [rawPullRequest(10, 'open')],
      issuePages: [[rawIssue(20, 'open')], [rawIssue(21, 'open')]]
    });
    for (const link of [
      (task) => linkPullRequest(manager, task, project, 10),
      (task) => linkIssue(manager, task, project, 20),
      (task) => linkIssue(manager, task, project, 21)
    ])
      await link(await createTask(prisma, project.id, { responsibleUserId: participant.user.id }));

    const failed = await syncVia(manager, project, {
      pullRequests: [merged(10)],
      issuePages: [
        [rawIssue(20, 'closed')],
        Object.assign(new Error('Bad Gateway: upstream bruto do GitHub'), { status: 502 })
      ]
    });

    expect(failed.status).toBe('FAILED');
    expect(failed.error?.message).toEqual(expect.any(String));
    expect(JSON.stringify(failed)).not.toContain('upstream bruto');
    observe('EV-C-02 erro da execução', failed.error);
    expect(await githubNotificationsOf(participant)).toEqual([]);

    await syncVia(manager, project, {
      pullRequests: [merged(10)],
      issuePages: [[rawIssue(20, 'closed')], [rawIssue(21, 'closed')]]
    });
    const afterRecovery = await githubNotificationsOf(participant);
    expect(afterRecovery.map((item) => item.context.artifact.number).sort()).toEqual([10, 20, 21]);
  });

  it('EV-C-03 UC04 E3: sem permissão no GitHub, o estado não muda e nada é avisado', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(30, 'open')] });
    await linkIssue(
      manager,
      await createTask(prisma, project.id, { responsibleUserId: participant.user.id }),
      project,
      30
    );

    const failed = await syncVia(manager, project, {
      issuePages: [
        Object.assign(new Error('Resource not accessible by integration'), { status: 403 })
      ]
    });

    expect(failed.status).toBe('FAILED');
    observe('EV-C-03 erro da execução', failed.error);
    expect((await issueOf(project, 30)).state).toBe('open');
    expect(await githubNotificationsOf(participant)).toEqual([]);
  });

  it('EV-C-04 Quadro 3-57: só responsável, autor de comentário e quem lançou esforço recebem', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const responsible = await register(project.id);
    const commenter = await register(project.id);
    const worker = await register(project.id);
    const mover = await register(project.id);
    const linker = await register(project.id, 'MANAGER');
    const bystander = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(40, 'open')] });
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });
    await linkIssue(linker, task, project, 40);
    expect(
      (
        await commenter
          .mutate('post', `/api/tasks/${task.id}/comments`)
          .send({ content: 'Comentário da bateria S2-03' })
      ).status
    ).toBe(201);
    const effort = await worker
      .mutate('post', `/api/tasks/${task.id}/time-entries`)
      .send({ hours: 1 });
    expect(effort.status, JSON.stringify(effort.body)).toBe(201);
    const moved = await mover
      .mutate('patch', `/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);

    await syncVia(manager, project, { issues: [rawIssue(40, 'closed')] });

    for (const person of [responsible, commenter, worker])
      expect(await githubNotificationsOf(person), person.user.username).toHaveLength(1);
    for (const person of [manager, mover, linker, bystander])
      expect(await githubNotificationsOf(person), person.user.username).toEqual([]);
  });

  it('EV-C-05 Quadro 3-57: vincular issue aberta avisa a associação uma vez; reabrir issue vinculada avisa', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(41, 'open')] });
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });
    await linkIssue(manager, task, project, 41);
    await syncVia(manager, project, { issues: [rawIssue(41, 'open'), rawIssue(42, 'open')] });
    await linkIssue(manager, task, project, 42);
    await syncVia(manager, project, { issues: [rawIssue(41, 'open'), rawIssue(42, 'open')] });
    const links = await githubNotificationsOf(participant, { links: true });
    expect(links.map((item) => [item.context.event, item.context.artifact.number])).toEqual([
      ['ISSUE_LINKED', 42],
      ['ISSUE_LINKED', 41]
    ]);

    await syncVia(manager, project, { issues: [rawIssue(41, 'closed'), rawIssue(42, 'open')] });
    await syncVia(manager, project, {
      issues: [
        rawIssue(41, 'open', { updated_at: REOPENED_AT, reopened_at: REOPENED_AT }),
        rawIssue(42, 'open')
      ]
    });

    const events = (await githubNotificationsOf(participant, { links: true })).map(
      (item) => item.context.event
    );
    expect(events.sort()).toEqual([
      'ISSUE_CLOSED',
      'ISSUE_LINKED',
      'ISSUE_LINKED',
      'ISSUE_REOPENED'
    ]);
  });

  it('EV-C-06 Quadro 3-58: mesclada e fechada sem merge avisam; reabertura e PR nova não', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, {
      pullRequests: [
        rawPullRequest(50, 'open'),
        rawPullRequest(51, 'open'),
        rawPullRequest(52, 'closed')
      ]
    });
    for (const number of [50, 51, 52])
      await linkPullRequest(
        manager,
        await createTask(prisma, project.id, { responsibleUserId: participant.user.id }),
        project,
        number
      );

    await syncVia(manager, project, {
      pullRequests: [
        merged(50),
        rawPullRequest(51, 'closed'),
        rawPullRequest(52, 'open', { updated_at: REOPENED_AT }),
        rawPullRequest(53, 'open')
      ]
    });
    await linkPullRequest(
      manager,
      await createTask(prisma, project.id, { responsibleUserId: participant.user.id }),
      project,
      53
    );
    await syncVia(manager, project, {
      pullRequests: [
        merged(50),
        rawPullRequest(51, 'closed'),
        rawPullRequest(52, 'open', { updated_at: REOPENED_AT }),
        rawPullRequest(53, 'open')
      ]
    });

    const received = (await githubNotificationsOf(participant))
      .map((item) => `${item.context.artifact.number}:${item.context.event}`)
      .sort();
    expect(received).toEqual(['50:PULL_REQUEST_MERGED', '51:PULL_REQUEST_CLOSED']);
  });

  it('EV-C-07 §3.2.8: ações feitas no TraceFlow nunca geram aviso do GitHub', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(43, 'closed')] });
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });

    const issue = await linkIssue(manager, task, project, 43);
    await participant.mutate('post', `/api/tasks/${task.id}/comments`).send({ content: 'Olá' });
    await manager.mutate('patch', `/api/tasks/${task.id}/move`).send({ toStatus: 'EM_ANDAMENTO' });
    expect(
      (await manager.mutate('delete', `/api/tasks/${task.id}/issues/${issue.id}`).send()).status
    ).toBe(200);
    await linkIssue(manager, task, project, 43);

    expect(await githubNotificationsOf(participant)).toEqual([]);
    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
  });
});

describe('S2-03 bateria — bloco T pela rota', () => {
  it('EV-T-06 mudar só título, corpo, rótulo ou autor não avisa', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, {
      issues: [rawIssue(46, 'closed')],
      pullRequests: [merged(47)]
    });
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });
    await linkIssue(manager, task, project, 46, { backdate: false });
    await linkPullRequest(manager, task, project, 47, { backdate: false });

    await syncVia(manager, project, {
      issues: [
        rawIssue(46, 'closed', {
          title: 'Outro título',
          body: 'outro corpo',
          labels: [],
          user: { login: 'outra-pessoa' }
        })
      ],
      pullRequests: [merged(47, { title: 'Outro título da PR', head: { ref: 'outra' } })]
    });

    expect(await githubNotificationsOf(participant)).toEqual([]);
  });
});

describe('S2-03 bateria — bloco L: leitura e DTO', () => {
  it('EV-L-01 os quatro eventos chegam com as chaves exatas do contrato e nada interno', async () => {
    const project = await integratedProject({ name: 'Projeto DTO S2-03' });
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, {
      issues: [rawIssue(60, 'open'), rawIssue(61, 'closed')],
      pullRequests: [rawPullRequest(62, 'open'), rawPullRequest(63, 'open')]
    });
    const task = await createTask(prisma, project.id, {
      responsibleUserId: participant.user.id,
      title: 'Tarefa do DTO'
    });
    await linkIssue(manager, task, project, 60);
    await linkIssue(manager, task, project, 61);
    const secondTask = await createTask(prisma, project.id, {
      responsibleUserId: participant.user.id
    });
    await linkPullRequest(manager, task, project, 62);
    await linkPullRequest(manager, secondTask, project, 63);

    await syncVia(manager, project, {
      issues: [
        rawIssue(60, 'closed'),
        rawIssue(61, 'open', { updated_at: REOPENED_AT, reopened_at: REOPENED_AT })
      ],
      pullRequests: [merged(62), rawPullRequest(63, 'closed')]
    });

    const notifications = await githubNotificationsOf(participant);
    expect(notifications).toHaveLength(4);
    const byEvent = new Map(notifications.map((item) => [item.context.event, item]));
    expect([...byEvent.keys()].sort()).toEqual([
      'ISSUE_CLOSED',
      'ISSUE_REOPENED',
      'PULL_REQUEST_CLOSED',
      'PULL_REQUEST_MERGED'
    ]);
    const occurred = {
      ISSUE_CLOSED: CLOSED_AT,
      ISSUE_REOPENED: REOPENED_AT,
      PULL_REQUEST_MERGED: MERGED_AT,
      PULL_REQUEST_CLOSED: CLOSED_AT
    };
    for (const [event, item] of byEvent) {
      expect(Object.keys(item).sort()).toEqual(
        ['context', 'createdAt', 'id', 'link', 'project', 'readAt', 'task', 'type'].sort()
      );
      expect(Object.keys(item.context).sort()).toEqual(['artifact', 'event', 'occurredAt']);
      expect(Object.keys(item.context.artifact).sort()).toEqual(['kind', 'number', 'title', 'url']);
      expect(item.context.occurredAt).toBe(new Date(occurred[event]).toISOString());
      expect(item.project).toEqual({ id: project.id, name: 'Projeto DTO S2-03' });
      expect(item.link).toBe(`/projects/${project.id}/kanban?task=${item.task.id}`);
      expect(item.context.artifact.url).toMatch(
        /^https:\/\/github\.com\/usuario-s203\/repositorio-s203\//
      );
    }
    const serialized = JSON.stringify(notifications);
    for (const forbidden of [
      'dedupeKey',
      'recipientUserId',
      'occurrenceKey',
      'outcome',
      'autor-github-s203',
      'responsavel-github-s203',
      'corpo-da-',
      'rotulo-s203',
      participant.user.email
    ])
      expect(serialized, forbidden).not.toContain(forbidden);
  });

  it('EV-L-02 URL gravada fora da regra sai nula; só a forma válida passa', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const variants = new Map([
      ['https://github.com/usuario-s203/repositorio-s203/issues/45', true],
      ['http://github.com/usuario-s203/repositorio-s203/issues/45', false],
      ['https://github.com.evil.example/usuario-s203/issues/45', false],
      [`https://github.com/${'a'.repeat(512 - 'https://github.com/'.length)}`, true],
      ['javascript:alert(1)', false],
      ['HTTPS://GITHUB.COM/usuario-s203/repositorio-s203/issues/45', false]
    ]);
    const rows = new Map();
    for (const url of variants.keys())
      rows.set((await storedNotification(owner, project.id, { artifactUrl: url })).id, url);

    const response = await owner.agent.get('/api/notifications?status=ALL&limit=100');

    for (const item of response.body.notifications) {
      const stored = rows.get(item.id);
      expect(item.context.artifact.url, stored).toBe(variants.get(stored) ? stored : null);
    }
  });

  it('EV-L-03 tipos misturados: o cursor percorre tudo sem perder nem repetir, mesmo marcando no caminho', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const instants = [
      '2026-10-12T10:00:00.000Z',
      '2026-10-12T11:00:00.000Z',
      '2026-10-12T12:00:00.000Z'
    ];
    const tasks = await Promise.all(
      [1, 2, 3].map(() => createTask(prisma, project.id, { title: 'Tarefa da paginação' }))
    );
    const data = [];
    for (let index = 0; index < 300; index += 1) {
      const github = index % 3 !== 0;
      const task = tasks[index % 3];
      data.push({
        recipientUserId: owner.user.id,
        projectId: project.id,
        taskId: task.id,
        type: github ? (index % 2 ? 'ISSUE_EVENT' : 'PULL_REQUEST_EVENT') : 'TASK_STATUS_CHANGED',
        dedupeKey: `PAGINA:${index}`,
        taskTitle: task.title,
        ...(github
          ? {
              githubEvent: index % 2 ? 'ISSUE_CLOSED' : 'PULL_REQUEST_MERGED',
              artifactNumber: index,
              artifactTitle: `Artefato ${index}`,
              artifactUrl: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}/issues/${index}`,
              githubOccurredAt: new Date(CLOSED_AT)
            }
          : { fromStatus: 'A_FAZER', toStatus: 'EM_ANDAMENTO' }),
        createdAt: new Date(instants[index % instants.length])
      });
    }
    await prisma.notification.createMany({ data });
    const expected = await prisma.notification.findMany({
      where: { recipientUserId: owner.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true }
    });

    const seen = [];
    let cursor = null;
    do {
      const page = await owner.agent.get(
        `/api/notifications?status=ALL&limit=40${cursor ? `&cursor=${cursor}` : ''}`
      );
      expect(page.status).toBe(200);
      seen.push(...page.body.notifications.map((item) => item.id));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected.map((row) => row.id));

    const unreadSeen = new Set();
    const markedOnTheWay = new Set();
    cursor = null;
    do {
      const page = await owner.agent.get(
        `/api/notifications?status=UNREAD&limit=40${cursor ? `&cursor=${cursor}` : ''}`
      );
      for (const item of page.body.notifications) {
        expect(unreadSeen.has(item.id)).toBe(false);
        unreadSeen.add(item.id);
      }
      for (const item of page.body.notifications.filter((_, index) => index % 3 === 0)) {
        await owner.mutate('patch', `/api/notifications/${item.id}`).send({ read: true });
        markedOnTheWay.add(item.id);
      }
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(unreadSeen.size).toBe(300);
    expect(markedOnTheWay.size).toBeGreaterThan(0);
  });

  it('EV-L-05 artefato apagado depois do aviso: o snapshot continua na lista', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(64, 'open')] });
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });
    const issue = await linkIssue(manager, task, project, 64);
    await syncVia(manager, project, {
      issues: [rawIssue(64, 'closed', { title: 'Título copiado' })]
    });

    await prisma.taskIssue.deleteMany({ where: { issueId: issue.id } });
    await prisma.issue.delete({ where: { id: issue.id } });

    const [notification] = await githubNotificationsOf(participant);
    expect(notification.context.artifact).toEqual({
      kind: 'ISSUE',
      number: 64,
      title: 'Título copiado',
      url: `https://github.com/${OWNER_LOGIN}/${REPOSITORY}/issues/64`
    });
  });
});

describe('S2-03 bateria — bloco F: preferências com quatro chaves', () => {
  it('EV-F-02 cliente antigo com as duas chaves do S2-02 recebe 400 e nada muda', async () => {
    const owner = await register();
    const response = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { TASK_STATUS_CHANGED: false, TASK_OVERDUE: false } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    observe('EV-F-02 resposta ao cliente antigo', withoutRequestId(response.body));
    expect((await owner.agent.get('/api/settings/notifications')).body).toEqual({
      preferences: ALL_ON
    });
  });

  it('EV-F-03 valores inválidos nas chaves do GitHub respondem 400, sem efeito', async () => {
    const owner = await register();
    for (const value of [null, 'true', 1, [], {}])
      for (const key of ['ISSUE_EVENT', 'PULL_REQUEST_EVENT']) {
        const response = await owner
          .mutate('put', '/api/settings/notifications')
          .send({ preferences: { ...ALL_ON, [key]: value } });
        expect(response.status, `${key}=${JSON.stringify(value)}`).toBe(400);
      }
    expect((await owner.agent.get('/api/settings/notifications')).body).toEqual({
      preferences: ALL_ON
    });
    expect(await prisma.notificationPreference.count({ where: { userId: owner.user.id } })).toBe(0);
  });

  it('EV-F-04 salvar outro tipo não reinicia o enabledAt do tipo do GitHub e audita só o alterado', async () => {
    const owner = await register();
    const put = (preferences) =>
      owner.mutate('put', '/api/settings/notifications').send({ preferences });
    await put({ ...ALL_ON, ISSUE_EVENT: false });
    await put(ALL_ON);
    const reenabled = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: owner.user.id, type: 'ISSUE_EVENT' } }
    });
    expect(reenabled.enabledAt).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await put({ ...ALL_ON, TASK_OVERDUE: false });

    const after = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: owner.user.id, type: 'ISSUE_EVENT' } }
    });
    expect(after.enabledAt.getTime()).toBe(reenabled.enabledAt.getTime());
    const audits = await prisma.auditEvent.findMany({
      where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: owner.user.id },
      orderBy: { id: 'asc' },
      select: { metadataJson: true }
    });
    expect(audits.map((audit) => audit.metadataJson.changedTypes)).toEqual([
      'ISSUE_EVENT',
      'ISSUE_EVENT',
      'TASK_OVERDUE'
    ]);
  });

  it('EV-F-05 PUTs simultâneos com as chaves do GitHub não dão 500 e terminam num dos estados enviados', async () => {
    const owner = await register();
    const bodies = [
      { ...ALL_ON, ISSUE_EVENT: false },
      { ...ALL_ON, PULL_REQUEST_EVENT: false },
      { ...ALL_ON, ISSUE_EVENT: false, PULL_REQUEST_EVENT: false },
      ALL_ON,
      { ...ALL_ON, TASK_OVERDUE: false, ISSUE_EVENT: false }
    ];

    const responses = await Promise.all(
      bodies.map((preferences) =>
        owner.mutate('put', '/api/settings/notifications').send({ preferences })
      )
    );

    for (const response of responses) {
      expect([200, 409]).toContain(response.status);
      if (response.status === 409) expect(response.body.code).toBe('NOTIFICATION_PREFERENCES_BUSY');
    }
    observe(
      'EV-F-05 status dos PUTs simultâneos',
      responses.map((response) => response.status)
    );
    const final = (await owner.agent.get('/api/settings/notifications')).body.preferences;
    expect(bodies).toContainEqual(final);
  });
});

describe('S2-03 bateria — bloco Z: autorização e visibilidade', () => {
  it('EV-Z-01 tabela de acesso com notificação do GitHub, inclusive projeto excluído e restaurado', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id, 'OWNER');
    const stranger = await register(project.id);
    const row = await storedNotification(owner, project.id);
    const anonymous = request(app);

    for (const [method, path] of [
      ['get', '/api/notifications'],
      ['get', '/api/notifications/unread-count'],
      ['patch', `/api/notifications/${row.id}`],
      ['post', '/api/notifications/read-all'],
      ['get', '/api/settings/notifications'],
      ['put', '/api/settings/notifications']
    ])
      expect((await anonymous[method](path).send({})).status, `${method} ${path}`).toBe(401);

    const alien = await stranger
      .mutate('patch', `/api/notifications/${row.id}`)
      .send({ read: true });
    const missing = await stranger
      .mutate('patch', '/api/notifications/2147483000')
      .send({ read: true });
    expect(alien.status).toBe(404);
    expect(withoutRequestId(alien.body)).toEqual(withoutRequestId(missing.body));

    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: owner.user.id },
      data: { isActive: false }
    });
    expect(
      (await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(404);
    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: owner.user.id },
      data: { isActive: true }
    });

    const deleted = await owner.mutate('delete', `/api/projects/${project.id}`).send({});
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(await githubNotificationsOf(owner)).toEqual([]);
    expect(
      (await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(404);
    const restored = await owner.mutate('post', `/api/projects/${project.id}/restore`).send({});
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await githubNotificationsOf(owner)).map((item) => item.id)).toEqual([row.id]);
    expect(
      (await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(200);
  });

  it('EV-Z-02 nenhuma rota expõe a fila ou dispara despacho', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id, 'OWNER');
    for (const method of ['get', 'post', 'put', 'patch', 'delete'])
      for (const path of [
        '/api/notifications/github-events',
        '/api/notifications/events',
        '/api/notifications/dispatch',
        '/api/notifications/queue',
        '/api/github-events',
        '/api/github/events',
        `/api/projects/${project.id}/github/events`,
        `/api/projects/${project.id}/github-events`,
        `/api/projects/${project.id}/notifications/dispatch`,
        '/api/settings/notifications/github'
      ]) {
        const response = await owner.mutate(method, path).send({});
        expect([400, 404, 405], `${method} ${path}`).toContain(response.status);
        expect(response.status, `${method} ${path}`).not.toBe(200);
      }
    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
  });

  it('EV-Z-03 o OWNER não vê nem marca o aviso do GitHub de outro membro', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id, 'OWNER');
    const member = await register(project.id);
    const row = await storedNotification(member, project.id);

    expect(await githubNotificationsOf(owner)).toEqual([]);
    expect(
      (await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(404);
    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });

  it('EV-Z-04 PATCH e read-all sem CSRF respondem 403 e não mudam o aviso do GitHub', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await storedNotification(owner, project.id);

    const patch = await owner.agent.patch(`/api/notifications/${row.id}`).send({ read: true });
    const readAll = await owner.agent.post('/api/notifications/read-all').send({});
    const forged = await owner.agent
      .patch(`/api/notifications/${row.id}`)
      .set('X-CSRF-Token', 'token-forjado')
      .send({ read: true });

    for (const response of [patch, readAll, forged]) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_INVALID');
    }
    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });

  it('EV-Z-05 ids e variantes de caminho nunca dão 500 nem mexem em aviso alheio', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const stranger = await register(project.id);
    const row = await storedNotification(owner, project.id);

    for (const id of ['0', '-1', '01', '1e2', '1.5', 'abc', '2147483648', '99999999999999999999']) {
      const response = await stranger
        .mutate('patch', `/api/notifications/${id}`)
        .send({ read: true });
      expect([400, 404], id).toContain(response.status);
    }
    for (const path of [
      `/api/notifications/${row.id}/`,
      `/api/notifications//${row.id}`,
      `/API/NOTIFICATIONS/${row.id}`,
      `/api/notifications/%3${String(row.id).slice(0, 1)}${String(row.id).slice(1)}`,
      `/api/notifications/${row.id}%20`
    ]) {
      const response = await stranger.mutate('patch', path).send({ read: true });
      expect(response.status, path).toBeLessThan(500);
      expect(response.status, path).not.toBe(200);
    }
    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });

  it('EV-Z-06 membership inativa num projeto esconde só os avisos dele', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const person = await register(projectA.id);
    await join(projectB.id, person.user.id);
    const inA = await storedNotification(person, projectA.id);
    const inB = await storedNotification(person, projectB.id);

    await prisma.projectMembership.updateMany({
      where: { projectId: projectA.id, userId: person.user.id },
      data: { isActive: false }
    });

    const ids = (await githubNotificationsOf(person)).map((item) => item.id);
    expect(ids).toEqual([inB.id]);
    expect(ids).not.toContain(inA.id);
  });
});

describe('S2-03 bateria — bloco S: sincronização e gancho', () => {
  it('EV-S-01 a execução bem-sucedida avisa; registra o intervalo até as notificações existirem', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const people = [];
    for (let index = 0; index < 3; index += 1) people.push(await register(project.id));
    const numbers = Array.from({ length: 30 }, (_, index) => 100 + index);
    await syncVia(manager, project, { issues: numbers.map((number) => rawIssue(number, 'open')) });
    for (const number of numbers) {
      const task = await createTask(prisma, project.id, { responsibleUserId: people[0].user.id });
      await linkIssue(manager, task, project, number);
      await prisma.taskComment.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          authorUserId: people[1].user.id,
          content: 'participação'
        }
      });
      await prisma.taskComment.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          authorUserId: people[2].user.id,
          content: 'participação'
        }
      });
    }

    boundary.client = githubDouble(project, {
      issuePages: [numbers.map((number) => rawIssue(number, 'closed'))]
    });
    const requestedAt = Date.now();
    expect(
      (await manager.mutate('post', `/api/projects/${project.id}/github/sync`).send({})).status
    ).toBe(202);
    const run = await finishedRun(manager, project);
    const finishedSeenAt = Date.now();
    const countAtFinish = await prisma.notification.count({
      where: { projectId: project.id, githubEvent: { not: 'ISSUE_LINKED' } }
    });
    await vi.waitFor(
      async () =>
        expect(
          await prisma.notification.count({
            where: { projectId: project.id, githubEvent: { not: 'ISSUE_LINKED' } }
          })
        ).toBe(90),
      { timeout: 15000, interval: 10 }
    );
    const notifiedAt = Date.now();

    expect(run.status).toBe('SUCCEEDED');
    observe('EV-S-01 intervalo', {
      requestToRunFinishedMs: finishedSeenAt - requestedAt,
      runFinishedToAllNotificationsMs: notifiedAt - finishedSeenAt,
      notificationsWhenRunLookedFinished: countAtFinish,
      runDurationMs: run.durationMs
    });
    for (const person of people)
      expect(await githubNotificationsOf(person), person.user.username).toHaveLength(30);
  });

  it('EV-S-02 execução que falha depois da página de PRs mantém o erro dela; o evento vem na seguinte, sem perda', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { pullRequests: [rawPullRequest(70, 'open')] });
    await linkPullRequest(
      manager,
      await createTask(prisma, project.id, { responsibleUserId: participant.user.id }),
      project,
      70
    );

    const run = await syncVia(manager, project, {
      pullRequests: [merged(70)],
      issuePages: [Object.assign(new Error('Bad Gateway'), { status: 502 })]
    });

    expect(run.status).toBe('FAILED');
    expect(run.error).toEqual({ code: expect.any(String), message: expect.any(String) });
    observe('EV-S-02 erro da execução', run.error);
    expect(await githubNotificationsOf(participant)).toEqual([]);

    const recovered = await syncVia(manager, project, { pullRequests: [merged(70)] });
    expect(recovered.status).toBe('SUCCEEDED');
    const [notification] = await githubNotificationsOf(participant);
    expect(notification.context).toMatchObject({
      event: 'PULL_REQUEST_MERGED',
      artifact: { number: 70 }
    });
  });

  it('EV-S-06 MEMBER e VIEWER não sincronizam; MANAGER sincroniza', async () => {
    const project = await integratedProject();
    const owner = await register(project.id, 'OWNER');
    const member = await register(project.id, 'MEMBER');
    const viewer = await register(project.id, 'VIEWER');
    const manager = await register(project.id, 'MANAGER');
    boundary.client = githubDouble(project, { issuePages: [[rawIssue(80, 'open')]] });

    for (const person of [member, viewer]) {
      const response = await person
        .mutate('post', `/api/projects/${project.id}/github/sync`)
        .send({});
      expect(response.status, person.user.username).toBe(403);
    }
    expect(await prisma.gitHubSyncRun.count({ where: { projectId: project.id } })).toBe(0);

    await syncVia(manager, project, { issues: [rawIssue(80, 'open')] });
    expect(await prisma.gitHubSyncRun.count({ where: { projectId: project.id } })).toBe(1);
    expect(owner.user.id).toBeGreaterThan(0);
  });

  it('EV-S-07 duas sincronizações pedidas juntas viram uma execução e um aviso', async () => {
    const project = await integratedProject();
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    await syncVia(manager, project, { issues: [rawIssue(81, 'open')] });
    await linkIssue(
      manager,
      await createTask(prisma, project.id, { responsibleUserId: participant.user.id }),
      project,
      81
    );
    const runsBefore = await prisma.gitHubSyncRun.count({ where: { projectId: project.id } });
    let openGate;
    const issueGate = new Promise((resolve) => {
      openGate = resolve;
    });
    boundary.client = githubDouble(project, {
      issuePages: [[rawIssue(81, 'closed')]],
      issueGate
    });

    const first = await manager.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    await vi.waitFor(() => expect(boundary.client.listIssuePages).toHaveBeenCalledTimes(1), {
      timeout: 15000,
      interval: 20
    });
    const second = await manager.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    const stillRunning = await prisma.gitHubSyncRun.findUnique({
      where: { id: first.body.run.id },
      select: { status: true }
    });
    openGate();
    await finishedRun(manager, project);
    await settled(project);

    expect([first.status, second.status]).toEqual([202, 202]);
    expect(stillRunning.status).toBe('RUNNING');
    expect(first.body.run.alreadyRunning).toBe(false);
    expect(second.body.run.alreadyRunning).toBe(true);
    observe(
      'EV-S-07 respostas',
      [first.body.run, second.body.run].map((run) => ({
        id: run?.id,
        alreadyRunning: run?.alreadyRunning
      }))
    );
    expect(first.body.run.id).toBe(second.body.run.id);
    expect(await prisma.gitHubSyncRun.count({ where: { projectId: project.id } })).toBe(
      runsBefore + 1
    );
    expect(await githubNotificationsOf(participant)).toHaveLength(1);
  });
});

function readStoredJsonFiles(zip) {
  const files = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const filenameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + filenameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + filenameLength).toString('utf8');
    files[name] = JSON.parse(zip.subarray(contentStart, contentStart + size).toString('utf8'));
    offset = contentStart + size;
  }
  return files;
}

function parseBinary(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('S2-03 bateria — bloco D pela API', () => {
  it('EV-D-01 exportação: campos do GitHub só nos tipos novos e ocultas com visible false', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const owner = await register(projectA.id);
    await join(projectB.id, owner.user.id);
    const visible = await storedNotification(owner, projectA.id);
    const hidden = await storedNotification(owner, projectB.id);
    const forged = await storedNotification(owner, projectA.id, {
      artifactUrl: 'javascript:alert(1)'
    });
    sequence += 1;
    const status = await prisma.notification.create({
      data: {
        recipientUserId: owner.user.id,
        projectId: projectA.id,
        type: 'TASK_STATUS_CHANGED',
        dedupeKey: `TASK_STATUS_CHANGED:movement:${900000 + sequence}`,
        taskTitle: 'Tarefa do S2-02',
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO'
      }
    });
    await prisma.projectMembership.updateMany({
      where: { projectId: projectB.id, userId: owner.user.id },
      data: { isActive: false }
    });

    const exported = await owner
      .mutate('post', '/api/settings/privacy/export')
      .buffer(true)
      .parse(parseBinary)
      .send({});

    expect(exported.status).toBe(200);
    const items = new Map(
      readStoredJsonFiles(exported.body)['notifications.json'].map((item) => [item.id, item])
    );
    expect(items.get(visible.id)).toMatchObject({ visible: true, githubEvent: 'ISSUE_CLOSED' });
    expect(items.get(hidden.id)).toMatchObject({ visible: false, githubEvent: 'ISSUE_CLOSED' });
    expect(Object.keys(items.get(status.id))).not.toContain('githubEvent');
    expect(Object.keys(items.get(status.id))).not.toContain('artifactUrl');
    observe('EV-D-01 URL forjada na exportação', items.get(forged.id).artifactUrl);
  });
});
