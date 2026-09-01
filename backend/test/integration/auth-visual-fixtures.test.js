import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureTestDatabaseEnvironment } from '../helpers/test-database.js';
import {
  AUTH_VISUAL_FIXTURE_USERS,
  prepareAuthVisualFixtures
} from '../../scripts/lib/auth-visual-fixtures.js';

let prisma;
let authService;
let settingsService;
let emailProvider;
let testDatabaseUrl;

const foreignTestUsername = 'visual_auth_foreign_test';

async function cleanFixtureNamespace() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { in: AUTH_VISUAL_FIXTURE_USERS.map(({ username }) => username) } },
        { username: foreignTestUsername }
      ]
    },
    select: { id: true }
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const relatedProjects = await tx.project.findMany({
      where: { memberships: { some: { userId: { in: userIds } } } },
      select: { id: true }
    });
    const projectIds = relatedProjects.map(({ id }) => id);
    if (projectIds.length > 0) {
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await tx.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
}

function fixtureInput() {
  return {
    client: prisma,
    authService,
    settingsService,
    emailCapture: {
      clear: emailProvider.clearCapturedEmails,
      messages: emailProvider.getCapturedEmails
    },
    password: 'FixtureIntegrationOnly123!',
    frontendUrl: 'http://localhost:5173',
    now: new Date('2026-08-30T12:00:00.000Z')
  };
}

async function createFixtureProject(memberships) {
  return prisma.project.create({
    data: {
      name: 'Projeto artificial das fixtures de Auth',
      responsibleTeam: 'Equipe artificial',
      accessCode: `AUTH-VISUAL-${randomUUID()}`,
      memberships: { create: memberships }
    }
  });
}

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  [{ prisma }, { authService }, { settingsService }, emailProvider] = await Promise.all([
    import('../../src/database/prismaClient.js'),
    import('../../src/modules/auth/auth.service.js'),
    import('../../src/modules/settings/settings.service.js'),
    import('../../src/shared/email/email.provider.js')
  ]);
  await cleanFixtureNamespace();
});

beforeEach(async () => cleanFixtureNamespace());

afterAll(async () => {
  if (!prisma) return;
  await cleanFixtureNamespace();
  await prisma.$disconnect();
});

describe('preparação integrada das fixtures visuais de Auth', () => {
  it('gera estados e tokens canônicos e permanece idempotente', async () => {
    const input = fixtureInput();

    const first = await prepareAuthVisualFixtures(input);
    const firstUsers = await prisma.user.findMany({
      where: { username: { in: AUTH_VISUAL_FIXTURE_USERS.map(({ username }) => username) } },
      select: {
        id: true,
        username: true,
        emailVerifiedAt: true,
        mustSetUsername: true,
        accountStatus: true
      }
    });

    expect(firstUsers).toHaveLength(AUTH_VISUAL_FIXTURE_USERS.length);
    expect(firstUsers.find(({ username }) => username === 'visual_auth_unverified')).toMatchObject({
      emailVerifiedAt: null,
      mustSetUsername: false,
      accountStatus: 'ACTIVE'
    });
    expect(
      firstUsers.find(({ username }) => username === 'visual_auth_username_pending')
    ).toMatchObject({ mustSetUsername: true, accountStatus: 'ACTIVE' });
    expect(firstUsers.find(({ username }) => username === 'visual_auth_deactivated')).toMatchObject(
      { accountStatus: 'DEACTIVATED' }
    );
    expect(
      firstUsers.find(({ username }) => username === 'visual_auth_deletion_pending')
    ).toMatchObject({ accountStatus: 'DELETION_PENDING' });
    expect(first.urls.verification).toMatch(/^http:\/\/localhost:5173\/verify-email\?token=.+/);
    expect(first.urls.emailChange).toMatch(
      /^http:\/\/localhost:5173\/settings\/account\/email-change\/confirm\?token=.+/
    );
    expect(first.urls.reactivation).toMatch(
      /^http:\/\/localhost:5173\/account\/reactivation\/confirm\?token=.+/
    );
    expect(await prisma.emailVerificationToken.count()).toBe(2);
    expect(await prisma.emailChangeRequest.count()).toBe(1);
    expect(await prisma.accountReactivationToken.count()).toBe(1);
    expect(await prisma.privacyRequest.count()).toBe(1);

    const firstIds = Object.fromEntries(firstUsers.map(({ username, id }) => [username, id]));
    const second = await prepareAuthVisualFixtures(input);
    const secondUsers = await prisma.user.findMany({
      where: { username: { in: AUTH_VISUAL_FIXTURE_USERS.map(({ username }) => username) } },
      select: { id: true, username: true }
    });

    expect(secondUsers).toHaveLength(AUTH_VISUAL_FIXTURE_USERS.length);
    expect(first.cleanup).toEqual({ projectsRemoved: 0 });
    expect(second.cleanup).toEqual({ projectsRemoved: 0 });
    expect(Object.fromEntries(secondUsers.map(({ username, id }) => [username, id]))).toEqual(
      firstIds
    );
    expect(second.urls.verification).not.toBe(first.urls.verification);
    expect(await prisma.emailVerificationToken.count()).toBe(2);
    expect(await prisma.emailChangeRequest.count()).toBe(1);
    expect(await prisma.accountReactivationToken.count()).toBe(1);
    expect(await prisma.privacyRequest.count()).toBe(1);
  });

  it('remove projeto vazio pertencente somente à fixture antes do lifecycle canônico', async () => {
    await prepareAuthVisualFixtures(fixtureInput());
    const fixtureUser = await prisma.user.findUnique({
      where: { username: 'visual_auth_deactivated' }
    });
    const project = await createFixtureProject([
      { userId: fixtureUser.id, role: 'OWNER', isActive: true }
    ]);

    const rerun = await prepareAuthVisualFixtures(fixtureInput());

    expect(rerun.cleanup).toEqual({ projectsRemoved: 1 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(
      await prisma.user.findUnique({
        where: { username: 'visual_auth_deactivated' },
        select: { accountStatus: true }
      })
    ).toEqual({ accountStatus: 'DEACTIVATED' });
  });

  it('aborta diante de projeto compartilhado e preserva todos os dados externos', async () => {
    await prepareAuthVisualFixtures(fixtureInput());
    const fixtureUser = await prisma.user.findUnique({
      where: { username: 'visual_auth_deactivated' }
    });
    const foreignUser = await prisma.user.create({
      data: {
        name: 'Pessoa externa artificial',
        username: foreignTestUsername,
        email: 'visual-auth-foreign-test@traceflow.test'
      }
    });
    const project = await createFixtureProject([
      { userId: fixtureUser.id, role: 'OWNER', isActive: true },
      { userId: foreignUser.id, role: 'MEMBER', isActive: true }
    ]);

    await expect(prepareAuthVisualFixtures(fixtureInput())).rejects.toThrow(
      new RegExp(`Projetos ${project.id}.*limpeza automática foi recusada`, 'i')
    );

    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: foreignUser.id } })).not.toBeNull();
    expect(await prisma.projectMembership.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      await prisma.user.findUnique({
        where: { id: fixtureUser.id },
        select: { accountStatus: true }
      })
    ).toEqual({ accountStatus: 'DEACTIVATED' });
  });

  it('executa com sucesso pelo entrypoint protegido no banco local de teste', () => {
    const developmentDatabase = new URL(testDatabaseUrl);
    developmentDatabase.pathname = '/traceflow_fixture_development';
    const password = 'EntrypointIntegrationOnly123!';
    const result = spawnSync(process.execPath, [resolve('scripts/auth-visual-fixtures.js')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AUTH_VISUAL_FIXTURES: 'true',
        EMAIL_PROVIDER: 'capture',
        DATABASE_URL: developmentDatabase.toString(),
        TEST_DATABASE_URL: testDatabaseUrl,
        FRONTEND_URL: 'http://localhost:5173',
        EMAIL_VERIFICATION_URL: 'http://localhost:5173/verify-email',
        EMAIL_CHANGE_CONFIRM_URL: 'http://localhost:5173/settings/account/email-change/confirm',
        ACCOUNT_REACTIVATION_URL: 'http://localhost:5173/account/reactivation/confirm',
        AUTH_VISUAL_FIXTURE_PASSWORD: password
      },
      encoding: 'utf8',
      timeout: 30000
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      status: 'AUTH VISUAL FIXTURES READY',
      environment: 'LOCAL TEST ONLY',
      cleanup: { projectsRemoved: 0 }
    });
    expect(result.stdout).not.toContain(password);
  });
});
