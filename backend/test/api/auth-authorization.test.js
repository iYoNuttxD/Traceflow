import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
const password = 'SenhaSegura123';
const projectBody = (name = 'Projeto') => ({
  name,
  responsibleTeam: 'Equipe',
  githubOwner: 'fake-owner',
  githubRepo: name.toLowerCase().replace(/\s/g, '-'),
  githubUrl: `https://github.com/fake-owner/${name.toLowerCase().replace(/\s/g, '-')}`
});
beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, name = 'Pessoa artificial') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  const csrf = response.body.csrfToken;
  return {
    agent,
    response,
    csrf,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

describe('identidade, sessão, CSRF e autorização E6', () => {
  it('registra, cria cookie seguro e restaura /me sem expor hash', async () => {
    const { agent, response } = await register('owner@example.invalid');
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie'][0]).toMatch(
      /traceflow_session=.*HttpOnly.*SameSite=Lax/i
    );
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('owner@example.invalid');
  });

  it('usa erro genérico no login e bloqueia conta desativada', async () => {
    await register('login@example.invalid');
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'login@example.invalid', password: 'errada' })
      ).body.message
    ).toBe('E-mail ou senha inválidos.');
    await prisma.user.update({
      where: { email: 'login@example.invalid' },
      data: { isActive: false }
    });
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ email: 'login@example.invalid', password })
      ).status
    ).toBe(403);
  });

  it('exige CSRF e invalida a sessão no logout', async () => {
    const auth = await register('csrf@example.invalid');
    expect((await auth.agent.post('/api/projects').send({})).body.code).toBe('CSRF_INVALID');
    expect((await auth.mutate('post', '/api/auth/logout')).status).toBe(204);
    expect((await auth.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('cria OWNER atomicamente, filtra listagem e bloqueia BOLA', async () => {
    const owner = await register('owner@example.invalid', 'Owner');
    const project = (
      await owner.mutate('post', '/api/projects').send(projectBody('Projeto protegido'))
    ).body.project;
    const ownerUser = await prisma.user.findUnique({ where: { email: 'owner@example.invalid' } });
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: ownerUser.id } }
      })
    ).toMatchObject({ role: 'OWNER' });
    const outsider = await register('outsider@example.invalid', 'Outsider');
    expect((await outsider.agent.get(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await outsider.agent.get('/api/projects')).body.projects).toHaveLength(0);
  });

  it('permite leitura a VIEWER e nega escrita com 403', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody())).body.project;
    const viewer = await register('viewer@example.invalid');
    const viewerUser = await prisma.user.findUnique({ where: { email: 'viewer@example.invalid' } });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: viewerUser.id, role: 'VIEWER' }
    });
    expect((await viewer.agent.get(`/api/projects/${project.id}`)).status).toBe(200);
    expect(
      (await viewer.mutate('put', `/api/projects/${project.id}`).send({ name: 'Negado' })).status
    ).toBe(403);
  });

  it('aceita convite uma vez, exige e-mail correspondente e rejeita reuso', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody())).body.project;
    const created = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'member@example.invalid', role: 'MEMBER' });
    const member = await register('member@example.invalid');
    expect(
      (
        await member
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: created.body.token })
      ).status
    ).toBe(200);
    expect(
      (
        await member
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: created.body.token })
      ).body.code
    ).toBe('INVITATION_INVALID');
  });

  it('administra memberships canônicas, minimiza e-mail e impede MEMBER de administrar', async () => {
    const owner = await register('owner@example.invalid', 'Owner');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Memberships')))
      .body.project;
    const member = await register('member@example.invalid', 'Member');
    const memberUser = await prisma.user.findUnique({ where: { email: 'member@example.invalid' } });
    const membership = await prisma.projectMembership.create({
      data: { projectId: project.id, userId: memberUser.id, role: 'MEMBER' }
    });
    const ownerList = await owner.agent.get(`/api/projects/${project.id}/members`);
    expect(ownerList.body.currentMembership.role).toBe('OWNER');
    expect(ownerList.body.members.find(({ id }) => id === membership.id).user.email).toBe(
      'member@example.invalid'
    );
    const memberList = await member.agent.get(`/api/projects/${project.id}/members`);
    expect(memberList.body.members.find(({ id }) => id === membership.id).user.email).toMatch(
      /^m\*\*\*@/
    );
    expect(
      (
        await member
          .mutate('patch', `/api/projects/${project.id}/members/${membership.id}`)
          .send({ role: 'MANAGER' })
      ).status
    ).toBe(403);
    expect(
      (
        await owner
          .mutate('patch', `/api/projects/${project.id}/members/${membership.id}`)
          .send({ role: 'MANAGER' })
      ).body.membership.role
    ).toBe('MANAGER');
    expect(
      (await owner.mutate('delete', `/api/projects/${project.id}/members/${membership.id}`)).status
    ).toBe(204);
    expect(
      (
        await owner
          .mutate('post', `/api/projects/${project.id}/members/${membership.id}/reactivate`)
          .send({})
      ).body.membership.isActive
    ).toBe(true);
  });

  it('protege o último OWNER, permite transferência e saída lógica', async () => {
    const owner = await register('owner@example.invalid', 'Owner');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Ownership')))
      .body.project;
    await register('member@example.invalid', 'Member');
    const user = await prisma.user.findUnique({ where: { email: 'member@example.invalid' } });
    const target = await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: 'MEMBER' }
    });
    const blocked = await owner.mutate('delete', `/api/projects/${project.id}/members/me`).send({});
    expect(blocked).toMatchObject({ status: 409, body: { code: 'LAST_PROJECT_OWNER' } });
    expect(
      (
        await owner
          .mutate('post', `/api/projects/${project.id}/ownership/transfer`)
          .send({ membershipId: target.id })
      ).body.membership.role
    ).toBe('OWNER');
    expect(
      (await owner.mutate('delete', `/api/projects/${project.id}/members/me`).send({})).status
    ).toBe(204);
    expect(
      (
        await prisma.projectMembership.findFirst({
          where: { projectId: project.id, userId: user.id }
        })
      ).isActive
    ).toBe(true);
  });

  it('substitui convite ativo duplicado e invalida o token anterior', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Invites'))).body
      .project;
    const first = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'MEMBER' });
    const second = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'VIEWER' });
    const invitee = await register('invitee@example.invalid');
    expect(
      (
        await invitee
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: first.body.token })
      ).status
    ).toBe(400);
    expect(
      (
        await invitee
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: second.body.token })
      ).body.membership.role
    ).toBe('VIEWER');
  });

  it('aplica a matriz efetiva a MANAGER, MEMBER, VIEWER e membership inativa', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Papeis'))).body
      .project;
    const manager = await register('manager@example.invalid');
    const member = await register('member@example.invalid');
    const viewer = await register('viewer@example.invalid');
    for (const [email, role] of [
      ['manager@example.invalid', 'MANAGER'],
      ['member@example.invalid', 'MEMBER'],
      ['viewer@example.invalid', 'VIEWER']
    ]) {
      const user = await prisma.user.findUnique({ where: { email } });
      await prisma.projectMembership.create({
        data: { projectId: project.id, userId: user.id, role }
      });
    }
    expect(
      (
        await manager
          .mutate('post', `/api/projects/${project.id}/requirements`)
          .send({ title: 'Requisito do manager' })
      ).status
    ).toBe(201);
    expect(
      (
        await member
          .mutate('post', `/api/projects/${project.id}/tasks`)
          .send({ title: 'Tarefa do member' })
      ).status
    ).toBe(201);
    expect((await viewer.agent.get(`/api/projects/${project.id}/tasks`)).status).toBe(200);
    expect(
      (await viewer.mutate('post', `/api/projects/${project.id}/tasks`).send({ title: 'Negada' }))
        .status
    ).toBe(403);
    const managerUser = await prisma.user.findUnique({
      where: { email: 'manager@example.invalid' }
    });
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: managerUser.id } },
      data: { isActive: false }
    });
    expect((await manager.agent.get(`/api/projects/${project.id}`)).status).toBe(404);
  });

  it('aplica VIEWER+ às perspectivas e MEMBER+ ao vínculo atômico da E10', async () => {
    const owner = await register('trace-owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Trace E10')))
      .body.project;
    const requirement = (
      await owner
        .mutate('post', `/api/projects/${project.id}/requirements`)
        .send({ title: 'RF E10' })
    ).body.requirement;
    const task = (
      await owner.mutate('post', `/api/projects/${project.id}/tasks`).send({ title: 'Task E10' })
    ).body.task;
    const viewer = await register('trace-viewer@example.invalid');
    const viewerUser = await prisma.user.findUnique({
      where: { email: 'trace-viewer@example.invalid' }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: viewerUser.id, role: 'VIEWER' }
    });
    const outsider = await register('trace-outsider@example.invalid');

    expect(
      (await viewer.agent.get(`/api/projects/${project.id}/traceability/tasks/${task.id}`)).status
    ).toBe(200);
    expect((await viewer.agent.get(`/api/projects/${project.id}/tasks/history`)).status).toBe(200);
    expect(
      (
        await viewer
          .mutate('patch', `/api/tasks/${task.id}/move`)
          .send({ toStatus: 'EM_ANDAMENTO' })
      ).status
    ).toBe(403);
    expect(
      (
        await viewer
          .mutate('put', `/api/requirements/${requirement.id}/tasks`)
          .send({ taskIds: [task.id] })
      ).status
    ).toBe(403);
    expect(
      (await outsider.agent.get(`/api/projects/${project.id}/traceability/tasks/${task.id}`)).status
    ).toBe(404);
    expect((await outsider.agent.get(`/api/projects/${project.id}/tasks/history`)).status).toBe(
      404
    );
    expect(
      (
        await owner
          .mutate('put', `/api/requirements/${requirement.id}/tasks`)
          .send({ taskIds: [task.id] })
      ).status
    ).toBe(200);
  });

  it('recuperação é uniforme e token é de uso único', async () => {
    await register('reset@example.invalid');
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'missing@example.invalid' });
    const existing = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@example.invalid' });
    expect(missing.body.message).toBe(existing.body.message);
    expect(
      (
        await request(app)
          .post('/api/auth/reset-password')
          .send({ token: existing.body.testToken, password: 'NovaSenhaSegura123' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/reset-password')
          .send({ token: existing.body.testToken, password: 'OutraSenhaSegura123' })
      ).status
    ).toBe(400);
  });

  it('mantém placeholder privado: 401 sem sessão e 501 autenticado', async () => {
    expect((await request(app).delete('/api/projects/1')).status).toBe(401);
    const auth = await register('placeholder@example.invalid');
    expect((await auth.mutate('delete', '/api/projects/1')).status).toBe(501);
  });
});
