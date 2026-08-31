import { resolve } from 'node:path';
import dotenv from 'dotenv';
import {
  prepareAuthVisualFixtures,
  validateAuthVisualFixtureEnvironment
} from './lib/auth-visual-fixtures.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const configuration = validateAuthVisualFixtureEnvironment(process.env);

process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'capture';
process.env.DATABASE_URL = configuration.testDatabaseUrl;
process.env.EMAIL_VERIFICATION_URL = configuration.callbackUrls.emailVerification;
process.env.EMAIL_CHANGE_CONFIRM_URL = configuration.callbackUrls.emailChange;
process.env.ACCOUNT_REACTIVATION_URL = configuration.callbackUrls.reactivation;

const [{ prisma }, { authService }, { settingsService }, emailProvider] = await Promise.all([
  import('../src/database/prismaClient.js'),
  import('../src/modules/auth/auth.service.js'),
  import('../src/modules/settings/settings.service.js'),
  import('../src/shared/email/email.provider.js')
]);

try {
  const fixtures = await prepareAuthVisualFixtures({
    client: prisma,
    authService,
    settingsService,
    emailCapture: {
      clear: emailProvider.clearCapturedEmails,
      messages: emailProvider.getCapturedEmails
    },
    password: configuration.password,
    frontendUrl: configuration.frontendUrl
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'AUTH VISUAL FIXTURES READY',
        environment: 'LOCAL TEST ONLY',
        target: configuration.target,
        password: 'AUTH_VISUAL_FIXTURE_PASSWORD supplied by the operator',
        anonymous: {
          instruction: 'Use an isolated browser context without a session cookie.',
          login: fixtures.urls.login,
          register: fixtures.urls.register
        },
        users: fixtures.users,
        localDevTokenUrls: {
          warning: 'LOCAL DEV TOKEN — single use; rerun the fixture command to renew.',
          verification: fixtures.urls.verification,
          emailChange: fixtures.urls.emailChange,
          reactivation: fixtures.urls.reactivation
        }
      },
      null,
      2
    )}\n`
  );
} finally {
  await prisma.$disconnect();
}
