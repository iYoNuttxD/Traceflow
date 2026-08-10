import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { ERROR_CODES, ExternalServiceError } from '../../src/shared/errors/index.js';

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
const password = 'SenhaSegura123';
const repository = {
  githubRepositoryId: '9001',
  name: 'repositorio-e9',
  owner: 'usuario-e9',
  fullName: 'usuario-e9/repositorio-e9',
  url: 'https://github.com/usuario-e9/repositorio-e9',
  defaultBranch: 'trunk',
  private: true,
  description: 'Repositório artificial E9'
};
const repositoryFor = (id, suffix) => ({
  ...repository,
  githubRepositoryId: String(id),
  name: `repositorio-${suffix}`,
  fullName: `usuario-e9/repositorio-${suffix}`,
  url: `https://github.com/usuario-e9/repositorio-${suffix}`
});

async function* pages(...values) {
  for (const value of values) yield value;
}

function createGithubDouble({
  branches = [[{ name: 'trunk', headSha: null }]],
  commits = [[]],
  pullRequests = [[]],
  issues = [[]]
} = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listRepositoryPages: vi.fn(() => pages([repository])),
    listBranchPages: vi.fn(() => pages(...branches)),
    listCommitPages: vi.fn(() => pages(...commits)),
    listPullRequestPages: vi.fn(() => pages(...pullRequests)),
    listIssuePages: vi.fn(() => pages(...issues))
  };
}

async function register(email, name = 'Pessoa E9') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name,
    username: `u${email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 29)}`,
    email,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const verification = await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  expect(verification.status, JSON.stringify(verification.body)).toBe(200);
  const session = await agent.get('/api/auth/me');
  expect(session.status, JSON.stringify(session.body)).toBe(200);
  const csrf = response.body.csrfToken;
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

async function createIntegratedProject(auth) {
  const response = await auth.mutate('post', '/api/projects/from-github').send({
    githubInstallationId: '77',
    githubRepositoryId: repository.githubRepositoryId,
    name: 'Projeto E9',
    responsibleTeam: 'Equipe E9'
  });
  expect(response.status).toBe(201);
  return response.body.project;
}

async function startAndWaitForSync(auth, projectId) {
  const started = await auth.mutate('post', `/api/projects/${projectId}/github/sync`).send({});
  expect(started.status, JSON.stringify(started.body)).toBe(202);

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await auth.agent.get(`/api/projects/${projectId}/github/sync/status`);
    expect(status.status, JSON.stringify(status.body)).toBe(200);
    if (['SUCCEEDED', 'FAILED'].includes(status.body.run?.status)) {
      return { started, status, run: status.body.run };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(`A execução GitHub do projeto ${projectId} não chegou a um estado terminal.`);
}

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
});

beforeEach(async () => {
  await cleanTestDatabase(prisma);
  vi.clearAllMocks();
  githubBoundary.client = createGithubDouble();
  githubBoundary.installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'usuario-e9',
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

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('Projetos e integração GitHub E9', () => {
  it('reutiliza uma instalação em três projetos com repositórios diferentes', async () => {
    const owner = await register('owner-multiple@example.invalid');
    const repositories = [
      repositoryFor(9101, 'a'),
      repositoryFor(9102, 'b'),
      repositoryFor(9103, 'c')
    ];
    githubBoundary.resolveAuthorizedRepository.mockImplementation(
      async (_userId, _installationId, repositoryId) => ({
        installation: githubBoundary.installation,
        repository: repositories.find(
          (candidate) => candidate.githubRepositoryId === String(repositoryId)
        )
      })
    );

    const projects = [];
    for (const [index, candidate] of repositories.entries()) {
      const response = await owner.mutate('post', '/api/projects/from-github').send({
        githubInstallationId: '77',
        githubRepositoryId: candidate.githubRepositoryId,
        name: `Projeto múltiplo ${index + 1}`,
        responsibleTeam: 'Equipe múltipla'
      });
      expect(response.status).toBe(201);
      projects.push(response.body.project);
    }

    const integrations = await prisma.projectGitHubIntegration.findMany({
      where: { installationId: githubBoundary.installation.id },
      orderBy: { githubRepositoryId: 'asc' }
    });
    expect(integrations).toHaveLength(3);
    expect(new Set(integrations.map(({ projectId }) => projectId)).size).toBe(3);
    expect(new Set(integrations.map(({ githubRepositoryId }) => githubRepositoryId)).size).toBe(3);

    githubBoundary.client = createGithubDouble();
    githubBoundary.client.getRepository.mockImplementation(async (ownerName, repositoryName) =>
      repositories.find(
        (candidate) => candidate.owner === ownerName && candidate.name === repositoryName
      )
    );
    for (const project of projects) {
      expect((await startAndWaitForSync(owner, project.id)).run.status).toBe('SUCCEEDED');
    }
  }, 15000);

  it('preserva cadastro comum e usa revalidação externa no cadastro GitHub', async () => {
    const owner = await register('owner-e9@example.invalid');
    const common = await owner.mutate('post', '/api/projects').send({
      name: 'Projeto comum',
      responsibleTeam: 'Equipe'
    });
    expect(common).toMatchObject({
      status: 201,
      body: { message: 'Projeto cadastrado com sucesso.' }
    });

    const project = await createIntegratedProject(owner);
    expect(githubBoundary.resolveAuthorizedRepository).toHaveBeenCalledWith(
      owner.user.id,
      '77',
      repository.githubRepositoryId
    );
    expect(project).toMatchObject({
      githubRepositoryId: repository.githubRepositoryId,
      githubRepositoryFullName: repository.fullName,
      githubDefaultBranch: 'trunk'
    });
    expect(
      await prisma.projectMembership.findFirst({ where: { projectId: project.id, role: 'OWNER' } })
    ).not.toBeNull();

    const repositoryChange = await owner.mutate('put', `/api/projects/${project.id}`).send({
      githubOwner: 'outro',
      githubRepo: 'outro',
      githubUrl: 'https://github.com/outro/outro'
    });
    expect(repositoryChange).toMatchObject({
      status: 400,
      body: {
        message: 'O repositório integrado não pode ser alterado pela edição comum do projeto.'
      }
    });

    const duplicate = await owner.mutate('post', '/api/projects/from-github').send({
      githubInstallationId: '77',
      githubRepositoryId: repository.githubRepositoryId
    });
    expect(duplicate.status).toBe(409);
  });

  it('preserva autenticação, papéis e isolamento por projeto no sync', async () => {
    const owner = await register('owner-roles@example.invalid');
    const project = await createIntegratedProject(owner);
    expect((await request(app).post(`/api/projects/${project.id}/github/sync`)).status).toBe(401);

    for (const role of ['VIEWER', 'MEMBER', 'MANAGER']) {
      const auth = await register(`${role.toLowerCase()}@example.invalid`, role);
      await prisma.projectMembership.create({
        data: { projectId: project.id, userId: auth.user.id, role }
      });
      const response = await auth
        .mutate('post', `/api/projects/${project.id}/github/sync`)
        .send({});
      expect(response.status).toBe(role === 'MANAGER' ? 202 : 403);
      if (role === 'MANAGER') {
        expect((await startAndWaitForSync(auth, project.id)).run.status).toBe('SUCCEEDED');
      }
    }

    const outsider = await register('outsider-e9@example.invalid');
    expect(
      (await outsider.mutate('post', `/api/projects/${project.id + 9999}/github/sync`).send({}))
        .status
    ).toBe(404);
    expect((await startAndWaitForSync(owner, project.id)).run.status).toBe('SUCCEEDED');
  }, 30000);

  it('pagina, reprocessa sem duplicar e preserva vínculos e artifacts canônicos', async () => {
    const owner = await register('owner-sync@example.invalid');
    const project = await createIntegratedProject(owner);
    const integratedAt = new Date(project.githubIntegratedAt);
    const existingPr = await prisma.pullRequest.create({
      data: {
        projectId: project.id,
        githubId: 'pr-existing',
        number: 10,
        title: 'Título antigo',
        targetBranch: 'trunk'
      }
    });
    const existingIssue = await prisma.issue.create({
      data: {
        projectId: project.id,
        githubId: 'issue-existing',
        number: 20,
        title: 'Issue antiga',
        labels: []
      }
    });
    const task = await prisma.task.create({
      data: { projectId: project.id, title: 'Task E9', pullRequestId: existingPr.id }
    });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: existingIssue.id } });

    githubBoundary.client = createGithubDouble({
      commits: [
        [
          {
            hash: 'commit-1',
            message: `Primeiro [TASK-${task.id}]`,
            branch: 'trunk',
            date: new Date('2026-01-01')
          }
        ],
        [{ hash: 'commit-2', message: 'Segundo', branch: 'trunk', date: new Date('2026-01-02') }]
      ],
      pullRequests: [
        [
          { githubId: 'pr-existing', number: 10, title: 'Título atualizado', targetBranch: 'trunk' }
        ],
        [{ githubId: 'pr-new', number: 11, title: 'Nova PR', targetBranch: 'trunk' }]
      ],
      issues: [
        [{ githubId: 'issue-existing', number: 20, title: 'Issue atualizada', labels: [] }],
        [{ githubId: 'issue-new', number: 21, title: 'Issue nova', labels: [] }]
      ]
    });

    const first = await startAndWaitForSync(owner, project.id);
    expect(first.run).toMatchObject({
      status: 'SUCCEEDED',
      summary: {
        branches: { found: 1, active: 1 },
        commits: { found: 2, created: 2 },
        pullRequests: { found: 2, created: 1, updated: 1 },
        issues: { found: 2, created: 1, updated: 1 }
      }
    });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      await prisma.taskCommitSuggestion.count({
        where: { projectId: project.id, taskId: task.id, status: 'PENDING' }
      })
    ).toBe(1);
    expect((await prisma.pullRequest.findUnique({ where: { id: existingPr.id } })).title).toBe(
      'Título atualizado'
    );
    expect((await prisma.task.findUnique({ where: { id: task.id } })).pullRequestId).toBe(
      existingPr.id
    );
    expect(
      await prisma.taskIssue.count({ where: { taskId: task.id, issueId: existingIssue.id } })
    ).toBe(1);

    const second = await startAndWaitForSync(owner, project.id);
    expect(second.run.summary.commits).toMatchObject({ found: 2, created: 0 });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      await prisma.taskCommitSuggestion.count({ where: { projectId: project.id, taskId: task.id } })
    ).toBe(1);
    expect(
      (await prisma.project.findUnique({ where: { id: project.id } })).githubIntegratedAt
    ).toEqual(integratedAt);

    const artifacts = await owner.agent.get(
      `/api/projects/${project.id}/artifacts?type=commit&startDate=2026-01-01&endDate=2026-01-02`
    );
    expect(artifacts).toMatchObject({
      status: 200,
      body: { summary: { commits: 2, pullRequests: 0, issues: 0 } }
    });
  });

  it('mantém uma execução ativa por projeto no banco e expira execução abandonada', async () => {
    const owner = await register('owner-exclusive@example.invalid');
    const project = await createIntegratedProject(owner);
    const { getProjectGithubSyncStatus, requestProjectGithubSync, GITHUB_SYNC_STALE_AFTER_MS } =
      await import('../../src/modules/github/services/github-sync-run.service.js');
    const schedule = vi.fn();
    const createdAt = new Date('2026-08-10T12:00:00.000Z');

    const first = await requestProjectGithubSync(project.id, owner.user.id, {
      schedule,
      now: createdAt
    });
    const repeated = await requestProjectGithubSync(project.id, owner.user.id, {
      schedule,
      now: createdAt
    });

    expect(first).toMatchObject({ status: 'QUEUED', alreadyRunning: false });
    expect(repeated).toMatchObject({ id: first.id, status: 'QUEUED', alreadyRunning: true });
    expect(schedule).toHaveBeenCalledOnce();
    expect(
      await prisma.gitHubSyncRun.count({
        where: { projectId: project.id, activeProjectId: project.id }
      })
    ).toBe(1);

    await prisma.gitHubSyncRun.update({
      where: { id: first.id },
      data: { updatedAt: createdAt }
    });
    const status = await getProjectGithubSyncStatus(project.id, {
      now: new Date(createdAt.getTime() + GITHUB_SYNC_STALE_AFTER_MS + 1)
    });

    expect(status).toMatchObject({
      id: first.id,
      status: 'FAILED',
      error: {
        code: 'GITHUB_SYNC_STALE',
        message: 'A execução foi interrompida antes da conclusão.'
      }
    });
    expect(
      await prisma.gitHubSyncRun.count({
        where: { projectId: project.id, activeProjectId: project.id }
      })
    ).toBe(0);
  });

  it('mantém lote persistido, último sucesso e auditoria quando uma coleção posterior falha', async () => {
    const owner = await register('owner-partial@example.invalid');
    const project = await createIntegratedProject(owner);
    const previousSuccess = new Date('2026-01-01T00:00:00.000Z');
    await prisma.project.update({
      where: { id: project.id },
      data: { githubLastSyncAt: previousSuccess, githubSyncStatus: 'SINCRONIZADO' }
    });
    const failure = new ExternalServiceError(
      'Falha de conexão com o GitHub.',
      500,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR
    );
    githubBoundary.client = createGithubDouble({
      commits: [[{ hash: 'commit-parcial', branch: 'trunk' }]]
    });
    githubBoundary.client.listPullRequestPages.mockReturnValue(
      (async function* fail() {
        throw failure;
      })()
    );

    const response = await startAndWaitForSync(owner, project.id);
    expect(response.run).toMatchObject({
      status: 'FAILED',
      step: 'PULL_REQUESTS',
      error: { message: 'Falha de conexão com o GitHub.' }
    });
    expect(
      await prisma.commit.count({ where: { projectId: project.id, hash: 'commit-parcial' } })
    ).toBe(1);
    const failedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(failedProject.githubSyncStatus).toBe('FALHA');
    expect(failedProject.githubLastSyncAt).toEqual(previousSuccess);
    expect(failedProject.githubLastSyncError).toBe('Falha de conexão com o GitHub.');
    const actions = await prisma.auditEvent.findMany({
      where: { projectId: project.id },
      select: { action: true }
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['GITHUB_SYNC_REQUESTED', 'GITHUB_SYNC_FAILED'])
    );
  });
});
