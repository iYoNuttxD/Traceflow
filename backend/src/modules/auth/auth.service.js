import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { emailService } from '../../shared/email/index.js';
import { authRepository } from './auth.repository.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const publicUser = ({ passwordHash, sessionVersion, ...user }) => user;

function authError(message = 'E-mail ou senha inválidos.') {
  return new AppError({ message, statusCode: 401, code: ERROR_CODES.INVALID_CREDENTIALS, exposeTechnicalDetails: true });
}

async function issueSession(user) {
  const token = newToken();
  const csrfToken = newToken();
  const expiresAt = new Date(Date.now() + env.sessionTtlMs);
  const session = await authRepository.createSession({
    userId: user.id, tokenHash: hashToken(token), csrfTokenHash: hashToken(csrfToken),
    sessionVersion: user.sessionVersion, expiresAt
  });
  return { session, token, csrfToken, expiresAt };
}

export const authService = {
  hashToken,
  async hashPassword(password) {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  },
  async register({ name, email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    if (await authRepository.findUserByEmail(normalizedEmail)) {
      throw new AppError({ message: 'Não foi possível criar a conta.', statusCode: 409, code: ERROR_CODES.CONFLICT, exposeTechnicalDetails: true });
    }
    const user = await authRepository.createUser({ name: name.trim(), email: normalizedEmail, passwordHash: await this.hashPassword(password) });
    return { user: publicUser(user), ...(await issueSession(user)) };
  },
  async login({ email, password }) {
    const user = await authRepository.findUserByEmail(email.trim().toLowerCase());
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) throw authError();
    if (!user.isActive) throw new AppError({ message: 'Conta desativada.', statusCode: 403, code: ERROR_CODES.ACCOUNT_DISABLED, exposeTechnicalDetails: true });
    const updated = await authRepository.updateUser(user.id, { lastLoginAt: new Date() });
    return { user: publicUser(updated), ...(await issueSession(updated)) };
  },
  async authenticate(token) {
    if (!token) return null;
    const session = await authRepository.findSession(hashToken(token));
    if (!session || session.revokedAt || session.expiresAt <= new Date() ||
      !session.user.isActive || session.sessionVersion !== session.user.sessionVersion) return null;
    void authRepository.touchSession(session.id, new Date()).catch(() => {});
    return { session, user: publicUser(session.user) };
  },
  async logout(sessionId) { if (sessionId) await authRepository.revokeSession(sessionId); },
  verifyCsrf(session, supplied) {
    if (!supplied || typeof supplied !== 'string') return false;
    const expected = Buffer.from(session.csrfTokenHash, 'hex');
    const actual = Buffer.from(hashToken(supplied), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  },
  async rotateCsrf(sessionId) {
    const csrfToken = newToken();
    await authRepository.updateSessionCsrf(sessionId, hashToken(csrfToken));
    return csrfToken;
  },
  async forgotPassword(email) {
    const user = await authRepository.findUserByEmail(email.trim().toLowerCase());
    if (!user?.isActive) return null;
    await authRepository.expireResetTokens(user.id);
    const token = newToken();
    const expiresAt = new Date(Date.now() + env.passwordResetTtlMs);
    await authRepository.createResetToken({ userId: user.id, tokenHash: hashToken(token), expiresAt });
    await emailService.sendPasswordReset({ to: user.email, token, expiresAt, userId: user.id });
    return env.isTest ? token : null;
  },
  async resetPassword({ token, password }) {
    const record = await authRepository.findResetToken(hashToken(token));
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError({ message: 'Token de recuperação inválido ou expirado.', statusCode: 400, code: ERROR_CODES.INVALID_CREDENTIALS, exposeTechnicalDetails: true });
    }
    await authRepository.updateUser(record.userId, { passwordHash: await this.hashPassword(password), mustSetPassword: false, sessionVersion: { increment: 1 } });
    await authRepository.useResetToken(record.id);
    await authRepository.revokeUserSessions(record.userId);
  },
  async changePassword(userId, currentPassword, password) {
    const user = await authRepository.findUserById(userId);
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) throw authError('Senha atual inválida.');
    await authRepository.updateUser(userId, { passwordHash: await this.hashPassword(password), sessionVersion: { increment: 1 } });
    await authRepository.revokeUserSessions(userId);
  },
  async verifyPassword(userId, password) {
    const user = await authRepository.findUserById(userId);
    return Boolean(user?.passwordHash && await argon2.verify(user.passwordHash, password));
  }
};
