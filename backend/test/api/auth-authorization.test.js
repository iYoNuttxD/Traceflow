import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { ERROR_CODES } from '../../src/shared/errors/index.js';

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
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, name = 'Pessoa artificial') {
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
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
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

  it('normaliza username, bloqueia reservados e duplicados e autentica por username ou e-mail', async () => {
    const first = await register('identity@example.invalid', 'Identidade');
    expect(first.response.body.user.username).toBe('uidentity');
    expect(
      (
        await request(app).post('/api/auth/register').send({
          name: 'Reservado',
          username: 'ADMIN',
          email: 'reserved@example.invalid',
          password
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app).post('/api/auth/register').send({
          name: 'Duplicado',
          username: 'UIDENTITY',
          email: 'other@example.invalid',
          password
        })
      ).status
    ).toBe(409);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: 'UIDENTITY', password, rememberMe: false })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: 'identity@example.invalid', password, rememberMe: false })
      ).status
    ).toBe(200);
  });

  it('persiste a escolha de sessão e aplica TTL maior somente para rememberMe', async () => {
    await register('remember@example.invalid');
    const normal = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'uremember', password, rememberMe: false });
    const persistent = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'uremember', password, rememberMe: true });
    expect(normal.status).toBe(200);
    expect(persistent.status).toBe(200);
    const sessions = await prisma.session.findMany({
      where: { user: { email: 'remember@example.invalid' } },
      orderBy: { createdAt: 'asc' }
    });
    expect(sessions.some((session) => session.rememberMe === false)).toBe(true);
    const remembered = sessions.find((session) => session.rememberMe === true);
    const ordinary = sessions.find((session) => session.rememberMe === false);
    expect(remembered.expiresAt.getTime() - remembered.createdAt.getTime()).toBeGreaterThan(
      ordinary.expiresAt.getTime() - ordinary.createdAt.getTime()
    );
  });

  it('bloqueia ação sensível até verificar e-mail e rejeita reuso do token', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/register').send({
      name: 'E-mail pendente',
      username: 'email-pendente',
      email: 'pending@example.invalid',
      password
    });
    const csrf = response.body.csrfToken;
    expect(
      (await agent.post('/api/projects').set('X-CSRF-Token', csrf).send(projectBody('Bloqueado')))
        .body.code
    ).toBe('EMAIL_VERIFICATION_REQUIRED');
    const token = response.body.emailVerification.testToken;
    expect(
      (await request(app).post('/api/auth/email-verification/verify').send({ token })).status
    ).toBe(200);
    expect(
      (await request(app).post('/api/auth/email-verification/verify').send({ token })).status
    ).toBe(400);
    expect(
      (await agent.post('/api/projects').set('X-CSRF-Token', csrf).send(projectBody('Liberado')))
        .status
    ).toBe(201);
  });

  it('rejeita token de verificação expirado e permite reenvio autenticado', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/auth/register').send({
      name: 'Reenvio artificial',
      username: 'reenvio-artificial',
      email: 'resend@example.invalid',
      password
    });
    const user = await prisma.user.findUnique({ where: { email: 'resend@example.invalid' } });
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    expect(
      (
        await request(app)
          .post('/api/auth/email-verification/verify')
          .send({ token: response.body.emailVerification.testToken })
      ).status
    ).toBe(400);
    const resent = await agent
      .post('/api/auth/email-verification/resend')
      .set('X-CSRF-Token', response.body.csrfToken)
      .send({});
    expect(resent).toMatchObject({
      status: 200,
      body: { delivery: { status: 'accepted', testToken: expect.any(String) } }
    });
    expect(
      (
        await request(app)
          .post('/api/auth/email-verification/verify')
          .send({ token: resent.body.delivery.testToken })
      ).status
    ).toBe(200);
  });

  it('usa erro genérico no login e bloqueia conta desativada', async () => {
    await register('login@example.invalid');
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: 'login@example.invalid', password: 'errada', rememberMe: false })
      ).body.message
    ).toBe('Nome de usuário, e-mail ou senha inválidos.');
    await prisma.user.update({
      where: { email: 'login@example.invalid' },
      data: { isActive: false, accountStatus: 'DEACTIVATED' }
    });
    const restricted = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'ulogin', password, rememberMe: false });
    expect(restricted).toMatchObject({
      status: 200,
      body: { user: { accountStatus: 'DEACTIVATED' } }
    });
  });

  it('exige CSRF e invalida a sessão no logout', async () => {
    const auth = await register('csrf@example.invalid');
    expect((await auth.agent.post('/api/projects').send({})).body.code).toBe('CSRF_INVALID');
    expect((await auth.mutate('post', '/api/auth/logout')).status).toBe(204);
    expect((await auth.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('mantém CSRF estável por sessão quando três abas consultam o token', async () => {
    const auth = await register('csrf-tabs@example.invalid');
    const tabB = (await auth.agent.get('/api/auth/csrf')).body.csrfToken;
    const tabC = (await auth.agent.get('/api/auth/csrf')).body.csrfToken;
    expect(new Set([auth.csrf, tabB, tabC]).size).toBe(1);

    expect(
      (
        await auth.agent
          .patch('/api/auth/username')
          .set('X-CSRF-Token', auth.csrf)
          .send({ username: 'csrf_tab_a' })
      ).status
    ).toBe(200);
    expect(
      (
        await auth.agent
          .patch('/api/auth/username')
          .set('X-CSRF-Token', tabB)
          .send({ username: 'csrf_tab_b' })
      ).status
    ).toBe(200);
    expect(
      (await auth.agent.post('/api/auth/logout').set('X-CSRF-Token', tabC).send({})).status
    ).toBe(204);
  });

  it('recusa CSRF inválido, de outra sessão e após revogação', async () => {
    const first = await register('csrf-session@example.invalid');
    const second = request.agent(app);
    await second
      .post('/api/auth/login')
      .send({ identifier: 'csrf-session@example.invalid', password, rememberMe: false });

    expect(
      (await first.agent.post('/api/auth/logout').set('X-CSRF-Token', 'invalido').send({})).body
        .code
    ).toBe('CSRF_INVALID');
    expect(
      (await second.post('/api/auth/logout').set('X-CSRF-Token', first.csrf).send({})).body.code
    ).toBe('CSRF_INVALID');

    const session = await prisma.session.findFirst({
      where: { user: { email: 'csrf-session@example.invalid' }, revokedAt: null },
      orderBy: { id: 'asc' }
    });
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    expect(
      (await first.agent.post('/api/auth/logout').set('X-CSRF-Token', first.csrf).send({})).body
        .code
    ).toBe('AUTHENTICATION_REQUIRED');
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

  it('responde 404 determinístico para perspectivas de projeto inexistente', async () => {
    const user = await register('missing-project@example.invalid');
    const members = await user.agent.get('/api/projects/999999/members');
    expect(members).toMatchObject({
      status: 404,
      body: { code: ERROR_CODES.RESOURCE_NOT_FOUND }
    });

    for (const path of [
      '/api/projects/999999/invitations',
      '/api/projects/999999/audit-events',
      '/api/projects/999999/tasks',
      '/api/projects/999999/requirements',
      '/api/projects/999999/artifacts'
    ]) {
      const response = await user.agent.get(path);
      expect(response.status, path).toBe(404);
      expect(response.body).not.toHaveProperty('stack');
    }
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
    await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'MEMBER' });
    expect((await viewer.agent.get(`/api/projects/${project.id}/invitations`)).status).toBe(403);
  });

  it('aceita convite uma vez, exige e-mail correspondente e distingue reuso', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody())).body.project;
    const created = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'member@example.invalid', role: 'MEMBER' });
    const member = await register('member@example.invalid');
    const other = await register('other@example.invalid');
    expect(
      (
        await other
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: created.body.token })
      ).body.code
    ).toBe('INVITATION_INVALID');
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
    ).toBe('INVITATION_ALREADY_USED');
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

  it('bloqueia convite ativo duplicado e preserva o token anterior', async () => {
    const owner = await register('owner@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Invites'))).body
      .project;
    const first = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'MEMBER' });
    const second = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'VIEWER' });
    expect(second).toMatchObject({
      status: 409,
      body: { code: 'INVITATION_ALREADY_PENDING' }
    });
    const invitee = await register('invitee@example.invalid');
    expect(
      (
        await invitee
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: first.body.token })
      ).body.membership.role
    ).toBe('MEMBER');
  });

  it('torna invitationId e membershipId de outro projeto opacos e preserva os recursos', async () => {
    const ownerA = await register('owner-a-boundary@example.invalid');
    const ownerB = await register('owner-b-boundary@example.invalid');
    const projectA = (await ownerA.mutate('post', '/api/projects').send(projectBody('Boundary A')))
      .body.project;
    const projectB = (await ownerB.mutate('post', '/api/projects').send(projectBody('Boundary B')))
      .body.project;
    const invitationB = await ownerB
      .mutate('post', `/api/projects/${projectB.id}/invitations`)
      .send({ email: 'invitee-boundary@example.invalid', role: 'MEMBER' });
    const ownerBUser = await prisma.user.findUnique({
      where: { email: 'owner-b-boundary@example.invalid' }
    });
    const membershipB = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: projectB.id, userId: ownerBUser.id } }
    });

    const invitationResponse = await ownerA
      .mutate(
        'delete',
        `/api/projects/${projectA.id}/invitations/${invitationB.body.invitation.id}`
      )
      .send({});
    const membershipResponse = await ownerA
      .mutate('delete', `/api/projects/${projectA.id}/members/${membershipB.id}`)
      .send({});

    expect(invitationResponse).toMatchObject({
      status: 404,
      body: { code: ERROR_CODES.RESOURCE_NOT_FOUND }
    });
    expect(membershipResponse).toMatchObject({
      status: 404,
      body: { code: ERROR_CODES.RESOURCE_NOT_FOUND }
    });
    expect(
      await prisma.projectInvitation.findUnique({
        where: { id: invitationB.body.invitation.id }
      })
    ).toMatchObject({ revokedAt: null, acceptedAt: null, declinedAt: null });
    expect(
      await prisma.projectMembership.findUnique({ where: { id: membershipB.id } })
    ).toMatchObject({ projectId: projectB.id, isActive: true });
  });

  it('mantém somente um convite pendente em criação duplicada concorrente', async () => {
    const owner = await register('owner-duplicate-race@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Concorrente')))
      .body.project;
    const responses = await Promise.all([
      owner
        .mutate('post', `/api/projects/${project.id}/invitations`)
        .send({ email: 'invitee@example.invalid', role: 'MEMBER' }),
      owner
        .mutate('post', `/api/projects/${project.id}/invitations`)
        .send({ email: 'invitee@example.invalid', role: 'VIEWER' })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)?.body.code).toBe(
      'INVITATION_ALREADY_PENDING'
    );
    expect(
      await prisma.projectInvitation.count({
        where: {
          projectId: project.id,
          email: 'invitee@example.invalid',
          revokedAt: null,
          acceptedAt: null,
          declinedAt: null,
          expiresAt: { gt: new Date() }
        }
      })
    ).toBe(1);
  });

  it('aceita atomicamente sob concorrência e cria uma única membership', async () => {
    const owner = await register('owner-accept-race@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Aceite unico')))
      .body.project;
    const created = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'MEMBER' });
    const invitee = await register('invitee@example.invalid');
    const responses = await Promise.all([
      invitee
        .mutate('post', '/api/projects/invitations/accept')
        .send({ token: created.body.token }),
      invitee.mutate('post', '/api/projects/invitations/accept').send({ token: created.body.token })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const inviteeUser = await prisma.user.findUnique({
      where: { email: 'invitee@example.invalid' }
    });
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, userId: inviteeUser.id }
      })
    ).toBe(1);
  });

  it('recusa convite, preserva histórico e distingue estados finais e expiração', async () => {
    const owner = await register('owner-invite-state@example.invalid');
    const project = (await owner.mutate('post', '/api/projects').send(projectBody('Recusa'))).body
      .project;
    const invitee = await register('invitee@example.invalid');
    const declined = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee@example.invalid', role: 'MEMBER' });
    const details = await invitee
      .mutate('post', '/api/projects/invitations/details')
      .send({ token: declined.body.token });
    expect(details.body.invitation).toMatchObject({
      project: { id: project.id, name: 'Recusa' },
      role: 'MEMBER',
      status: 'PENDING'
    });
    expect(
      (
        await invitee
          .mutate('post', '/api/projects/invitations/decline')
          .send({ token: declined.body.token })
      ).status
    ).toBe(200);
    expect(
      (
        await invitee
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: declined.body.token })
      ).body.code
    ).toBe('INVITATION_DECLINED');
    const storedDecline = await prisma.projectInvitation.findUnique({
      where: { id: declined.body.invitation.id }
    });
    expect(storedDecline).toMatchObject({ declinedById: expect.any(Number) });
    expect(storedDecline.declinedAt).toBeInstanceOf(Date);
    expect(
      await prisma.auditEvent.count({
        where: {
          projectId: project.id,
          action: 'PROJECT_INVITATION_DECLINED',
          resourceId: String(declined.body.invitation.id)
        }
      })
    ).toBe(1);
    const invitationList = await owner.agent.get(`/api/projects/${project.id}/invitations`);
    const listedDecline = invitationList.body.invitations.find(
      ({ id }) => id === declined.body.invitation.id
    );
    expect(listedDecline).toMatchObject({ status: 'DECLINED', declinedAt: expect.any(String) });
    expect(listedDecline).not.toHaveProperty('token');
    expect(listedDecline).not.toHaveProperty('tokenHash');

    const expired = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'expired@example.invalid', role: 'VIEWER' });
    await prisma.projectInvitation.update({
      where: { id: expired.body.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    const expiredUser = await register('expired@example.invalid');
    expect(
      (
        await expiredUser
          .mutate('post', '/api/projects/invitations/accept')
          .send({ token: expired.body.token })
      ).body.code
    ).toBe('INVITATION_EXPIRED');
  });

  it('não convida nem altera perfil de pessoa que já é membro ativo', async () => {
    const owner = await register('owner-existing-member@example.invalid');
    const project = (
      await owner.mutate('post', '/api/projects').send(projectBody('Membro existente'))
    ).body.project;
    await register('member@example.invalid');
    const memberUser = await prisma.user.findUnique({ where: { email: 'member@example.invalid' } });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: memberUser.id, role: 'MEMBER' }
    });
    const blocked = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'MEMBER@example.invalid', role: 'OWNER' });
    expect(blocked).toMatchObject({
      status: 409,
      body: { code: 'PROJECT_MEMBER_ALREADY_EXISTS' }
    });

    const staleInvitation = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'later-member@example.invalid', role: 'OWNER' });
    const laterMember = await register('later-member@example.invalid');
    const laterUser = await prisma.user.findUnique({
      where: { email: 'later-member@example.invalid' }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: laterUser.id, role: 'VIEWER' }
    });
    expect(
      await laterMember
        .mutate('post', '/api/projects/invitations/accept')
        .send({ token: staleInvitation.body.token })
    ).toMatchObject({
      status: 409,
      body: { code: 'PROJECT_MEMBER_ALREADY_EXISTS' }
    });
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: laterUser.id } }
      })
    ).toMatchObject({ role: 'VIEWER', isActive: true });
  });

  it('preserva ao menos um OWNER sob duas despromoções concorrentes', async () => {
    const firstOwner = await register('owner-a@example.invalid', 'Owner A');
    const project = (
      await firstOwner.mutate('post', '/api/projects').send(projectBody('Owners concorrentes'))
    ).body.project;
    const secondOwner = await register('owner-b@example.invalid', 'Owner B');
    const firstUser = await prisma.user.findUnique({ where: { email: 'owner-a@example.invalid' } });
    const secondUser = await prisma.user.findUnique({
      where: { email: 'owner-b@example.invalid' }
    });
    const firstMembership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: firstUser.id } }
    });
    const secondMembership = await prisma.projectMembership.create({
      data: { projectId: project.id, userId: secondUser.id, role: 'OWNER' }
    });
    const responses = await Promise.all([
      firstOwner
        .mutate('patch', `/api/projects/${project.id}/members/${firstMembership.id}`)
        .send({ role: 'MEMBER' }),
      secondOwner
        .mutate('patch', `/api/projects/${project.id}/members/${secondMembership.id}`)
        .send({ role: 'MEMBER' })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, role: 'OWNER', isActive: true }
      })
    ).toBe(1);
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

  it('devolve mensagens públicas para tokens curtos sem alterar conta ou senha', async () => {
    const pendingAgent = request.agent(app);
    await pendingAgent.post('/api/auth/register').send({
      name: 'Token público',
      username: 'token-publico',
      email: 'short-token@example.invalid',
      password
    });
    const before = await prisma.user.findUnique({
      where: { email: 'short-token@example.invalid' }
    });

    const verification = await request(app)
      .post('/api/auth/email-verification/verify')
      .send({ token: 'invalid' });
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid', password: 'NovaSenhaSegura123' });
    const after = await prisma.user.findUnique({
      where: { email: 'short-token@example.invalid' }
    });

    expect(verification).toMatchObject({
      status: 400,
      body: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Link de verificação inválido ou expirado.'
      }
    });
    expect(reset).toMatchObject({
      status: 400,
      body: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Link de redefinição de senha inválido ou expirado.'
      }
    });
    expect(JSON.stringify([verification.body, reset.body])).not.toMatch(
      /expected string|too small|>=\s*32/i
    );
    expect(after).toMatchObject({
      emailVerifiedAt: null,
      passwordHash: before.passwordHash
    });
  });

  it('mantém placeholder privado: 401 sem sessão e 501 autenticado', async () => {
    expect((await request(app).delete('/api/projects/1')).status).toBe(401);
    const auth = await register('placeholder@example.invalid');
    expect((await auth.mutate('delete', '/api/projects/1')).status).toBe(501);
  });
});
