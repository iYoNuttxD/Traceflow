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

async function register(email = 'privacy@example.invalid') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa artificial',
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
  return {
    agent,
    csrf: response.body.csrfToken,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

describe('LR.2 — consolidação das rotas e worker de privacidade', () => {
  it('remove /api/account/* legado e preserva os contratos canônicos de settings', async () => {
    const auth = await register();
    const legacyRequests = [
      () => auth.agent.get('/api/account/personal-data'),
      () => auth.mutate('patch', '/api/account/profile').send({ name: 'Nome legado' }),
      () => auth.agent.get('/api/account/sessions'),
      () => auth.mutate('post', '/api/account/personal-data/export').send({}),
      () => auth.mutate('post', '/api/account/deactivate').send({ password }),
      () => auth.agent.get('/api/account/deletion-request')
    ];

    for (const send of legacyRequests) {
      const response = await send();
      expect(response).toMatchObject({ status: 404, body: { code: 'ROUTE_NOT_FOUND' } });
    }

    const account = await auth.agent.get('/api/settings/account');
    expect(account.status).toBe(200);
    expect(JSON.stringify(account.body)).not.toMatch(/passwordHash|tokenHash|csrfTokenHash/);
    expect((await auth.agent.get('/api/settings/security/sessions')).status).toBe(200);
    expect((await auth.agent.get('/api/settings/privacy/deletion')).status).toBe(200);
  });

  it('preserva as rotas públicas específicas de reativação', async () => {
    const start = await request(app)
      .post('/api/account/reactivation/start')
      .send({ email: 'nao-existe@example.invalid' });
    expect(start.status).not.toBe(404);
    expect(start.body.code).not.toBe('ROUTE_NOT_FOUND');
  });

  it('anonimiza conta elegível preservando IDs e removendo credenciais', async () => {
    await register('anonymize@example.invalid');
    const user = await prisma.user.findUnique({ where: { email: 'anonymize@example.invalid' } });
    const project = await prisma.project.create({
      data: {
        name: 'Histórico preservado',
        responsibleTeam: 'Equipe',
        accessCode: 'TEST-PRIVACY-HISTORY'
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: 'MEMBER' }
    });
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: '787878',
        accountId: '88',
        accountLogin: 'traceflow-history',
        accountType: 'Organization',
        installedAt: new Date()
      }
    });
    await prisma.gitHubInstallationAuthorization.create({
      data: { installationId: installation.id, userId: user.id, verifiedAt: new Date() }
    });
    await prisma.privacyRequest.create({
      data: { userId: user.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date(Date.now() - 1000) }
    });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });
    const anonymized = await prisma.user.findUnique({ where: { id: user.id } });
    expect(anonymized).toMatchObject({
      name: 'Usuário excluído',
      passwordHash: null,
      isActive: false
    });
    expect(anonymized.email).toMatch(/^anonymous_.+@deleted\.traceflow\.invalid$/);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.gitHubInstallationAuthorization.count({ where: { userId: user.id } })).toBe(
      0
    );
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeTruthy();
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } }
      })
    ).toMatchObject({ isActive: false });
    expect(
      await prisma.auditEvent.findFirst({
        where: { actorUserId: user.id, action: 'ACCOUNT_ANONYMIZED' }
      })
    ).toBeTruthy();
  });
});
