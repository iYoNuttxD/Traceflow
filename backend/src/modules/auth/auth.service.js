import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { emailService } from '../../shared/email/index.js';
import { projectEventPublisher } from '../../shared/events/index.js';
import { authRepository } from './auth.repository.js';
import { normalizeUsername, passwordPolicyErrors, validateUsername } from './identity-policy.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const csrfForSession = (session) =>
  createHmac('sha256', Buffer.from(session.tokenHash, 'hex'))
    .update('traceflow:csrf:v1')
    .digest('base64url');
const publicUser = ({ passwordHash, sessionVersion: _sessionVersion, ...user }) => ({
  ...user,
  hasLocalPassword: Boolean(passwordHash)
});

function authError(message = 'Nome de usuário, e-mail ou senha inválidos.') {
  return new AppError({
    message,
    statusCode: 401,
    code: ERROR_CODES.INVALID_CREDENTIALS,
    exposeTechnicalDetails: true
  });
}

async function issueSession(user, rememberMe = false, { lastReauthenticatedAt = null } = {}) {
  const token = newToken();
  const tokenHash = hashToken(token);
  const csrfToken = csrfForSession({ tokenHash });
  const ttlMs = rememberMe ? env.persistentSessionTtlMs : env.sessionTtlMs;
  const expiresAt = new Date(Date.now() + ttlMs);
  const session = await authRepository.createSession({
    userId: user.id,
    tokenHash,
    csrfTokenHash: hashToken(csrfToken),
    sessionVersion: user.sessionVersion,
    expiresAt,
    rememberMe,
    lastReauthenticatedAt
  });
  return { session, token, csrfToken, expiresAt, ttlMs };
}

function ensurePasswordPolicy(password, user) {
  const errors = passwordPolicyErrors(password, user);
  if (errors.length) {
    throw new AppError({
      message: errors[0],
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      exposeTechnicalDetails: true
    });
  }
}

async function issueEmailVerification(user) {
  if (user.emailVerifiedAt) return { status: 'already_verified' };
  await authRepository.expireEmailVerificationTokens(user.id);
  const token = newToken();
  const expiresAt = new Date(Date.now() + env.emailVerificationTtlMs);
  await authRepository.createEmailVerificationToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt
  });
  const delivery = await emailService.sendEmailVerification({
    to: user.email,
    token,
    expiresAt,
    userId: user.id,
    name: user.name
  });
  return { ...delivery, ...(env.isTest ? { testToken: token } : {}) };
}

export const authService = {
  hashToken,
  publicUser,
  issueSession,
  async hashPassword(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
  },
  async register({ name, username, email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = normalizeUsername(username);
    if (
      !validateUsername(normalizedUsername).valid ||
      (await authRepository.findUserByEmail(normalizedEmail)) ||
      (await authRepository.findUserByUsername(normalizedUsername))
    ) {
      throw new AppError({
        message: 'Não foi possível criar a conta.',
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        exposeTechnicalDetails: true
      });
    }
    ensurePasswordPolicy(password, { username: normalizedUsername, email: normalizedEmail });
    let user;
    try {
      user = await authRepository.createUser({
        name: name.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash: await this.hashPassword(password)
      });
    } catch (error) {
      if (!authRepository.isUniqueViolation(error)) throw error;
      throw new AppError({
        message: 'Não foi possível criar a conta.',
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        exposeTechnicalDetails: true
      });
    }
    const session = await issueSession(user, false);
    const emailVerification = await issueEmailVerification(user);
    return { user: publicUser(user), ...session, emailVerification };
  },
  async login({ identifier, password, rememberMe = false }) {
    const normalized = identifier.trim().toLowerCase();
    const user = normalized.includes('@')
      ? await authRepository.findUserByEmail(normalized)
      : await authRepository.findUserByUsername(normalizeUsername(normalized));
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password)))
      throw authError();
    const accountStatus = user.accountStatus || (user.isActive ? 'ACTIVE' : 'DEACTIVATED');
    if (accountStatus === 'ANONYMIZED')
      throw new AppError({
        message: 'Não foi possível autenticar.',
        statusCode: 403,
        code: ERROR_CODES.ACCOUNT_ANONYMIZED,
        exposeTechnicalDetails: true
      });
    const updated = await authRepository.updateUser(user.id, { lastLoginAt: new Date() });
    return { user: publicUser(updated), ...(await issueSession(updated, rememberMe)) };
  },
  async authenticate(token) {
    if (!token) return null;
    const session = await authRepository.findSession(hashToken(token));
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      (session.user.accountStatus || (session.user.isActive ? 'ACTIVE' : 'DEACTIVATED')) ===
        'ANONYMIZED' ||
      session.sessionVersion !== session.user.sessionVersion
    )
      return null;
    void authRepository.touchSession(session.id, new Date()).catch(() => {});
    return { session, user: publicUser(session.user) };
  },
  async logout(sessionId) {
    if (sessionId) {
      await authRepository.revokeSession(sessionId);
      projectEventPublisher.disconnectSession(sessionId);
    }
  },
  verifyCsrf(session, supplied) {
    if (!supplied || typeof supplied !== 'string') return false;
    const expected = Buffer.from(csrfForSession(session));
    const actual = Buffer.from(supplied);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  },
  csrfToken(session) {
    return csrfForSession(session);
  },
  async forgotPassword(email) {
    const user = await authRepository.findUserByEmail(email.trim().toLowerCase());
    if (!user || user.accountStatus === 'ANONYMIZED') return null;
    await authRepository.expireResetTokens(user.id);
    const token = newToken();
    const expiresAt = new Date(Date.now() + env.passwordResetTtlMs);
    await authRepository.createResetToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt
    });
    await emailService.sendPasswordReset({ to: user.email, token, expiresAt, userId: user.id });
    return env.isTest ? token : null;
  },
  async resetPassword({ token, password }) {
    const record = await authRepository.findResetToken(hashToken(token));
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError({
        message: 'Token de recuperação inválido ou expirado.',
        statusCode: 400,
        code: ERROR_CODES.INVALID_CREDENTIALS,
        exposeTechnicalDetails: true
      });
    }
    if (record.user.accountStatus === 'ANONYMIZED') throw authError();
    ensurePasswordPolicy(password, record.user);
    await authRepository.updateUser(record.userId, {
      passwordHash: await this.hashPassword(password),
      mustSetPassword: false,
      sessionVersion: { increment: 1 }
    });
    await authRepository.useResetToken(record.id);
    await authRepository.revokeUserSessions(record.userId);
    projectEventPublisher.disconnectUser(record.userId);
  },
  async changePassword(userId, currentPassword, password) {
    const user = await authRepository.findUserById(userId);
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword)))
      throw new AppError({
        message: 'Senha atual inválida.',
        statusCode: 403,
        code: ERROR_CODES.CURRENT_PASSWORD_INVALID,
        exposeTechnicalDetails: true
      });
    ensurePasswordPolicy(password, user);
    await authRepository.changePassword(userId, await this.hashPassword(password));
    projectEventPublisher.disconnectUser(userId);
  },
  async verifyPassword(userId, password) {
    const user = await authRepository.findUserById(userId);
    return Boolean(user?.passwordHash && (await argon2.verify(user.passwordHash, password)));
  },
  resendEmailVerification(user) {
    return issueEmailVerification(user);
  },
  async verifyEmail(token) {
    const record = await authRepository.findEmailVerificationToken(hashToken(token));
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError({
        message: 'Token de verificação inválido, expirado ou já utilizado.',
        statusCode: 400,
        code: ERROR_CODES.INVALID_CREDENTIALS,
        exposeTechnicalDetails: true
      });
    }
    await authRepository.updateUser(record.userId, { emailVerifiedAt: new Date() });
    await authRepository.useEmailVerificationToken(record.id);
    await authRepository.expireEmailVerificationTokens(record.userId);
    return publicUser(await authRepository.findUserById(record.userId));
  },
  async updateUsername(userId, username) {
    const user = await authRepository.findUserById(userId);
    if (!user?.mustSetUsername) {
      throw new AppError({
        message: 'A definição inicial de username não está disponível para esta conta.',
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        exposeTechnicalDetails: true
      });
    }
    const result = validateUsername(username);
    if (!result.valid)
      throw new AppError({
        message: result.message,
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        exposeTechnicalDetails: true
      });
    const existing = await authRepository.findUserByUsername(result.username);
    if (existing && existing.id !== userId)
      throw new AppError({
        message: 'Este nome de usuário não está disponível.',
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        exposeTechnicalDetails: true
      });
    try {
      return publicUser(
        await authRepository.updateUser(userId, {
          username: result.username,
          mustSetUsername: false
        })
      );
    } catch (error) {
      if (!authRepository.isUniqueViolation(error)) throw error;
      throw new AppError({
        message: 'Este nome de usuário não está disponível.',
        statusCode: 409,
        code: ERROR_CODES.CONFLICT,
        exposeTechnicalDetails: true
      });
    }
  }
};
