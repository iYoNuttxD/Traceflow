import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const provider = vi.hoisted(() => ({
  profile: { id: 123, login: 'octocat', name: 'Octo Cat' },
  email: 'octocat@example.test',
  exchangeLoginUserCode: vi.fn(async () => 'user-token-efemero'),
  getAuthenticatedUser: vi.fn(async () => provider.profile),
  getPrimaryVerifiedEmail: vi.fn(async () => provider.email),
  isConfigured: vi.fn(() => true),
  exchangeInstallationUserCode: vi.fn(),
  listInstallationsAccessibleToUser: vi.fn(),
  createInstallationToken: vi.fn()
}));

vi.mock('../../src/modules/github/github-credential.provider.js', () => ({
  githubAppCredentialProvider: provider,
  createGithubAppCredentialProvider: vi.fn()
}));

let app;
let prisma;
const localPassword = 'SenhaSegura123!';

function configureGithubEnvironment() {
  Object.assign(process.env, {
    GITHUB_APP_ID: '123456',
    GITHUB_APP_CLIENT_ID: 'Iv1.artificial',
    GITHUB_APP_CLIENT_SECRET: 'client-secret-artificial',
    GITHUB_APP_SLUG: 'traceflow-test',
    GITHUB_APP_PRIVATE_KEY_BASE64: 'Y2hhdmUtYXJ0aWZpY2lhbA==',
    GITHUB_APP_WEBHOOK_SECRET: 'webhook-artificial',
    GITHUB_APP_CALLBACK_URL: 'http://localhost:3001/api/github-app/callback',
    GITHUB_APP_FRONTEND_SUCCESS_URL: 'http://frontend.test/projects?github=connected',
    GITHUB_APP_FRONTEND_ERROR_URL: 'http://frontend.test/projects?github=error',
    GITHUB_LOGIN_CALLBACK_URL: 'http://localhost:3001/api/auth/github/callback',
    FRONTEND_URL: 'http://frontend.test'
  });
}

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  configureGithubEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});

beforeEach(() => {
  provider.profile = { id: 123, login: 'octocat', name: 'Octo Cat' };
  provider.email = 'octocat@example.test';
  vi.clearAllMocks();
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function registerLocal(email, username) {
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    name: 'Pessoa Local',
    username,
    email,
    password: localPassword
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registered.body.emailVerification.testToken });
  return { agent, csrf: registered.body.csrfToken, user: registered.body.user };
}

async function startGithub(agent, body = { rememberMe: false, returnTo: '/projects' }) {
  const started = await agent.post('/api/auth/github/start').send(body);
  expect(started.status).toBe(200);
  const authorization = new URL(started.body.url);
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
  return authorization.searchParams.get('state');
}

async function completeGithub(agent, state) {
  return agent.get('/api/auth/github/callback').query({ code: 'oauth-code', state });
}

describe('API de autenticação GitHub L1.1', () => {
  it('cria conta GitHub-only, persiste rememberMe e permite inicializar senha na sessão reautenticada', async () => {
    const agent = request.agent(app);
    const state = await startGithub(agent, {
      rememberMe: true,
      returnTo: '/invitations/accept?token=ABC#confirmar'
    });
    const callback = await completeGithub(agent, state);
    expect(callback).toMatchObject({
      status: 302,
      headers: {
        location: 'http://frontend.test/invitations/accept?token=ABC#confirmar'
      }
    });
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({
      email: 'octocat@example.test',
      hasLocalPassword: false
    });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|sessionVersion/);
    const stored = await prisma.user.findUnique({
      where: { email: 'octocat@example.test' },
      include: { githubIdentity: true, sessions: true }
    });
    expect(stored).toMatchObject({
      passwordHash: null,
      emailVerifiedAt: expect.any(Date),
      githubIdentity: { githubUserId: '123', githubLogin: 'octocat' }
    });
    expect(stored.sessions[0]).toMatchObject({
      rememberMe: true,
      lastReauthenticatedAt: expect.any(Date)
    });

    const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
    const initialized = await agent
      .post('/api/settings/security/password/initialize')
      .set('X-CSRF-Token', csrf)
      .send({ newPassword: localPassword, confirmation: localPassword });
    expect(initialized.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(
      (
        await request(app).post('/api/auth/login').send({
          identifier: 'octocat@example.test',
          password: localPassword,
          rememberMe: false
        })
      ).status
    ).toBe(200);
  });

  it('vincula conta local explicitamente e o login posterior resolve somente pelo githubUserId', async () => {
    const local = await registerLocal('local@example.test', 'local-user');
    const link = await local.agent
      .post('/api/settings/integrations/github-identity/link/start')
      .set('X-CSRF-Token', local.csrf)
      .send({ password: localPassword });
    expect(link.status).toBe(200);
    const linkState = new URL(link.body.url).searchParams.get('state');
    expect((await completeGithub(local.agent, linkState)).headers.location).toContain(
      '/settings/integrations?githubIdentity=success'
    );

    provider.profile = { id: 123, login: 'octocat-renamed', name: 'Outro Nome' };
    provider.email = 'changed-at-github@example.test';
    const githubAgent = request.agent(app);
    const loginState = await startGithub(githubAgent);
    await completeGithub(githubAgent, loginState);
    const me = await githubAgent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({
      id: local.user.id,
      email: 'local@example.test',
      username: 'local-user'
    });
    expect(provider.getPrimaryVerifiedEmail).not.toHaveBeenCalled();
    expect(
      await prisma.gitHubIdentity.findUnique({ where: { userId: local.user.id } })
    ).toMatchObject({ githubUserId: '123', githubLogin: 'octocat-renamed' });
  });

  it('bloqueia coincidência de e-mail sem vínculo e não autentica, vincula ou duplica User', async () => {
    await registerLocal('same@example.test', 'same-user');
    provider.profile = { id: 999, login: 'different-github', name: 'Different' };
    provider.email = 'same@example.test';
    const githubAgent = request.agent(app);
    const state = await startGithub(githubAgent);
    const callback = await completeGithub(githubAgent, state);
    expect(callback.headers.location).toBe(
      'http://frontend.test/login?github=error&reason=email_conflict'
    );
    expect((await githubAgent.get('/api/auth/me')).status).toBe(401);
    expect(await prisma.user.count({ where: { email: 'same@example.test' } })).toBe(1);
    expect(await prisma.gitHubIdentity.count()).toBe(0);
  });

  it('desvincula só a identidade após senha e preserva instalação, autorização e sessão atual', async () => {
    const local = await registerLocal('unlink@example.test', 'unlink-user');
    const user = await prisma.user.findUnique({ where: { email: 'unlink@example.test' } });
    await prisma.gitHubIdentity.create({
      data: { userId: user.id, githubUserId: '777', githubLogin: 'unlink-github' }
    });
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: '7001',
        accountId: '7002',
        accountLogin: 'preserved-org',
        accountType: 'Organization',
        installedAt: new Date()
      }
    });
    const authorization = await prisma.gitHubInstallationAuthorization.create({
      data: { installationId: installation.id, userId: user.id, verifiedAt: new Date() }
    });
    const response = await local.agent
      .delete('/api/settings/integrations/github-identity')
      .set('X-CSRF-Token', local.csrf)
      .send({ currentPassword: localPassword, confirmation: true });
    expect(response.status).toBe(204);
    expect(await prisma.gitHubIdentity.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(
      await prisma.gitHubInstallation.findUnique({ where: { id: installation.id } })
    ).toBeTruthy();
    expect(
      await prisma.gitHubInstallationAuthorization.findUnique({ where: { id: authorization.id } })
    ).toBeTruthy();
    expect((await local.agent.get('/api/auth/me')).status).toBe(200);
  });
});
