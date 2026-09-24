import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let projectDeletionService;
const password = 'SenhaSegura123';

async function register(email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa artificial',
    username: email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 30),
    email,
    password
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    agent,
    user: response.body.user,
    csrf: response.body.csrfToken,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function createProject(owner, name = 'Projeto descartável') {
  const response = await owner.mutate('post', '/api/projects').send({
    name,
    responsibleTeam: 'Equipe artificial'
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.project;
}

async function addMember(projectId, auth, role) {
  return prisma.projectMembership.create({
    data: { projectId, userId: auth.user.id, role }
  });
}

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ projectDeletionService } =
    await import('../../src/modules/projects/services/project-deletion.service.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('exclusão de projeto com retenção de 30 dias', () => {
  it('aplica autenticação, CSRF, OWNER-only e 404 opaco', async () => {
    const owner = await register('project-delete-owner@example.invalid');
    const manager = await register('project-delete-manager@example.invalid');
    const member = await register('project-delete-member@example.invalid');
    const viewer = await register('project-delete-viewer@example.invalid');
    const outsider = await register('project-delete-outsider@example.invalid');
    const project = await createProject(owner);
    await addMember(project.id, manager, 'MANAGER');
    await addMember(project.id, member, 'MEMBER');
    await addMember(project.id, viewer, 'VIEWER');

    expect((await request(app).delete(`/api/projects/${project.id}`).send({})).status).toBe(401);
    expect(await owner.agent.delete(`/api/projects/${project.id}`).send({})).toMatchObject({
      status: 403,
      body: { code: 'CSRF_INVALID' }
    });
    for (const auth of [manager, member, viewer]) {
      expect(await auth.mutate('delete', `/api/projects/${project.id}`).send({})).toMatchObject({
        status: 403,
        body: { code: 'FORBIDDEN' }
      });
    }
    expect(await outsider.mutate('delete', `/api/projects/${project.id}`).send({})).toMatchObject({
      status: 404,
      body: { code: 'RESOURCE_NOT_FOUND' }
    });
  });

  it('preserva filhos e memberships, revoga convites e bloqueia todo acesso normal', async () => {
    const owner = await register('project-retention-owner@example.invalid');
    const member = await register('project-retention-member@example.invalid');
    const project = await createProject(owner, 'Retenção completa');
    await addMember(project.id, member, 'MEMBER');
    const requirement = await prisma.requirement.create({
      data: { projectId: project.id, title: 'Requisito preservado' }
    });
    const task = await prisma.task.create({
      data: { projectId: project.id, requirementId: requirement.id, title: 'Tarefa preservada' }
    });
    const invitation = await prisma.projectInvitation.create({
      data: {
        projectId: project.id,
        email: 'invitee@example.invalid',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: owner.user.id
      }
    });
    const before = Date.now();
    const deleted = await owner.mutate('delete', `/api/projects/${project.id}`).send({});
    const after = Date.now();

    expect(deleted).toMatchObject({
      status: 200,
      body: { project: { projectId: project.id, projectName: 'Retenção completa' } }
    });
    const stored = await prisma.project.findUnique({ where: { id: project.id } });
    expect(stored.deletedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.deletionScheduledFor.getTime() - stored.deletedAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000
    );
    expect(stored.deletionScheduledFor.getTime()).toBeLessThanOrEqual(
      after + 30 * 24 * 60 * 60 * 1000
    );
    expect(await prisma.requirement.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.projectMembership.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      await prisma.projectInvitation.findUnique({ where: { id: invitation.id } })
    ).toMatchObject({ revokedAt: expect.any(Date), acceptedAt: null });

    for (const path of [
      `/api/projects/${project.id}`,
      `/api/projects/${project.id}/tasks`,
      `/api/tasks/${task.id}`,
      `/api/projects/${project.id}/sprints`,
      `/api/projects/${project.id}/schedule`,
      `/api/projects/${project.id}/test-cases`,
      `/api/projects/${project.id}/defects`,
      `/api/projects/${project.id}/artifacts`,
      `/api/projects/${project.id}/traceability/requirements`,
      `/api/projects/${project.id}/github/sync/status`
    ]) {
      expect((await owner.agent.get(path)).status, path).toBe(404);
    }

    expect(await owner.agent.get('/api/projects')).toMatchObject({
      status: 200,
      body: {
        projects: [],
        deletedProjects: [expect.objectContaining({ id: project.id })]
      }
    });
    expect(await member.agent.get('/api/projects')).toMatchObject({
      status: 200,
      body: { projects: [], deletedProjects: [] }
    });
  });

  it('recupera somente por OWNER antes do prazo e não reativa convites', async () => {
    const owner = await register('project-restore-owner@example.invalid');
    const member = await register('project-restore-member@example.invalid');
    const outsider = await register('project-restore-outsider@example.invalid');
    const project = await createProject(owner, 'Projeto recuperável');
    await addMember(project.id, member, 'MEMBER');
    const invitation = await prisma.projectInvitation.create({
      data: {
        projectId: project.id,
        email: 'recover@example.invalid',
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: owner.user.id
      }
    });
    await owner.mutate('delete', `/api/projects/${project.id}`).send({});

    expect(
      await member.mutate('post', `/api/projects/${project.id}/restore`).send({})
    ).toMatchObject({
      status: 403,
      body: { code: 'PROJECT_RESTORE_FORBIDDEN' }
    });
    expect(
      await outsider.mutate('post', `/api/projects/${project.id}/restore`).send({})
    ).toMatchObject({ status: 404 });

    expect(
      await owner.mutate('post', `/api/projects/${project.id}/restore`).send({})
    ).toMatchObject({
      status: 200,
      body: { project: { id: project.id } }
    });
    expect((await owner.agent.get(`/api/projects/${project.id}`)).status).toBe(200);
    expect(
      await prisma.projectInvitation.findUnique({ where: { id: invitation.id } })
    ).toMatchObject({ revokedAt: expect.any(Date), acceptedAt: null });
  });

  it('recusa restore expirado', async () => {
    const owner = await register('project-expired-owner@example.invalid');
    const project = await createProject(owner, 'Projeto expirado');
    await owner.mutate('delete', `/api/projects/${project.id}`).send({});
    await prisma.project.update({
      where: { id: project.id },
      data: { deletionScheduledFor: new Date(Date.now() - 1) }
    });
    expect(
      await owner.mutate('post', `/api/projects/${project.id}/restore`).send({})
    ).toMatchObject({ status: 404 });
  });

  it('exige confirmação forte, remove o grafo e libera o repositório', async () => {
    const owner = await register('project-purge-owner@example.invalid');
    const project = await createProject(owner, 'Projeto para zerar');
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: '991',
        accountId: '91',
        accountLogin: 'purge-owner',
        accountType: 'User',
        status: 'ACTIVE',
        installedAt: new Date()
      }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        installationId: installation.id,
        githubRepositoryId: 'repo-reserved-1',
        repositoryName: 'repo',
        repositoryFullName: 'owner/repo'
      }
    });
    await prisma.task.create({ data: { projectId: project.id, title: 'Tarefa a remover' } });
    await owner.mutate('delete', `/api/projects/${project.id}`).send({});

    expect(
      await owner
        .mutate('delete', `/api/projects/${project.id}/permanent`)
        .send({ confirmationName: 'nome errado' })
    ).toMatchObject({
      status: 400,
      body: { code: 'PROJECT_DELETION_CONFIRMATION_INVALID' }
    });
    expect(
      await owner
        .mutate('delete', `/api/projects/${project.id}/permanent`)
        .send({ confirmationName: 'Projeto para zerar' })
    ).toMatchObject({ status: 200, body: { cleanupPending: false } });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);

    const replacement = await createProject(owner, 'Projeto novo');
    await expect(
      prisma.projectGitHubIntegration.create({
        data: {
          projectId: replacement.id,
          installationId: installation.id,
          githubRepositoryId: 'repo-reserved-1',
          repositoryName: 'repo',
          repositoryFullName: 'owner/repo'
        }
      })
    ).resolves.toMatchObject({ projectId: replacement.id });
  });

  it('purga somente após o instante agendado com relógio explícito', async () => {
    const owner = await register('project-job-owner@example.invalid');
    const project = await createProject(owner, 'Projeto do job');
    const deletedAt = new Date('2026-09-21T12:00:00.000Z');
    const scheduledFor = new Date('2026-10-21T12:00:00.000Z');
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt, deletionScheduledFor: scheduledFor, deletedById: owner.user.id }
    });

    expect(
      await projectDeletionService.processDue({
        now: new Date(scheduledFor.getTime() - 1),
        dryRun: false
      })
    ).toMatchObject({ count: 0, processed: 0 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();

    expect(
      await projectDeletionService.processDue({ now: scheduledFor, dryRun: false })
    ).toMatchObject({ count: 1, processed: 1, failed: 0 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
  });

  it('serializa deletes concorrentes e restore versus purge sem duplicar efeitos', async () => {
    const owner = await register('project-race-owner@example.invalid');
    const project = await createProject(owner, 'Projeto concorrente');
    const deletes = await Promise.all([
      owner.mutate('delete', `/api/projects/${project.id}`).send({}),
      owner.mutate('delete', `/api/projects/${project.id}`).send({})
    ]);
    expect(deletes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(deletes.every(({ status }) => [200, 404, 409].includes(status))).toBe(true);

    const outcomes = await Promise.all([
      owner.mutate('post', `/api/projects/${project.id}/restore`).send({}),
      owner
        .mutate('delete', `/api/projects/${project.id}/permanent`)
        .send({ confirmationName: 'Projeto concorrente' })
    ]);
    expect(outcomes.filter(({ status }) => status === 200)).toHaveLength(1);
    expect(outcomes.every(({ status }) => [200, 404, 409].includes(status))).toBe(true);
  });
});
