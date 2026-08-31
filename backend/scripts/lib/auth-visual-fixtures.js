import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './database-safety.js';

const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1']);
const verifiedAt = new Date('2026-01-15T12:00:00.000Z');

export const AUTH_VISUAL_FIXTURE_USERS = Object.freeze([
  Object.freeze({
    key: 'unverified',
    name: 'Validação E-mail Pendente',
    username: 'visual_auth_unverified',
    email: 'visual-auth-unverified@traceflow.test',
    emailVerified: false,
    mustSetUsername: false
  }),
  Object.freeze({
    key: 'usernamePending',
    name: 'Validação Username Pendente',
    username: 'visual_auth_username_pending',
    email: 'visual-auth-username-pending@traceflow.test',
    emailVerified: true,
    mustSetUsername: true
  }),
  Object.freeze({
    key: 'deactivated',
    name: 'Validação Conta Desativada',
    username: 'visual_auth_deactivated',
    email: 'visual-auth-deactivated@traceflow.test',
    emailVerified: true,
    mustSetUsername: false
  }),
  Object.freeze({
    key: 'deletionPending',
    name: 'Validação Exclusão Pendente',
    username: 'visual_auth_deletion_pending',
    email: 'visual-auth-deletion-pending@traceflow.test',
    emailVerified: true,
    mustSetUsername: false
  }),
  Object.freeze({
    key: 'verification',
    name: 'Validação Confirmação de E-mail',
    username: 'visual_auth_verification',
    email: 'visual-auth-verification@traceflow.test',
    emailVerified: false,
    mustSetUsername: false
  }),
  Object.freeze({
    key: 'emailChange',
    name: 'Validação Alteração de E-mail',
    username: 'visual_auth_email_change',
    email: 'visual-auth-email-change@traceflow.test',
    confirmationEmail: 'visual-auth-email-change-confirmed@traceflow.test',
    emailVerified: true,
    mustSetUsername: false
  }),
  Object.freeze({
    key: 'reactivation',
    name: 'Validação Reativação de Conta',
    username: 'visual_auth_reactivation',
    email: 'visual-auth-reactivation@traceflow.test',
    emailVerified: true,
    mustSetUsername: false
  })
]);

function localHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} deve ser uma URL HTTP(S) local válida.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !localDatabaseHosts.has(parsed.hostname)) {
    throw new Error(`${label} deve apontar para localhost, 127.0.0.1 ou ::1.`);
  }
  return parsed.toString().replace(/\/$/, '');
}

export function validateAuthVisualFixtureEnvironment(source) {
  if (source.NODE_ENV === 'production') {
    throw new Error('Fixtures visuais de Auth são proibidas em NODE_ENV=production.');
  }
  if (source.NODE_ENV !== 'test') {
    throw new Error('Fixtures visuais de Auth exigem NODE_ENV=test.');
  }
  if (source.AUTH_VISUAL_FIXTURES !== 'true') {
    throw new Error('Confirme a execução local com AUTH_VISUAL_FIXTURES=true.');
  }
  if (source.EMAIL_PROVIDER && source.EMAIL_PROVIDER !== 'capture') {
    throw new Error('Fixtures visuais de Auth exigem EMAIL_PROVIDER=capture.');
  }

  const testDatabaseUrl = validateTestDatabaseUrl(source.TEST_DATABASE_URL, source.DATABASE_URL);
  const database = new URL(testDatabaseUrl);
  if (!localDatabaseHosts.has(database.hostname)) {
    throw new Error('TEST_DATABASE_URL deve apontar para um MySQL local.');
  }
  if (source.DATABASE_URL) {
    const developmentDatabase = new URL(source.DATABASE_URL);
    const sameTarget =
      developmentDatabase.hostname === database.hostname &&
      (developmentDatabase.port || '3306') === (database.port || '3306') &&
      developmentDatabase.pathname === database.pathname;
    if (sameTarget) {
      throw new Error('TEST_DATABASE_URL deve usar um schema diferente de DATABASE_URL.');
    }
  }

  const password = source.AUTH_VISUAL_FIXTURE_PASSWORD;
  if (typeof password !== 'string' || password.length < 16) {
    throw new Error('AUTH_VISUAL_FIXTURE_PASSWORD deve possuir ao menos 16 caracteres.');
  }

  const frontendUrl = localHttpUrl(source.FRONTEND_URL || 'http://localhost:5173', 'FRONTEND_URL');
  const callbackUrls = Object.freeze({
    emailVerification: localHttpUrl(
      source.EMAIL_VERIFICATION_URL || `${frontendUrl}/verify-email`,
      'EMAIL_VERIFICATION_URL'
    ),
    emailChange: localHttpUrl(
      source.EMAIL_CHANGE_CONFIRM_URL || `${frontendUrl}/settings/account/email-change/confirm`,
      'EMAIL_CHANGE_CONFIRM_URL'
    ),
    reactivation: localHttpUrl(
      source.ACCOUNT_REACTIVATION_URL || `${frontendUrl}/account/reactivation/confirm`,
      'ACCOUNT_REACTIVATION_URL'
    )
  });
  for (const [label, callbackUrl] of Object.entries(callbackUrls)) {
    if (new URL(callbackUrl).origin !== new URL(frontendUrl).origin) {
      throw new Error(`${label} deve usar a mesma origem local de FRONTEND_URL.`);
    }
  }

  return Object.freeze({
    testDatabaseUrl,
    frontendUrl,
    callbackUrls,
    password,
    target: sanitizedDatabaseTarget(testDatabaseUrl)
  });
}

export function extractLocalFixtureUrl(message, expectedOrigin) {
  const candidate = String(message?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
  if (!candidate) throw new Error('O provider capture não retornou o link local esperado.');
  const parsed = new URL(candidate);
  if (parsed.origin !== new URL(expectedOrigin).origin || !parsed.searchParams.get('token')) {
    throw new Error('O link capturado não pertence ao frontend local ou não contém token.');
  }
  return parsed.toString();
}

function fixtureUserData(fixture, passwordHash) {
  return {
    name: fixture.name,
    username: fixture.username,
    email: fixture.email,
    passwordHash,
    mustSetUsername: fixture.mustSetUsername,
    mustSetPassword: false,
    isActive: true,
    emailVerifiedAt: fixture.emailVerified ? verifiedAt : null,
    sessionVersion: 1,
    accountStatus: 'ACTIVE',
    deactivatedAt: null,
    anonymizedAt: null,
    usernameChangedAt: null,
    lastLoginAt: null
  };
}

export async function resetAuthVisualFixtureUsers({ client, passwordHash }) {
  const usernames = AUTH_VISUAL_FIXTURE_USERS.map(({ username }) => username);
  const emails = AUTH_VISUAL_FIXTURE_USERS.flatMap(({ email, confirmationEmail }) =>
    confirmationEmail ? [email, confirmationEmail] : [email]
  );

  return client.$transaction(async (tx) => {
    const existing = await tx.user.findMany({
      where: { OR: [{ username: { in: usernames } }, { email: { in: emails } }] },
      select: { id: true, username: true, email: true }
    });
    const userIds = existing.map(({ id }) => id);

    if (userIds.length > 0) {
      const ownedByFixtures = { userId: { in: userIds } };
      await tx.session.deleteMany({ where: ownedByFixtures });
      await tx.passwordResetToken.deleteMany({ where: ownedByFixtures });
      await tx.emailVerificationToken.deleteMany({ where: ownedByFixtures });
      await tx.emailChangeRequest.deleteMany({ where: ownedByFixtures });
      await tx.accountReactivationToken.deleteMany({ where: ownedByFixtures });
      await tx.personalDataExport.deleteMany({ where: ownedByFixtures });
      await tx.privacyRequest.deleteMany({ where: ownedByFixtures });
      await tx.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    }

    const users = {};
    for (const fixture of AUTH_VISUAL_FIXTURE_USERS) {
      const data = fixtureUserData(fixture, passwordHash);
      const candidates = existing.filter(
        (user) =>
          user.username === fixture.username ||
          user.email === fixture.email ||
          (fixture.confirmationEmail && user.email === fixture.confirmationEmail)
      );
      if (candidates.length > 1) {
        throw new Error(`Namespace de fixture ambíguo para ${fixture.username}.`);
      }
      users[fixture.key] = candidates[0]
        ? await tx.user.update({ where: { id: candidates[0].id }, data })
        : await tx.user.create({ data });
    }
    return users;
  });
}

function capturedMessage(messages, recipient, subject) {
  const message = [...messages]
    .reverse()
    .find((item) => item.to === recipient && item.subject === subject);
  if (!message) throw new Error(`E-mail local não capturado para ${recipient}.`);
  return message;
}

async function removeScriptSession(client, login) {
  await client.session.deleteMany({
    where: { id: login.session.id, userId: login.user.id }
  });
}

export async function prepareAuthVisualFixtures({
  client,
  authService,
  settingsService,
  emailCapture,
  password,
  frontendUrl,
  now = new Date()
}) {
  emailCapture.clear();
  const passwordHash = await authService.hashPassword(password);
  const users = await resetAuthVisualFixtureUsers({ client, passwordHash });

  await authService.resendEmailVerification(users.unverified);
  await authService.resendEmailVerification(users.verification);

  const deactivatedLogin = await authService.login({
    identifier: users.deactivated.username,
    password
  });
  await settingsService.deactivate(
    users.deactivated.id,
    deactivatedLogin.session,
    { currentPassword: password },
    'auth-visual-fixture-deactivated',
    now
  );
  await removeScriptSession(client, deactivatedLogin);

  const deletionLogin = await authService.login({
    identifier: users.deletionPending.username,
    password
  });
  await settingsService.requestDeletion(
    users.deletionPending.id,
    deletionLogin.session,
    { currentPassword: password },
    'auth-visual-fixture-deletion-pending',
    now
  );
  await removeScriptSession(client, deletionLogin);

  const emailChangeLogin = await authService.login({
    identifier: users.emailChange.username,
    password
  });
  const emailChangeFixture = AUTH_VISUAL_FIXTURE_USERS.find(({ key }) => key === 'emailChange');
  await settingsService.requestEmailChange(
    users.emailChange.id,
    emailChangeLogin.session,
    {
      newEmail: emailChangeFixture.confirmationEmail,
      currentPassword: password
    },
    'auth-visual-fixture-email-change',
    now
  );
  await removeScriptSession(client, emailChangeLogin);

  const reactivationLogin = await authService.login({
    identifier: users.reactivation.username,
    password
  });
  await settingsService.deactivate(
    users.reactivation.id,
    reactivationLogin.session,
    { currentPassword: password },
    'auth-visual-fixture-reactivation-deactivate',
    now
  );
  await settingsService.startReactivation(
    users.reactivation.id,
    'auth-visual-fixture-reactivation',
    now
  );
  await removeScriptSession(client, reactivationLogin);

  const messages = emailCapture.messages();
  const verificationMessage = capturedMessage(
    messages,
    users.verification.email,
    'Verifique seu e-mail no TRACEFLOW'
  );
  const emailChangeMessage = capturedMessage(
    messages,
    emailChangeFixture.confirmationEmail,
    'Confirme seu novo e-mail no TRACEFLOW'
  );
  const reactivationMessage = capturedMessage(
    messages,
    users.reactivation.email,
    'Reative sua conta TRACEFLOW'
  );

  const persisted = await client.user.findMany({
    where: { username: { in: AUTH_VISUAL_FIXTURE_USERS.map(({ username }) => username) } },
    select: {
      username: true,
      emailVerifiedAt: true,
      mustSetUsername: true,
      accountStatus: true
    }
  });
  const persistedByUsername = Object.fromEntries(persisted.map((user) => [user.username, user]));
  const expectedStates = {
    visual_auth_unverified: { verified: false, mustSetUsername: false, accountStatus: 'ACTIVE' },
    visual_auth_username_pending: {
      verified: true,
      mustSetUsername: true,
      accountStatus: 'ACTIVE'
    },
    visual_auth_deactivated: {
      verified: true,
      mustSetUsername: false,
      accountStatus: 'DEACTIVATED'
    },
    visual_auth_deletion_pending: {
      verified: true,
      mustSetUsername: false,
      accountStatus: 'DELETION_PENDING'
    }
  };
  for (const [username, expected] of Object.entries(expectedStates)) {
    const actual = persistedByUsername[username];
    if (
      !actual ||
      Boolean(actual.emailVerifiedAt) !== expected.verified ||
      actual.mustSetUsername !== expected.mustSetUsername ||
      actual.accountStatus !== expected.accountStatus
    ) {
      throw new Error(`A fixture ${username} não atingiu o estado canônico esperado.`);
    }
  }

  return Object.freeze({
    users: AUTH_VISUAL_FIXTURE_USERS.map(({ key, name, username, email }) => ({
      key,
      name,
      username,
      email
    })),
    urls: Object.freeze({
      login: `${frontendUrl}/login`,
      register: `${frontendUrl}/register`,
      verification: extractLocalFixtureUrl(verificationMessage, frontendUrl),
      emailChange: extractLocalFixtureUrl(emailChangeMessage, frontendUrl),
      reactivation: extractLocalFixtureUrl(reactivationMessage, frontendUrl)
    })
  });
}
