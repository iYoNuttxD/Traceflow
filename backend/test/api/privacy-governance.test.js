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
    await prisma.gitHubIdentity.create({
      data: {
        userId: user.id,
        githubUserId: '42424242',
        githubLogin: 'privacy-octocat',
        lastAuthenticatedAt: new Date()
      }
    });
    await prisma.emailChangeRequest.create({
      data: {
        userId: user.id,
        currentEmailSnapshot: user.email,
        newEmail: 'future-email@example.invalid',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    const commit = await prisma.commit.create({
      data: {
        projectId: project.id,
        hash: 'a'.repeat(40),
        message: 'Histórico técnico',
        authorName: user.name,
        authorEmail: user.email,
        authorUsername: 'privacy-octocat'
      }
    });
    const pullRequest = await prisma.pullRequest.create({
      data: {
        projectId: project.id,
        githubId: 'pr-privacy-1',
        number: 1,
        title: 'PR histórica',
        authorUsername: 'privacy-octocat'
      }
    });
    const issue = await prisma.issue.create({
      data: {
        projectId: project.id,
        githubId: 'issue-privacy-1',
        number: 1,
        title: 'Issue histórica',
        authorUsername: 'privacy-octocat',
        assigneeUsername: 'privacy-octocat'
      }
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
      isActive: false,
      accountStatus: 'ANONYMIZED'
    });
    expect(anonymized.email).toMatch(/^anonymous_.+@deleted\.traceflow\.invalid$/);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.gitHubInstallationAuthorization.count({ where: { userId: user.id } })).toBe(
      0
    );
    expect(await prisma.gitHubIdentity.count({ where: { userId: user.id } })).toBe(0);
    const tombstone = await prisma.gitHubIdentityTombstone.findFirst();
    expect(tombstone.githubUserFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(tombstone.githubUserFingerprint).not.toContain('42424242');
    expect(await prisma.emailChangeRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
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
    expect(
      await prisma.auditEvent.findFirst({
        where: { actorUserId: user.id, action: 'ACCOUNT_ANONYMIZATION_STARTED' }
      })
    ).toBeTruthy();
    expect(await prisma.commit.findUnique({ where: { id: commit.id } })).toMatchObject({
      authorName: 'Usuário excluído',
      authorEmail: anonymized.email,
      authorUsername: anonymized.username
    });
    expect(await prisma.pullRequest.findUnique({ where: { id: pullRequest.id } })).toMatchObject({
      authorUsername: anonymized.username
    });
    expect(await prisma.issue.findUnique({ where: { id: issue.id } })).toMatchObject({
      authorUsername: anonymized.username,
      assigneeUsername: anonymized.username
    });
  });

  it('retorna o último OWNER a ACTIVE, preserva o projeto e encerra a solicitação bloqueada', async () => {
    const auth = await register('sole-owner-privacy@example.invalid');
    const user = await prisma.user.findUnique({
      where: { email: 'sole-owner-privacy@example.invalid' }
    });
    const project = await prisma.project.create({
      data: {
        name: 'Projeto sem órfão',
        responsibleTeam: 'Equipe',
        accessCode: 'PRIVACY-SOLE-OWNER'
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: 'OWNER' }
    });

    const requested = await auth
      .mutate('post', '/api/settings/privacy/deletion')
      .send({ currentPassword: password, confirmation: true });
    expect(requested).toMatchObject({
      status: 202,
      body: { request: { status: 'PENDING' } }
    });
    await prisma.privacyRequest.update({
      where: { id: requested.body.request.id },
      data: { scheduledFor: new Date(Date.now() - 1000) }
    });

    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 0,
      blocked: 1,
      failed: 0
    });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      accountStatus: 'ACTIVE',
      isActive: true,
      anonymizedAt: null
    });
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } }
      })
    ).toMatchObject({ role: 'OWNER', isActive: true });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeTruthy();
    expect(
      await prisma.privacyRequest.findUnique({ where: { id: requested.body.request.id } })
    ).toMatchObject({ status: 'REJECTED', reasonCode: 'SOLE_PROJECT_OWNER' });
    expect(
      await prisma.auditEvent.findMany({
        where: {
          actorUserId: user.id,
          action: { in: ['ACCOUNT_ANONYMIZATION_BLOCKED', 'ACCOUNT_RETURNED_ACTIVE'] }
        }
      })
    ).toHaveLength(2);
    expect(
      await prisma.privacyRequest.count({
        where: { userId: user.id, type: 'ACCOUNT_DELETION', status: 'PENDING' }
      })
    ).toBe(0);
  });
});
