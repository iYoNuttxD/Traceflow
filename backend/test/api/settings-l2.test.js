import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let getCapturedEmails;
let clearCapturedEmails;
const password = 'SenhaSegura123!';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ getCapturedEmails, clearCapturedEmails } =
    await import('../../src/shared/email/email.provider.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  clearCapturedEmails();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email = 'settings@example.invalid') {
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    name: 'Pessoa Configurações',
    username: `u${email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 28)}`,
    email,
    password
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registered.body.emailVerification.testToken });
  return {
    agent,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', registered.body.csrfToken)
  };
}

describe('contratos de conta e privacidade L2', () => {
  it('altera perfil/username e cria troca de e-mail sem alterar o login atual', async () => {
    const auth = await register();
    expect((await auth.agent.get('/api/settings/account')).body.account).toMatchObject({
      email: 'settings@example.invalid',
      accountStatus: 'ACTIVE'
    });
    expect(
      (
        await auth
          .mutate('patch', '/api/settings/account/profile')
          .send({ name: 'Nome Atualizado' })
      ).body.account.name
    ).toBe('Nome Atualizado');
    expect(
      (
        await auth
          .mutate('patch', '/api/settings/account/username')
          .send({ username: 'username-novo' })
      ).status
    ).toBe(200);
    const requested = await auth
      .mutate('post', '/api/settings/account/email-change')
      .send({ newEmail: 'novo@example.invalid', currentPassword: password });
    expect(requested.status).toBe(202);
    expect(
      await prisma.user.findUnique({ where: { email: 'settings@example.invalid' } })
    ).toBeTruthy();
    const stored = await prisma.emailChangeRequest.findFirst({
      where: { newEmail: 'novo@example.invalid' }
    });
    expect(stored.tokenHash).toHaveLength(64);
    expect(JSON.stringify(requested.body)).not.toContain(stored.tokenHash);
    expect(
      (await auth.agent.get('/api/settings/account/email-change/status')).body.request
    ).toMatchObject({
      newEmail: 'novo@example.invalid'
    });
    expect((await auth.mutate('delete', '/api/settings/account/email-change')).status).toBe(204);
  });

  it('confirma novo e-mail por token único e revoga todas as sessões', async () => {
    const auth = await register('old-email@example.invalid');
    clearCapturedEmails();
    await auth.mutate('post', '/api/settings/account/email-change').send({
      newEmail: 'new-email@example.invalid',
      currentPassword: password
    });
    const confirmation = getCapturedEmails().find((email) => email.subject.includes('novo e-mail'));
    const token = new URL(confirmation.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
    expect(
      (await request(app).get('/api/settings/account/email-change/confirm').query({ token })).status
    ).toBe(200);
    expect((await auth.agent.get('/api/auth/me')).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: 'new-email@example.invalid', password, rememberMe: false })
      ).status
    ).toBe(200);
    expect(
      (await request(app).get('/api/settings/account/email-change/confirm').query({ token })).body
        .code
    ).toBe('EMAIL_CHANGE_TOKEN_INVALID');
  });

  it('expõe UUID público, preserva sessão atual na troca de senha e gera ZIP', async () => {
    const auth = await register('security@example.invalid');
    const sessions = await auth.agent.get('/api/settings/security/sessions');
    expect(sessions.body.sessions[0]).toMatchObject({
      sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      current: true
    });
    expect(JSON.stringify(sessions.body)).not.toMatch(/tokenHash|csrfTokenHash|"id":/);
    expect(
      (
        await auth.mutate('post', '/api/settings/security/password').send({
          currentPassword: password,
          newPassword: 'SenhaNova456!',
          confirmation: 'SenhaNova456!'
        })
      ).status
    ).toBe(200);
    expect((await auth.agent.get('/api/settings/security/sessions')).status).toBe(200);
    const exported = await auth.mutate('post', '/api/settings/privacy/export').send({});
    expect(exported).toMatchObject({ status: 200 });
    expect(exported.headers['content-type']).toMatch(/application\/zip/);
  });

  it('revoga sessões próprias por UUID e encerra todas as outras', async () => {
    const auth = await register('sessions@example.invalid');
    const secondAgent = request.agent(app);
    await secondAgent
      .post('/api/auth/login')
      .send({ identifier: 'sessions@example.invalid', password, rememberMe: true });
    const sessions = (await auth.agent.get('/api/settings/security/sessions')).body.sessions;
    const other = sessions.find((session) => !session.current);
    expect(other).toBeTruthy();
    expect(
      (await auth.mutate('delete', `/api/settings/security/sessions/${other.sessionId}`)).status
    ).toBe(204);
    expect(
      (await auth.mutate('post', '/api/settings/security/sessions/revoke-others')).body
    ).toEqual({
      revoked: 0
    });
  });

  it('restringe imediatamente exclusão/desativação e permite cancelar exclusão', async () => {
    const deleting = await register('deleting@example.invalid');
    const requested = await deleting
      .mutate('post', '/api/settings/privacy/deletion')
      .send({ currentPassword: password, confirmation: true });
    expect(requested.status).toBe(202);
    expect(new Date(requested.body.request.scheduledFor).getTime()).toBeGreaterThan(
      Date.now() + 29 * 86400000
    );
    expect((await deleting.agent.get('/api/projects')).body.code).toBe('ACCOUNT_DELETION_PENDING');
    expect((await deleting.mutate('post', '/api/settings/privacy/export').send({})).status).toBe(
      200
    );
    expect(
      (
        await deleting
          .mutate('delete', '/api/settings/privacy/deletion')
          .send({ currentPassword: password, confirmation: true })
      ).status
    ).toBe(200);
    expect((await deleting.agent.get('/api/auth/me')).status).toBe(401);
    const relogin = request.agent(app);
    const relogged = await relogin
      .post('/api/auth/login')
      .send({ identifier: 'deleting@example.invalid', password, rememberMe: false });
    const idempotent = await relogin
      .delete('/api/settings/privacy/deletion')
      .set('X-CSRF-Token', relogged.body.csrfToken)
      .send({ currentPassword: password, confirmation: true });
    expect(idempotent).toMatchObject({
      status: 200,
      body: { message: 'A exclusão já estava cancelada.', request: { status: 'CANCELLED' } }
    });

    const deactivated = await register('deactivated@example.invalid');
    expect(
      (
        await deactivated
          .mutate('post', '/api/settings/account/deactivate')
          .send({ currentPassword: password, confirmation: true })
      ).body.account.accountStatus
    ).toBe('DEACTIVATED');
    expect((await deactivated.agent.get('/api/projects')).body.code).toBe('ACCOUNT_DEACTIVATED');
    expect((await deactivated.agent.get('/api/settings/account')).status).toBe(200);
    clearCapturedEmails();
    expect(
      (await deactivated.mutate('post', '/api/account/reactivation/start').send({})).status
    ).toBe(202);
    const reactivation = getCapturedEmails().find((email) => email.subject.includes('Reative'));
    const token = new URL(reactivation.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
    expect(
      (await request(app).get('/api/account/reactivation/confirm').query({ token })).status
    ).toBe(200);
    expect((await deactivated.agent.get('/api/auth/me')).status).toBe(401);
  });

  it('lista instalação indisponível sem chamada externa e remove somente autorização pessoal', async () => {
    const auth = await register('github-settings@example.invalid');
    const user = await prisma.user.findUnique({
      where: { email: 'github-settings@example.invalid' }
    });
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: '919191',
        accountId: '77',
        accountLogin: 'traceflow-org',
        accountType: 'Organization',
        status: 'SUSPENDED',
        installedAt: new Date()
      }
    });
    const authorization = await prisma.gitHubInstallationAuthorization.create({
      data: { installationId: installation.id, userId: user.id, verifiedAt: new Date() }
    });
    const listed = await auth.agent.get('/api/settings/integrations/github');
    expect(listed).toMatchObject({
      status: 200,
      body: {
        integrations: [
          {
            id: authorization.id,
            installation: { accountLogin: 'traceflow-org', status: 'SUSPENDED' },
            repositories: []
          }
        ]
      }
    });
    expect(
      (
        await auth
          .mutate('delete', `/api/settings/integrations/github/authorizations/${authorization.id}`)
          .send({ currentPassword: password, confirmation: true })
      ).status
    ).toBe(200);
    expect(
      await prisma.gitHubInstallation.findUnique({ where: { id: installation.id } })
    ).toBeTruthy();
    expect(
      await prisma.gitHubInstallationAuthorization.findUnique({ where: { id: authorization.id } })
    ).toBeNull();
  });
});
