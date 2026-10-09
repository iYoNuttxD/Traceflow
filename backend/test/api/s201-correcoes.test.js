import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

const githubBoundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => githubBoundary.client }
}));

let app;
let prisma;
let githubAppService;
let alertService;
let alertRepository;
let sequence = 0;
const password = 'SenhaSegura123';
const CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const AFTER = new Date('2026-08-10T09:30:00.000Z');
const TITLE_256 = `${'x'.repeat(255)}\u{1F600}`;
const LONG_BRANCH = `feature/${'b'.repeat(292)}`;
const COMMIT_URL = `https://github.com/${'o'.repeat(39)}/${'r'.repeat(100)}/commit/${'a'.repeat(40)}`;

const repository = {
  githubRepositoryId: '9401',
  name: 'repositorio-correcoes',
  owner: 'usuario-correcoes',
  fullName: 'usuario-correcoes/repositorio-correcoes',
  url: 'https://github.com/usuario-correcoes/repositorio-correcoes',
  defaultBranch: 'trunk',
  private: true,
  description: 'Repositório artificial das correções'
};

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubAppService } = await import('../../src/modules/github/github-app.service.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ traceabilityAlertRepository: alertRepository } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);
beforeEach(() => vi.restoreAllMocks());
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(role, projectId) {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa das correções ${sequence}`,
    username: `s201cor${sequence}`,
    email: `s201-correcoes-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function* pages(...values) {
  for (const value of values) yield value;
}

function githubDouble({ branches, commitsByBranch = {}, pullRequests = [], issues = [] }) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listRepositoryPages: vi.fn(() => pages([repository])),
    listBranchPages: vi.fn(() => pages(branches)),
    listCommitPages: vi.fn(({ branch }) => pages(commitsByBranch[branch] || [])),
    listPullRequestPages: vi.fn(() => pages(pullRequests)),
    listIssuePages: vi.fn(() => pages(issues))
  };
}

async function connectRepository(owner, projectId) {
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '78',
      accountId: '780',
      accountLogin: 'usuario-correcoes',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  vi.spyOn(githubAppService, 'resolveAuthorizedRepository').mockResolvedValue({
    installation,
    repository
  });
  vi.spyOn(githubAppService, 'assertRepositoryAvailable').mockResolvedValue(null);
  return owner
    .mutate('put', `/api/projects/${projectId}/github/integration`)
    .send({ githubInstallationId: '78', githubRepositoryId: repository.githubRepositoryId });
}

async function syncAndWait(owner, projectId) {
  const afterSync = vi.spyOn(alertService, 'reconcileAfterSync');
  const started = await owner.mutate('post', `/api/projects/${projectId}/github/sync`).send({});
  expect(started.status, JSON.stringify(started.body)).toBe(202);
  await vi.waitFor(() => expect(afterSync.mock.results.length).toBe(1), {
    timeout: 10000,
    interval: 10
  });
  await afterSync.mock.results[0].value;
  return (await owner.agent.get(`/api/projects/${projectId}/github/sync/status`)).body.run;
}

describe('Correções S2-01 — campos do GitHub no limite (S201-A03)', () => {
  it('C1-01 sync com textos no limite do GitHub termina SUCCEEDED, grava tudo e gera os alertas', async () => {
    const project = await createProject(prisma, { createdAt: CREATED_AT });
    const owner = await register('OWNER', project.id);
    expect((await connectRepository(owner, project.id)).status).toBe(200);
    githubBoundary.client = githubDouble({
      branches: [
        { name: 'trunk', headSha: null },
        { name: LONG_BRANCH, headSha: null }
      ],
      commitsByBranch: {
        trunk: [
          {
            hash: 'c'.repeat(40),
            message: 'Commit com autor de nome longo',
            authorName: 'A'.repeat(255),
            authorEmail: `${'e'.repeat(239)}@example.invalid`,
            authorUsername: 'autor-longo',
            date: AFTER,
            githubUrl: COMMIT_URL
          }
        ]
      },
      pullRequests: [
        {
          githubId: 'pr-correcoes-1',
          number: 1,
          title: TITLE_256,
          state: 'closed',
          sourceBranch: LONG_BRANCH,
          targetBranch: 'trunk',
          githubUrl: 'https://github.com/usuario-correcoes/repositorio-correcoes/pull/1',
          mergedAtGithub: AFTER,
          closedAtGithub: AFTER
        },
        {
          githubId: 'pr-correcoes-2',
          number: 2,
          title: 'PR de título comum',
          state: 'closed',
          targetBranch: 'trunk',
          mergedAtGithub: AFTER,
          closedAtGithub: AFTER
        }
      ],
      issues: [
        {
          githubId: 'issue-correcoes-3',
          number: 3,
          title: TITLE_256,
          state: 'closed',
          closedAtGithub: AFTER,
          milestone: 'm'.repeat(255),
          labels: []
        }
      ]
    });

    const run = await syncAndWait(owner, project.id);

    expect(run.status, JSON.stringify(run.error)).toBe('SUCCEEDED');
    const longPullRequest = await prisma.pullRequest.findFirst({
      where: { projectId: project.id, number: 1 }
    });
    expect(longPullRequest).toMatchObject({ title: TITLE_256, sourceBranch: LONG_BRANCH });
    expect(await prisma.pullRequest.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      (await prisma.issue.findFirst({ where: { projectId: project.id } })).milestone
    ).toHaveLength(255);
    expect(await prisma.commit.findFirst({ where: { projectId: project.id } })).toMatchObject({
      authorName: 'A'.repeat(255),
      githubUrl: COMMIT_URL
    });
    expect(
      await prisma.gitBranch.count({ where: { projectId: project.id, name: LONG_BRANCH } })
    ).toBe(1);
    const alerts = await prisma.traceabilityAlert.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' }
    });
    expect(alerts.map((alert) => alert.subjectCode).sort()).toEqual(
      ['Issue #3', 'PR #1', 'PR #2'].sort()
    );
    expect(alerts.find((alert) => alert.subjectCode === 'PR #1').subjectTitle).toBe(TITLE_256);
  });
});

describe('Correções S2-01 — reconciliar ao conectar o repositório (S201-A01)', () => {
  const base = (projectId) => `/api/projects/${projectId}/traceability`;

  async function concludedTask(owner, projectId) {
    const created = await owner
      .mutate('post', `/api/projects/${projectId}/tasks`)
      .send({ title: 'Concluída antes da conexão' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const moved = await owner
      .mutate('patch', `/api/tasks/${created.body.task.id}/status`)
      .send({ status: 'CONCLUIDO' });
    expect(moved.status).toBe(200);
    return created.body.task;
  }

  it('C2-01 conectar o repositório gera o alerta da tarefa já concluída sem commit (AT-T-09)', async () => {
    const project = await createProject(prisma);
    const owner = await register('OWNER', project.id);
    const task = await concludedTask(owner, project.id);
    expect((await owner.agent.get(`${base(project.id)}/alerts/summary`)).body.open.total).toBe(0);

    expect((await connectRepository(owner, project.id)).status).toBe(200);

    const summary = (await owner.agent.get(`${base(project.id)}/alerts/summary`)).body;
    expect(summary.rules.taskWithoutCommitActive).toBe(true);
    expect(summary.open.total).toBe(1);
    const list = (await owner.agent.get(`${base(project.id)}/alerts`)).body;
    expect(list.alerts[0].subject).toMatchObject({ type: 'TASK', id: task.id });
  });

  it('C2-02 falha na reconciliação ao conectar não desfaz a conexão', async () => {
    const project = await createProject(prisma);
    const owner = await register('OWNER', project.id);
    await concludedTask(owner, project.id);
    vi.spyOn(alertRepository, 'reconcileProject').mockRejectedValueOnce(
      Object.assign(new Error('falha injetada'), { code: 'P2034' })
    );

    const connected = await connectRepository(owner, project.id);

    expect(connected.status, JSON.stringify(connected.body)).toBe(200);
    expect(await prisma.projectGitHubIntegration.count({ where: { projectId: project.id } })).toBe(
      1
    );
    expect((await owner.agent.get(`${base(project.id)}/alerts/summary`)).body.open.total).toBe(0);
    const recovered = await owner.mutate('post', `${base(project.id)}/alerts/reconcile`).send({});
    expect(recovered.body.result.created).toBe(1);
  });
});
