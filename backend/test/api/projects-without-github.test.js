import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const github = vi.hoisted(() => ({ forInstallation: vi.fn() }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: github
}));

let app;
let prisma;
let owner;
let projectRepository;
const basicData = { name: 'Projeto local', responsibleTeam: 'Equipe local' };

async function register(suffix, verified = true) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa ${suffix}`,
    username: `local_${suffix}`,
    email: `${suffix}@example.invalid`,
    password: 'SenhaArtificial123!'
  });
  expect(response.status).toBe(201);
  if (verified) {
    const verification = await request(app).post('/api/auth/email-verification/verify').send({
      token: response.body.emailVerification.testToken
    });
    expect(verification.status).toBe(200);
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function createLocalProject() {
  const response = await owner.mutate('post', '/api/projects').send(basicData);
  expect(response.status).toBe(201);
  expect(response.body.project.githubIntegration).toBeNull();
  return response.body.project;
}

beforeAll(async () => {
  const target = configureTestDatabaseEnvironment();
  deployTestMigrations(target);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ projectRepository } = await import('../../src/modules/projects/project.repository.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
});

beforeEach(async () => {
  await cleanTestDatabase(prisma);
  vi.clearAllMocks();
  github.forInstallation.mockImplementation(() => {
    throw new Error('Projeto local não pode consultar o GitHub.');
  });
  owner = await register('owner');
});

afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

describe('GITHUB-01 — projeto sem integração', () => {
  it('persiste dados básicos e OWNER sem App, identidade GitHub ou integração fictícia', async () => {
    const created = await owner.mutate('post', '/api/projects').send({
      ...basicData,
      name: '  Projeto local  ',
      description: '  Acompanhamento local  '
    });
    expect(created.status).toBe(201);
    const project = created.body.project;
    expect(project).toMatchObject({
      ...basicData,
      description: 'Acompanhamento local',
      status: 'ATIVO',
      githubIntegration: null
    });
    expect(project).not.toHaveProperty('accessCode');
    const stored = await prisma.project.findUnique({
      where: { id: project.id },
      include: { memberships: true, githubIntegration: true }
    });
    expect(stored.githubIntegration).toBeNull();
    expect(stored.memberships).toEqual([
      expect.objectContaining({ userId: owner.user.id, role: 'OWNER', isActive: true })
    ]);
    expect(await prisma.projectGitHubIntegration.count()).toBe(0);
    expect(await prisma.gitHubInstallation.count()).toBe(0);
    expect(await prisma.gitHubIdentity.count()).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { projectId: project.id, action: 'PROJECT_CREATED' } })
    ).toBe(1);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('mantém listagem, detalhe, edição, Requirements, Tasks e recuperação locais', async () => {
    const project = await createLocalProject();
    const path = `/api/projects/${project.id}`;
    const listed = await owner.agent.get('/api/projects');
    expect(listed.body.projects).toEqual([
      expect.objectContaining({ id: project.id, githubIntegration: null })
    ]);
    const detail = await owner.agent.get(path);
    expect(detail.status).toBe(200);
    expect(detail.body.project.githubIntegration).toBeNull();
    const edited = await owner
      .mutate('put', path)
      .send({ name: 'Projeto editado', description: 'Local' });
    expect(edited.status).toBe(200);
    expect(edited.body.project).toMatchObject({ name: 'Projeto editado', githubIntegration: null });
    const requirement = await owner
      .mutate('post', `${path}/requirements`)
      .send({ title: 'RF local' });
    expect(requirement.status).toBe(201);
    const task = await owner
      .mutate('post', `${path}/tasks`)
      .send({ title: 'Task local', requirementId: requirement.body.requirement.id });
    expect(task.status).toBe(201);
    expect((await owner.agent.get(`${path}/requirements`)).status).toBe(200);
    expect((await owner.agent.get(`${path}/tasks`)).status).toBe(200);
    expect((await owner.mutate('delete', path).send({})).status).toBe(200);
    expect((await owner.agent.get(path)).status).toBe(404);
    const deleted = await owner.agent.get('/api/projects');
    expect(deleted.body.projects).toEqual([]);
    expect(deleted.body.deletedProjects).toEqual([expect.objectContaining({ id: project.id })]);
    expect((await owner.mutate('post', `${path}/restore`).send({})).status).toBe(200);
    expect((await owner.agent.get(path)).body.project.githubIntegration).toBeNull();
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, userId: owner.user.id, role: 'OWNER', isActive: true }
      })
    ).toBe(1);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('bloqueia sync/configuração GitHub sem integração e consulta artefatos vazios sem falha', async () => {
    const project = await createLocalProject();
    const path = `/api/projects/${project.id}`;
    const artifacts = await owner.agent.get(`${path}/artifacts`);
    expect(artifacts.status).toBe(200);
    expect(artifacts.body).toMatchObject({
      artifacts: [],
      repository: { defaultBranch: null, branches: [] },
      summary: { total: 0 }
    });
    const status = await owner.agent.get(`${path}/github/sync/status`);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      run: null,
      automation: {
        status: 'UNAVAILABLE',
        reason: 'WORKER_NOT_OBSERVED',
        nextSyncAt: null,
        lastHeartbeatAt: null,
        checkedAt: expect.any(String)
      }
    });
    expect((await owner.mutate('post', `${path}/github/sync`).send({})).status).toBe(400);
    expect(
      (
        await owner
          .mutate('patch', `${path}/github/sync-settings`)
          .send({ githubAutoSyncEnabled: true })
      ).status
    ).toBe(400);
    expect(await prisma.gitHubSyncRun.count()).toBe(0);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('preserva NO_DATA/UNASSESSED e ausência de stale no projeto vazio', async () => {
    const project = await createLocalProject();
    const dashboard = await owner.agent.get(
      `/api/projects/${project.id}/indicators/dashboard?view=GENERAL`
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.projectHealth).toMatchObject({ score: null, status: 'UNASSESSED' });
    expect(dashboard.body.freshness.github).toBeNull();
    const indicators = dashboard.body.sections.flatMap((section) => section.indicators);
    expect(indicators.length).toBeGreaterThan(0);
    expect(indicators.every((indicator) => indicator.state !== 'STALE')).toBe(true);
    expect(indicators.find((indicator) => indicator.metricId === 'I45')).toMatchObject({
      state: 'NO_DATA',
      value: null
    });
    expect(
      indicators
        .filter((indicator) => indicator.state === 'NO_DATA')
        .every((indicator) => indicator.value === null)
    ).toBe(true);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it.each(['/api/projects', '/api/projects/from-github'])(
    'preserva sessão, verificação e CSRF em %s',
    async (path) => {
      const body = path.endsWith('from-github')
        ? { githubInstallationId: '77', githubRepositoryId: '501' }
        : basicData;
      expect((await request(app).post(path).send(body)).status).toBe(401);
      expect((await owner.agent.post(path).send(body)).status).toBe(403);
      const unverified = await register('unverified', false);
      const denied = await unverified.mutate('post', path).send(body);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(await prisma.project.count()).toBe(0);
      expect(github.forInstallation).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { name: '' },
    { name: '   ' },
    { name: 12 },
    { name: 'a'.repeat(256) },
    { name: 'Projeto', responsibleTeam: '' },
    { name: 'Projeto', responsibleTeam: '   ' },
    { ...basicData, status: 'AGUARDANDO_INTEGRACAO' },
    { ...basicData, githubRepositoryId: '' },
    { ...basicData, githubIntegration: null }
  ])('rejeita payload inválido sem persistência: %j', async (body) => {
    const response = await owner.mutate('post', '/api/projects').send(body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.projectMembership.count()).toBe(0);
  });

  it('reverte Project se a membership inicial não puder ser criada', async () => {
    await expect(
      projectRepository.createProject(
        { ...basicData, accessCode: 'ROLLBACK-LOCAL-01' },
        owner.user.id + 1000000
      )
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.projectMembership.count()).toBe(0);
  });

  it('preserva isolamento entre projetos e edição exclusiva de OWNER', async () => {
    const project = await createLocalProject();
    const other = await register('other');
    const path = `/api/projects/${project.id}`;
    expect((await other.agent.get('/api/projects')).body.projects).toEqual([]);
    for (const route of [
      path,
      `${path}/members`,
      `${path}/requirements`,
      `${path}/tasks`,
      `${path}/artifacts`
    ]) {
      expect((await other.agent.get(route)).status).toBe(404);
    }
    expect((await other.mutate('put', path).send({ name: 'Intrusão' })).status).toBe(404);
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: other.user.id, role: 'VIEWER' }
    });
    expect((await other.agent.get(path)).status).toBe(200);
    expect((await other.mutate('put', path).send({ name: 'Intrusão' })).status).toBe(403);
    expect((await owner.agent.get(path)).body.project.name).toBe(basicData.name);
  });
});
