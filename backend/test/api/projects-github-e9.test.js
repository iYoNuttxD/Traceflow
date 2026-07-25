import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';
import { ERROR_CODES, ExternalServiceError } from '../../src/shared/errors/index.js';

const githubBoundary = vi.hoisted(() => ({
  client: null,
  getGithubRepository: vi.fn(),
  checkGithubAuthentication: vi.fn()
}));

vi.mock('../../src/modules/github/github.client.js', () => ({
  getGithubClient: () => githubBoundary.client,
  getGithubRepository: githubBoundary.getGithubRepository,
  checkGithubAuthentication: githubBoundary.checkGithubAuthentication
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

async function* pages(...values) {
  for (const value of values) yield value;
}

function createGithubDouble({ commits = [[]], pullRequests = [[]], issues = [[]] } = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listRepositoryPages: vi.fn(() => pages([repository])),
    listCommitPages: vi.fn(() => pages(...commits)),
    listPullRequestPages: vi.fn(() => pages(...pullRequests)),
    listIssuePages: vi.fn(() => pages(...issues))
  };
}

async function register(email, name = 'Pessoa E9') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  const csrf = response.body.csrfToken;
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

async function createIntegratedProject(auth) {
  const response = await auth.mutate('post', '/api/projects/from-github').send({
    githubRepositoryId: repository.githubRepositoryId,
    githubOwner: repository.owner,
    githubRepositoryName: repository.name,
    githubRepositoryFullName: repository.fullName,
    githubRepositoryUrl: repository.url,
    githubDefaultBranch: repository.defaultBranch,
    name: 'Projeto E9',
    responsibleTeam: 'Equipe E9'
  });
  expect(response.status).toBe(201);
  return response.body.project;
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
  githubBoundary.getGithubRepository.mockResolvedValue(repository);
  githubBoundary.client = createGithubDouble();
});

afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => { await cleanTestDatabase(prisma); await prisma.$disconnect(); });

describe('Projetos e integração GitHub E9', () => {
  it('preserva cadastro comum e usa revalidação externa no cadastro GitHub', async () => {
    const owner = await register('owner-e9@example.invalid');
    const common = await owner.mutate('post', '/api/projects').send({
      name: 'Projeto comum', responsibleTeam: 'Equipe', githubOwner: 'fake-owner',
      githubRepo: 'fake-repo', githubUrl: 'https://github.com/fake-owner/fake-repo'
    });
    expect(common).toMatchObject({ status: 201, body: { message: 'Projeto cadastrado com sucesso.' } });

    const project = await createIntegratedProject(owner);
    expect(githubBoundary.getGithubRepository).toHaveBeenCalledWith(repository.owner, repository.name);
    expect(project).toMatchObject({
      githubRepositoryId: repository.githubRepositoryId,
      githubRepositoryFullName: repository.fullName,
      githubDefaultBranch: 'trunk'
    });
    expect(await prisma.projectMembership.findFirst({ where: { projectId: project.id, role: 'OWNER' } }))
      .not.toBeNull();

    const repositoryChange = await owner.mutate('put', `/api/projects/${project.id}`).send({
      githubOwner: 'outro', githubRepo: 'outro', githubUrl: 'https://github.com/outro/outro'
    });
    expect(repositoryChange).toMatchObject({
      status: 400,
      body: { message: 'O repositório integrado não pode ser alterado pela edição comum do projeto.' }
    });

    const duplicate = await owner.mutate('post', '/api/projects/from-github').send({
      githubRepositoryId: repository.githubRepositoryId,
      githubOwner: repository.owner,
      githubRepositoryName: repository.name,
      githubRepositoryFullName: repository.fullName,
      githubRepositoryUrl: repository.url,
      githubDefaultBranch: repository.defaultBranch
    });
    expect(duplicate.status).toBe(409);
  });

  it('preserva autenticação, papéis e isolamento por projeto no sync', async () => {
    const owner = await register('owner-roles@example.invalid');
    const project = await createIntegratedProject(owner);
    expect((await request(app).post(`/api/projects/${project.id}/github/sync`)).status).toBe(401);

    for (const role of ['VIEWER', 'MEMBER', 'MANAGER']) {
      const auth = await register(`${role.toLowerCase()}@example.invalid`, role);
      await prisma.projectMembership.create({ data: { projectId: project.id, userId: auth.user.id, role } });
      const response = await auth.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
      expect(response.status).toBe(role === 'MANAGER' ? 200 : 403);
    }

    const outsider = await register('outsider-e9@example.invalid');
    expect((await outsider.mutate('post', `/api/projects/${project.id + 9999}/github/sync`).send({})).status)
      .toBe(404);
    expect((await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({})).status)
      .toBe(200);
  });

  it('pagina, reprocessa sem duplicar e preserva vínculos e artifacts canônicos', async () => {
    const owner = await register('owner-sync@example.invalid');
    const project = await createIntegratedProject(owner);
    const integratedAt = new Date(project.githubIntegratedAt);
    const existingPr = await prisma.pullRequest.create({
      data: { projectId: project.id, githubId: 'pr-existing', number: 10, title: 'Título antigo', targetBranch: 'trunk' }
    });
    const existingIssue = await prisma.issue.create({
      data: { projectId: project.id, githubId: 'issue-existing', number: 20, title: 'Issue antiga', labels: [] }
    });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Task E9', pullRequestId: existingPr.id } });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: existingIssue.id } });

    githubBoundary.client = createGithubDouble({
      commits: [[{ hash: 'commit-1', message: 'Primeiro', branch: 'trunk', date: new Date('2026-01-01') }], [{ hash: 'commit-2', message: 'Segundo', branch: 'trunk', date: new Date('2026-01-02') }]],
      pullRequests: [[{ githubId: 'pr-existing', number: 10, title: 'Título atualizado', targetBranch: 'trunk' }], [{ githubId: 'pr-new', number: 11, title: 'Nova PR', targetBranch: 'trunk' }]],
      issues: [[{ githubId: 'issue-existing', number: 20, title: 'Issue atualizada', labels: [] }], [{ githubId: 'issue-new', number: 21, title: 'Issue nova', labels: [] }]]
    });

    const first = await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    expect(first.status).toBe(200);
    expect(first.body.summary).toMatchObject({
      commits: { found: 2, created: 2, skipped: 0 },
      pullRequests: { found: 2, created: 1, updated: 1 },
      issues: { found: 2, created: 1, updated: 1 }
    });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(2);
    expect((await prisma.pullRequest.findUnique({ where: { id: existingPr.id } })).title).toBe('Título atualizado');
    expect((await prisma.task.findUnique({ where: { id: task.id } })).pullRequestId).toBe(existingPr.id);
    expect(await prisma.taskIssue.count({ where: { taskId: task.id, issueId: existingIssue.id } })).toBe(1);

    const second = await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    expect(second.body.summary.commits).toEqual({ found: 2, created: 0, skipped: 2 });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(2);
    expect((await prisma.project.findUnique({ where: { id: project.id } })).githubIntegratedAt)
      .toEqual(integratedAt);

    const artifacts = await owner.agent.get(`/api/projects/${project.id}/artifacts?type=commit&startDate=2026-01-01&endDate=2026-01-02`);
    expect(artifacts).toMatchObject({ status: 200, body: { summary: { commits: 2, pullRequests: 0, issues: 0 } } });
  });

  it('mantém lote persistido, último sucesso e auditoria quando uma coleção posterior falha', async () => {
    const owner = await register('owner-partial@example.invalid');
    const project = await createIntegratedProject(owner);
    const previousSuccess = new Date('2026-01-01T00:00:00.000Z');
    await prisma.project.update({ where: { id: project.id }, data: { githubLastSyncAt: previousSuccess, githubSyncStatus: 'SINCRONIZADO' } });
    const failure = new ExternalServiceError(
      'Falha de conexão com o GitHub.', 500, ERROR_CODES.EXTERNAL_SERVICE_ERROR
    );
    githubBoundary.client = createGithubDouble({ commits: [[{ hash: 'commit-parcial', branch: 'trunk' }]] });
    githubBoundary.client.listPullRequestPages.mockReturnValue((async function* fail() { throw failure; })());

    const response = await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    expect(response.status).toBe(500);
    expect(await prisma.commit.count({ where: { projectId: project.id, hash: 'commit-parcial' } })).toBe(1);
    const failedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(failedProject.githubSyncStatus).toBe('FALHA');
    expect(failedProject.githubLastSyncAt).toEqual(previousSuccess);
    expect(failedProject.githubLastSyncError).toBe('Falha de conexão com o GitHub.');
    const actions = await prisma.auditEvent.findMany({ where: { projectId: project.id }, select: { action: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining([
      'GITHUB_SYNC_REQUESTED', 'GITHUB_SYNC_FAILED'
    ]));
  });
});
