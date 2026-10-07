import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const githubBoundary = vi.hoisted(() => ({
  client: null,
  installation: null,
  resolveAuthorizedRepository: vi.fn(),
  assertRepositoryAvailable: vi.fn()
}));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: {
    forInstallation: () => githubBoundary.client
  }
}));
vi.mock('../../src/modules/github/github-app.service.js', () => ({
  githubAppService: {
    resolveAuthorizedRepository: githubBoundary.resolveAuthorizedRepository,
    assertRepositoryAvailable: githubBoundary.assertRepositoryAvailable
  }
}));

let app;
let prisma;
let alertService;
let reconcileSpy;
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const AFTER_CUTOFF = new Date('2026-08-10T09:30:00.000Z');
const BEFORE_CUTOFF = new Date('2026-07-31T09:30:00.000Z');
const repository = {
  githubRepositoryId: '9201',
  name: 'repositorio-s201',
  owner: 'usuario-s201',
  fullName: 'usuario-s201/repositorio-s201',
  url: 'https://github.com/usuario-s201/repositorio-s201',
  defaultBranch: 'trunk',
  private: true,
  description: 'Repositório artificial S2-01'
};

async function* pages(...values) {
  for (const value of values) yield value;
}

function githubDouble({ pullRequests = [], issues = [] } = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listRepositoryPages: vi.fn(() => pages([repository])),
    listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: null }])),
    listCommitPages: vi.fn(() => pages([])),
    listPullRequestPages: vi.fn(() => pages(pullRequests)),
    listIssuePages: vi.fn(() => pages(issues))
  };
}

const mergedPullRequest = (number, mergedAtGithub) => ({
  githubId: `pr-s201-${number}`,
  number,
  title: `PR mesclada ${number}`,
  state: 'closed',
  targetBranch: 'trunk',
  mergedAtGithub,
  closedAtGithub: mergedAtGithub
});

const githubIssue = (number, state, closedAtGithub) => ({
  githubId: `issue-s201-${number}`,
  number,
  title: `Issue ${number}`,
  state,
  closedAtGithub,
  labels: []
});

async function register(email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa S2-01',
    username: `u${email.split('@')[0].replace(/[^a-z0-9]/g, '')}`,
    email,
    password: 'SenhaSegura123'
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function integratedProject(owner) {
  const response = await owner.mutate('post', '/api/projects/from-github').send({
    githubInstallationId: '77',
    githubRepositoryId: repository.githubRepositoryId,
    name: 'Projeto S2-01',
    responsibleTeam: 'Equipe S2-01'
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await prisma.project.update({
    where: { id: response.body.project.id },
    data: { createdAt: PROJECT_CREATED_AT }
  });
  return response.body.project;
}

async function syncAndReconcile(owner, projectId) {
  const calls = reconcileSpy.mock.calls.length;
  const started = await owner.mutate('post', `/api/projects/${projectId}/github/sync`).send({});
  expect(started.status, JSON.stringify(started.body)).toBe(202);
  await vi.waitFor(() => expect(reconcileSpy.mock.results.length).toBeGreaterThan(calls), {
    timeout: 10000,
    interval: 5
  });
  const reconciliation = await reconcileSpy.mock.results[calls].value;
  const status = await owner.agent.get(`/api/projects/${projectId}/github/sync/status`);
  return { reconciliation, run: status.body.run };
}

function alertsOf(projectId) {
  return prisma.traceabilityAlert.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
}

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
});

beforeEach(async () => {
  await cleanTestDatabase(prisma);
  vi.clearAllMocks();
  reconcileSpy = vi.spyOn(alertService, 'reconcileAfterSync');
  githubBoundary.installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'usuario-s201',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  githubBoundary.resolveAuthorizedRepository.mockImplementation(async () => ({
    installation: githubBoundary.installation,
    repository
  }));
  githubBoundary.assertRepositoryAvailable.mockResolvedValue(null);
});

afterEach(async () => {
  reconcileSpy.mockRestore();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('S2-01 gatilho de alertas no fim da sincronização GitHub', () => {
  it('I9 o sync alerta PR mesclada e issue fechada sem tarefa e não duplica no segundo sync', async () => {
    const owner = await register('owner-s201-sync@example.invalid');
    const project = await integratedProject(owner);
    githubBoundary.client = githubDouble({
      pullRequests: [
        mergedPullRequest(1, AFTER_CUTOFF),
        { ...mergedPullRequest(2, null), closedAtGithub: AFTER_CUTOFF }
      ],
      issues: [githubIssue(3, 'closed', AFTER_CUTOFF), githubIssue(4, 'open', null)]
    });

    const first = await syncAndReconcile(owner, project.id);
    const second = await syncAndReconcile(owner, project.id);

    expect(first.run.status).toBe('SUCCEEDED');
    expect(first.reconciliation).toEqual({ created: 2, resolved: 0, kept: 0 });
    expect(second.reconciliation).toEqual({ created: 0, resolved: 0, kept: 2 });
    expect(
      (await alertsOf(project.id)).map((row) => [row.type, row.subjectCode, row.status]).sort()
    ).toEqual([
      ['ISSUE_CLOSED_WITHOUT_TASK', 'Issue #3', 'OPEN'],
      ['PULL_REQUEST_MERGED_WITHOUT_TASK', 'PR #1', 'OPEN']
    ]);
  });

  it('I10 artefatos encerrados antes da criação do projeto não geram alerta', async () => {
    const owner = await register('owner-s201-cutoff@example.invalid');
    const project = await integratedProject(owner);
    githubBoundary.client = githubDouble({
      pullRequests: [mergedPullRequest(1, BEFORE_CUTOFF)],
      issues: [githubIssue(2, 'closed', BEFORE_CUTOFF)]
    });

    const { reconciliation } = await syncAndReconcile(owner, project.id);

    expect(reconciliation).toEqual({ created: 0, resolved: 0, kept: 0 });
    expect(await alertsOf(project.id)).toEqual([]);
  });

  it('I11 issue reaberta no GitHub resolve o alerta no sync seguinte', async () => {
    const owner = await register('owner-s201-reopen@example.invalid');
    const project = await integratedProject(owner);
    githubBoundary.client = githubDouble({ issues: [githubIssue(5, 'closed', AFTER_CUTOFF)] });
    await syncAndReconcile(owner, project.id);

    githubBoundary.client = githubDouble({ issues: [githubIssue(5, 'open', null)] });
    const { reconciliation } = await syncAndReconcile(owner, project.id);

    expect(reconciliation).toEqual({ created: 0, resolved: 1, kept: 0 });
    expect(await alertsOf(project.id)).toEqual([
      expect.objectContaining({ status: 'RESOLVED', resolutionReason: 'ISSUE_REOPENED' })
    ]);
  });
});
