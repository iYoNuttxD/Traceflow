import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment } from '../helpers/test-database.js';
import {
  AUTH_VISUAL_FIXTURE_USERS,
  prepareAuthVisualFixtures
} from '../../scripts/lib/auth-visual-fixtures.js';

let prisma;
let authService;
let settingsService;
let emailProvider;

beforeAll(async () => {
  configureTestDatabaseEnvironment();
  [{ prisma }, { authService }, { settingsService }, emailProvider] = await Promise.all([
    import('../../src/database/prismaClient.js'),
    import('../../src/modules/auth/auth.service.js'),
    import('../../src/modules/settings/settings.service.js'),
    import('../../src/shared/email/email.provider.js')
  ]);
  await cleanTestDatabase(prisma);
});

beforeEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('preparação integrada das fixtures visuais de Auth', () => {
  it('gera estados e tokens canônicos e permanece idempotente', async () => {
    const input = {
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
    expect(Object.fromEntries(secondUsers.map(({ username, id }) => [username, id]))).toEqual(
      firstIds
    );
    expect(second.urls.verification).not.toBe(first.urls.verification);
    expect(await prisma.emailVerificationToken.count()).toBe(2);
    expect(await prisma.emailChangeRequest.count()).toBe(1);
    expect(await prisma.accountReactivationToken.count()).toBe(1);
    expect(await prisma.privacyRequest.count()).toBe(1);
  });
});
