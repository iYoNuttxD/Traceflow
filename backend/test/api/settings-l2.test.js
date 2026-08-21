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
let createApp;
let env;
const password = 'SenhaSegura123!';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ getCapturedEmails, clearCapturedEmails } =
    await import('../../src/shared/email/email.provider.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ env } = await import('../../src/config/env.js'));
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
    response: registered,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', registered.body.csrfToken)
  };
}

async function loginOn(targetApp, identifier) {
  const agent = request.agent(targetApp);
  const response = await agent.post('/api/auth/login').send({
    identifier,
    password,
    rememberMe: false
  });
  return {
    agent,
    csrf: response.body.csrfToken,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
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

  it('trata senha atual incorreta como 403 de domínio sem revogar a sessão', async () => {
    const auth = await register('wrong-password@example.invalid');
    const attempts = [
      auth
        .mutate('post', '/api/settings/account/email-change')
        .send({ newEmail: 'other@example.invalid', currentPassword: 'incorreta' }),
      auth.mutate('post', '/api/settings/security/password').send({
        currentPassword: 'incorreta',
        newPassword: 'SenhaNova456!',
        confirmation: 'SenhaNova456!'
      }),
      auth
        .mutate('post', '/api/settings/account/deactivate')
        .send({ currentPassword: 'incorreta', confirmation: true }),
      auth
        .mutate('post', '/api/settings/privacy/deletion')
        .send({ currentPassword: 'incorreta', confirmation: true }),
      auth
        .mutate('post', '/api/settings/integrations/github-identity/link/start')
        .send({ password: 'incorreta' })
    ];

    for (const response of await Promise.all(attempts)) {
      expect(response).toMatchObject({
        status: 403,
        body: { code: 'CURRENT_PASSWORD_INVALID' }
      });
    }
    expect((await auth.agent.get('/api/auth/me')).status).toBe(200);
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
    await prisma.gitHubRepositoryAuthorization.create({
      data: {
        installationId: installation.id,
        userId: user.id,
        githubRepositoryId: '91919101',
        repositoryFullName: 'traceflow-org/authorized-repository',
        permission: 'ADMIN',
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000)
      }
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
    expect(
      await prisma.gitHubRepositoryAuthorization.count({
        where: { installationId: installation.id, userId: user.id }
      })
    ).toBe(0);
  });
});

describe('rate limiting pós-L2', () => {
  it('tolera navegação normal, duplicação de leitura e preflight sem 429', async () => {
    await register('navigation-rate@example.invalid');
    const navigationApp = createApp({
      securityConfig: {
        ...env,
        trustProxy: 1,
        rateLimitGlobalMax: 1000,
        rateLimitReadBurstMax: 40,
        rateLimitReadMax: 80
      }
    });
    const navigationServer = await new Promise((resolve, reject) => {
      const server = navigationApp.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    try {
      const auth = await loginOn(navigationServer, 'navigation-rate@example.invalid');
      const paths = [
        '/api/auth/me',
        '/api/auth/csrf',
        '/api/projects',
        '/api/settings/account',
        '/api/settings/security/sessions',
        '/api/settings/privacy/deletion',
        '/api/settings/integrations/github',
        '/api/github/app/installations'
      ];

      for (let round = 0; round < 3; round += 1) {
        const responses = await Promise.all(
          paths.map(async (path) => {
            try {
              return await auth.agent.get(path);
            } catch (error) {
              throw new Error(`GET ${path} falhou: ${error.code || error.message}`, {
                cause: error
              });
            }
          })
        );
        expect(responses.every((response) => response.status === 200)).toBe(true);
      }
      const duplicate = await Promise.all([
        auth.agent.get('/api/settings/account'),
        auth.agent.get('/api/settings/account')
      ]);
      expect(duplicate.map((response) => response.status)).toEqual([200, 200]);
      expect(
        (
          await request(navigationServer)
            .options('/api/settings/account')
            .set('Origin', env.corsAllowedOrigins[0])
            .set('Access-Control-Request-Method', 'GET')
        ).status
      ).toBe(204);
    } finally {
      await new Promise((resolve, reject) =>
        navigationServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it('mantém quotas de leitura independentes para duas contas no mesmo IP', async () => {
    await register('rate-account-a@example.invalid');
    await register('rate-account-b@example.invalid');
    const isolatedApp = createApp({
      securityConfig: {
        ...env,
        trustProxy: 1,
        rateLimitGlobalMax: 1000,
        rateLimitReadBurstWindowMs: 60_000,
        rateLimitReadBurstMax: 2,
        rateLimitReadWindowMs: 60_000,
        rateLimitReadMax: 2
      }
    });
    const accountA = await loginOn(isolatedApp, 'rate-account-a@example.invalid');
    const accountB = await loginOn(isolatedApp, 'rate-account-b@example.invalid');
    const ip = '198.51.100.80';

    expect(
      (await accountA.agent.get('/api/settings/account').set('X-Forwarded-For', ip)).status
    ).toBe(200);
    expect(
      (await accountA.agent.get('/api/settings/account').set('X-Forwarded-For', ip)).status
    ).toBe(200);
    const limited = await accountA.agent.get('/api/settings/account').set('X-Forwarded-For', ip);
    const independent = await accountB.agent
      .get('/api/settings/account')
      .set('X-Forwarded-For', ip);

    expect(limited).toMatchObject({
      status: 429,
      body: expect.objectContaining({
        code: 'RATE_LIMITED',
        scope: 'authenticated-read-burst',
        retryAfterSeconds: expect.any(Number)
      })
    });
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers.ratelimit).toBeDefined();
    expect(independent.status).toBe(200);
  });

  it('protege a listagem agregada de repositórios com a quota autenticada de leitura', async () => {
    await register('rate-repositories@example.invalid');
    const protectedApp = createApp({
      securityConfig: {
        ...env,
        trustProxy: 1,
        rateLimitGlobalMax: 1000,
        rateLimitReadBurstWindowMs: 60_000,
        rateLimitReadBurstMax: 2,
        rateLimitReadWindowMs: 60_000,
        rateLimitReadMax: 2
      }
    });
    const auth = await loginOn(protectedApp, 'rate-repositories@example.invalid');
    const path = '/api/github/app/repositories';

    expect((await auth.agent.get(path)).status).toBe(200);
    expect((await auth.agent.get(path)).status).toBe(200);
    expect(await auth.agent.get(path)).toMatchObject({
      status: 429,
      body: expect.objectContaining({
        code: 'RATE_LIMITED',
        scope: 'authenticated-read-burst'
      })
    });
  });

  it('continua bloqueando autenticação, e-mail, mutação e exportação abusivas', async () => {
    await register('rate-sensitive@example.invalid');
    const protectedApp = createApp({
      securityConfig: {
        ...env,
        rateLimitGlobalMax: 1000,
        rateLimitAuthMax: 1,
        rateLimitEmailMax: 1,
        rateLimitSensitiveMax: 1,
        rateLimitExportMax: 1
      }
    });

    await request(protectedApp)
      .post('/api/auth/login')
      .send({ identifier: 'unknown-rate@example.invalid', password: 'SenhaIncorreta123!' });
    const authLimited = await request(protectedApp)
      .post('/api/auth/login')
      .send({ identifier: 'unknown-rate@example.invalid', password: 'SenhaIncorreta123!' });
    expect(authLimited).toMatchObject({
      status: 429,
      body: expect.objectContaining({ scope: 'authentication' })
    });

    const authenticated = await loginOn(protectedApp, 'rate-sensitive@example.invalid');
    await authenticated.mutate('post', '/api/auth/email-verification/resend').send({});
    expect(
      (await authenticated.mutate('post', '/api/auth/email-verification/resend').send({})).body
        .scope
    ).toBe('email-delivery');

    await authenticated
      .mutate('patch', '/api/settings/account/profile')
      .send({ name: 'Nome com limite' });
    expect(
      (
        await authenticated
          .mutate('patch', '/api/settings/account/profile')
          .send({ name: 'Nome bloqueado' })
      ).body.scope
    ).toBe('sensitive-mutation');

    expect(
      (await authenticated.mutate('post', '/api/settings/privacy/export').send({})).status
    ).toBe(200);
    expect(
      (await authenticated.mutate('post', '/api/settings/privacy/export').send({})).body.scope
    ).toBe('data-export');
  });

  it.each([
    ['post', '/api/settings/security/password', 'password'],
    ['post', '/api/settings/account/email-change', 'email'],
    ['patch', '/api/settings/account/username', 'username'],
    ['post', '/api/settings/account/deactivate', 'deactivate'],
    ['post', '/api/settings/privacy/deletion', 'delete-account'],
    ['delete', '/api/settings/privacy/deletion', 'cancel-deletion'],
    ['delete', '/api/settings/security/sessions/not-a-uuid', 'revoke-session'],
    ['delete', '/api/settings/integrations/github/authorizations/999', 'remove-github']
  ])('protege abuso da mutação %s %s', async (method, path, suffix) => {
    const email = `rate-${suffix}@example.invalid`;
    await register(email);
    const mutationApp = createApp({
      securityConfig: {
        ...env,
        rateLimitGlobalMax: 1000,
        rateLimitSensitiveMax: 1
      }
    });
    const authenticated = await loginOn(mutationApp, email);

    await authenticated.mutate(method, path).send({});
    const limited = await authenticated.mutate(method, path).send({});

    expect(limited).toMatchObject({
      status: 429,
      body: expect.objectContaining({ code: 'RATE_LIMITED', scope: 'sensitive-mutation' })
    });
  });
});
