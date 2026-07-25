import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';

let app; let prisma;
const password = 'SenhaSegura123';
beforeAll(async () => {
  const url = configureTestDatabaseEnvironment(); deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js')); ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => { await cleanTestDatabase(prisma); await prisma.$disconnect(); });

async function register(email = 'privacy@example.invalid') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name: 'Pessoa artificial', email, password });
  return { agent, csrf: response.body.csrfToken, mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken) };
}

describe('direitos do titular e auditoria E7', () => {
  it('consulta dados próprios sem hashes, atualiza perfil e lista sessões minimizadas', async () => {
    const auth = await register();
    const data = await auth.agent.get('/api/account/personal-data');
    expect(data.status).toBe(200);
    expect(JSON.stringify(data.body)).not.toMatch(/passwordHash|tokenHash|csrfTokenHash/);
    const updated = await auth.mutate('patch', '/api/account/profile').send({ name: 'Nome atualizado', email: 'updated@example.invalid', currentPassword: password });
    expect(updated).toMatchObject({ status: 200, body: { user: { name: 'Nome atualizado', email: 'updated@example.invalid' } } });
    const sessions = await auth.agent.get('/api/account/sessions');
    expect(sessions.body.sessions[0]).toMatchObject({ current: true });
    expect(sessions.body.sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('gera exportação privada, impede acesso cruzado e expira com 410', async () => {
    const owner = await register('export@example.invalid');
    const outsider = await register('outside@example.invalid');
    const created = await owner.mutate('post', '/api/account/personal-data/export').send({});
    const id = created.body.export.id;
    expect(created.status).toBe(202);
    expect((await outsider.agent.get(`/api/account/personal-data/export/${id}`)).status).toBe(404);
    expect((await owner.agent.get(`/api/account/personal-data/export/${id}/download`)).body.data.email).toBe('export@example.invalid');
    await prisma.personalDataExport.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await owner.agent.get(`/api/account/personal-data/export/${id}/download`)).status).toBe(410);
  });

  it('registra e restringe auditoria de projeto ao OWNER', async () => {
    const owner = await register('owner@example.invalid');
    const member = await register('member@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send({ name: 'Projeto auditado', responsibleTeam: 'Equipe', githubOwner: 'fake-owner', githubRepo: 'audit', githubUrl: 'https://github.com/fake-owner/audit' })).body.project;
    const memberUser = await prisma.user.findUnique({ where: { email: 'member@example.invalid' } });
    const membership = await prisma.projectMembership.create({ data: { projectId: project.id, userId: memberUser.id, role: 'MEMBER' } });
    await owner.mutate('patch', `/api/projects/${project.id}/members/${membership.id}`).send({ role: 'MANAGER' });
    const events = await owner.agent.get(`/api/projects/${project.id}/audit-events`);
    expect(events.body.events).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'PROJECT_MEMBER_ROLE_CHANGED' })]));
    expect((await member.agent.get(`/api/projects/${project.id}/audit-events`)).status).toBe(403);
  });

  it('protege último owner e permite solicitar/cancelar exclusão sem projeto', async () => {
    const owner = await register('last-owner@example.invalid');
    await owner.mutate('post', '/api/projects').send({ name: 'Projeto protegido', responsibleTeam: 'Equipe', githubOwner: 'fake-owner', githubRepo: 'protected', githubUrl: 'https://github.com/fake-owner/protected' });
    expect((await owner.mutate('post', '/api/account/deactivate').send({ password })).body.code).toBe('LAST_PROJECT_OWNER');
    const plain = await register('delete@example.invalid');
    expect((await plain.mutate('post', '/api/account/deletion-request').send({ password })).status).toBe(202);
    expect((await plain.agent.get('/api/account/deletion-request')).body.request.status).toBe('PENDING');
    expect((await plain.mutate('delete', '/api/account/deletion-request')).status).toBe(200);
  });

  it('revoga somente sessões próprias e desativa conta com auditoria atômica', async () => {
    const auth = await register('deactivate@example.invalid');
    const other = await register('other@example.invalid');
    const otherSession = (await other.agent.get('/api/account/sessions')).body.sessions[0];
    expect((await auth.mutate('delete', `/api/account/sessions/${otherSession.id}`)).status).toBe(404);
    expect((await auth.mutate('post', '/api/account/deactivate').send({ password })).status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: 'deactivate@example.invalid' } });
    expect(user.isActive).toBe(false);
    expect(await prisma.auditEvent.findFirst({ where: { actorUserId: user.id, action: 'ACCOUNT_DEACTIVATED' } })).toBeTruthy();
  });

  it('reverte alteração crítica quando a auditoria obrigatória falha', async () => {
    const owner = await register('atomic-owner@example.invalid');
    const member = await register('atomic-member@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send({ name: 'Projeto atômico', responsibleTeam: 'Equipe', githubOwner: 'fake-owner', githubRepo: 'atomic', githubUrl: 'https://github.com/fake-owner/atomic' })).body.project;
    const user = await prisma.user.findUnique({ where: { email: 'atomic-member@example.invalid' } });
    const membership = await prisma.projectMembership.create({ data: { projectId: project.id, userId: user.id, role: 'MEMBER' } });
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const failure = vi.spyOn(auditRepository, 'create').mockRejectedValueOnce(new Error('controlled audit failure'));
    expect((await owner.mutate('patch', `/api/projects/${project.id}/members/${membership.id}`).send({ role: 'MANAGER' })).status).toBe(500);
    expect((await prisma.projectMembership.findUnique({ where: { id: membership.id } })).role).toBe('MEMBER');
    failure.mockRestore();
  });

  it('anonimiza conta elegível preservando IDs e removendo credenciais', async () => {
    const auth = await register('anonymize@example.invalid');
    const user = await prisma.user.findUnique({ where: { email: 'anonymize@example.invalid' } });
    await prisma.privacyRequest.create({ data: { userId: user.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date(Date.now() - 1000) } });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({ processed: 1 });
    const anonymized = await prisma.user.findUnique({ where: { id: user.id } });
    expect(anonymized).toMatchObject({ name: 'Usuário anonimizado', passwordHash: null, isActive: false });
    expect(anonymized.email).toMatch(/^anon-.+@anonymous\.invalid$/);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.auditEvent.findFirst({ where: { actorUserId: user.id, action: 'ACCOUNT_ANONYMIZED' } })).toBeTruthy();
    void auth;
  });
});
