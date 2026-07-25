import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';

let app; let prisma;
const password = 'SenhaSegura123';
const projectBody = (name = 'Projeto') => ({ name, responsibleTeam: 'Equipe', githubOwner: 'fake-owner', githubRepo: name.toLowerCase().replace(/\s/g, '-'), githubUrl: `https://github.com/fake-owner/${name.toLowerCase().replace(/\s/g, '-')}` });
beforeAll(async () => {
  const url = configureTestDatabaseEnvironment(); deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js')); ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => { await cleanTestDatabase(prisma); await prisma.$disconnect(); });

async function register(email, name = 'Pessoa artificial') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  const csrf = response.body.csrfToken;
  return { agent, response, csrf, mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf) };
}

describe('identidade, sessão, CSRF e autorização E6', () => {
  it('registra, cria cookie seguro e restaura /me sem expor hash', async () => {
    const { agent, response } = await register('owner@example.invalid');
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie'][0]).toMatch(/traceflow_session=.*HttpOnly.*SameSite=Lax/i);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('owner@example.invalid');
  });

  it('usa erro genérico no login e bloqueia conta desativada', async () => {
    await register('login@example.invalid');
    expect((await request(app).post('/api/auth/login').send({ email: 'login@example.invalid', password: 'errada' })).body.message).toBe('E-mail ou senha inválidos.');
    await prisma.user.update({ where: { email: 'login@example.invalid' }, data: { isActive: false } });
    expect((await request(app).post('/api/auth/login').send({ email: 'login@example.invalid', password })).status).toBe(403);
  });

  it('exige CSRF e invalida a sessão no logout', async () => {
    const auth = await register('csrf@example.invalid');
    expect((await auth.agent.post('/api/projects').send({})).body.code).toBe('CSRF_INVALID');
    expect((await auth.mutate('post', '/api/auth/logout')).status).toBe(204);
    expect((await auth.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('cria OWNER atomicamente, filtra listagem e bloqueia BOLA', async () => {
    const owner = await register('owner@example.invalid', 'Owner');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Projeto protegido'))).body.project;
    const ownerUser = await prisma.user.findUnique({ where: { email: 'owner@example.invalid' } });
    expect(await prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId: project.id, userId: ownerUser.id } } })).toMatchObject({ role: 'OWNER' });
    const outsider = await register('outsider@example.invalid', 'Outsider');
    expect((await outsider.agent.get(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await outsider.agent.get('/api/projects')).body.projects).toHaveLength(0);
  });

  it('permite leitura a VIEWER e nega escrita com 403', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody())).body.project;
    const viewer = await register('viewer@example.invalid');
    const viewerUser = await prisma.user.findUnique({ where: { email: 'viewer@example.invalid' } });
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: viewerUser.id, role: 'VIEWER' } });
    expect((await viewer.agent.get(`/api/projects/${project.id}`)).status).toBe(200);
    expect((await viewer.mutate('put', `/api/projects/${project.id}`).send({ name: 'Negado' })).status).toBe(403);
  });

  it('aceita convite uma vez, exige e-mail correspondente e rejeita reuso', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody())).body.project;
    const created = await owner.mutate('post', `/api/projects/${project.id}/invitations`).send({ email: 'member@example.invalid', role: 'MEMBER' });
    const member = await register('member@example.invalid');
    expect((await member.mutate('post', '/api/projects/invitations/accept').send({ token: created.body.token })).status).toBe(200);
    expect((await member.mutate('post', '/api/projects/invitations/accept').send({ token: created.body.token })).body.code).toBe('INVITATION_INVALID');
  });

  it('recuperação é uniforme e token é de uso único', async () => {
    await register('reset@example.invalid');
    const missing = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@example.invalid' });
    const existing = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.invalid' });
    expect(missing.body.message).toBe(existing.body.message);
    expect((await request(app).post('/api/auth/reset-password').send({ token: existing.body.testToken, password: 'NovaSenhaSegura123' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token: existing.body.testToken, password: 'OutraSenhaSegura123' })).status).toBe(400);
  });

  it('mantém placeholder privado: 401 sem sessão e 501 autenticado', async () => {
    expect((await request(app).delete('/api/projects/1')).status).toBe(401);
    const auth = await register('placeholder@example.invalid');
    expect((await auth.mutate('delete', '/api/projects/1')).status).toBe(501);
  });
});
