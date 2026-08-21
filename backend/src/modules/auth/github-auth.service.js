import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { fingerprintGithubUserId } from '../../shared/security/pseudonymization.js';
import { githubAppCredentialProvider } from '../github/github-credential.provider.js';
import { authService } from './auth.service.js';
import { githubAuthRepository } from './github-auth.repository.js';
import { normalizeUsername, validateUsername } from './identity-policy.js';

const hashToken = (value) => createHash('sha256').update(value).digest('hex');
const internalOrigin = 'https://traceflow.invalid';
const oauthError = (message, statusCode, code) =>
  new AppError({ message, statusCode, code, exposeTechnicalDetails: true });

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sanitizeInternalReturnTo(value, fallback = '/projects') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 191) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  const hasControlCharacter = (candidate) =>
    [...candidate].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  const hasDotSegment = (candidate) =>
    candidate
      .split(/[?#]/, 1)[0]
      .split('/')
      .some((segment) => segment === '.' || segment === '..');
  if (hasControlCharacter(value) || hasDotSegment(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      hasControlCharacter(decoded) ||
      hasDotSegment(decoded)
    )
      return fallback;
    const parsed = new URL(value, internalOrigin);
    if (
      parsed.origin !== internalOrigin ||
      !parsed.pathname.startsWith('/') ||
      parsed.pathname.startsWith('//') ||
      parsed.pathname.includes('\\')
    )
      return fallback;
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.includes('\\'))
      return fallback;
    const reparsed = new URL(normalized, internalOrigin);
    return reparsed.origin === internalOrigin &&
      `${reparsed.pathname}${reparsed.search}${reparsed.hash}` === normalized
      ? normalized
      : fallback;
  } catch {
    return fallback;
  }
}

function parseBrowserCookie(value) {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf('.');
  if (separator < 32) return null;
  const state = value.slice(0, separator);
  const codeVerifier = value.slice(separator + 1);
  if (state.length > 128 || codeVerifier.length < 43 || codeVerifier.length > 128) return null;
  return { state, codeVerifier };
}

function assertConfigured() {
  if (!env.githubAppConfigured || !env.githubLoginCallbackUrl) {
    throw oauthError('Login com GitHub indisponível.', 503, ERROR_CODES.GITHUB_LOGIN_UNAVAILABLE);
  }
}

async function createState({ purpose, userId, sessionId, rememberMe = false, returnTo }) {
  assertConfigured();
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(64).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  await githubAuthRepository.createOAuthState({
    tokenHash: hashToken(state),
    purpose,
    userId: userId || null,
    sessionId: sessionId || null,
    rememberMe,
    returnTo: sanitizeInternalReturnTo(returnTo),
    expiresAt: new Date(Date.now() + env.githubOAuthStateTtlMs)
  });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.githubAppClientId);
  url.searchParams.set('redirect_uri', env.githubLoginCallbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return {
    url: url.toString(),
    browserCookie: `${state}.${codeVerifier}`,
    expiresInMs: env.githubOAuthStateTtlMs
  };
}

function validSessionState(record, now) {
  const allowedAccountStates =
    record.purpose === 'REAUTH_SENSITIVE_ACTION'
      ? new Set(['ACTIVE', 'DELETION_PENDING'])
      : new Set(['ACTIVE']);
  return Boolean(
    record.user &&
    record.session &&
    record.userId === record.session.userId &&
    allowedAccountStates.has(record.user.accountStatus) &&
    !record.session.revokedAt &&
    record.session.expiresAt > now &&
    record.session.sessionVersion === record.user.sessionVersion
  );
}

async function availableUsername(githubLogin) {
  const normalized = normalizeUsername(githubLogin);
  if (
    validateUsername(normalized).valid &&
    !(await githubAuthRepository.findUserByUsername(normalized))
  ) {
    return { username: normalized, mustSetUsername: false };
  }
  const cleaned = normalized.replace(/[^a-z0-9]/g, '').slice(0, 20);
  const base = cleaned.length >= 3 ? cleaned : 'user';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base.slice(0, 21)}-${randomBytes(4).toString('hex')}`;
    if (
      validateUsername(candidate).valid &&
      !(await githubAuthRepository.findUserByUsername(candidate))
    ) {
      return { username: candidate, mustSetUsername: true };
    }
  }
  throw oauthError('Não foi possível criar a conta.', 409, ERROR_CODES.CONFLICT);
}

function assertGithubProfile(profile) {
  const githubUserId = profile?.id == null ? '' : String(profile.id);
  const githubLogin = typeof profile?.login === 'string' ? profile.login.trim() : '';
  if (!/^\d+$/.test(githubUserId) || !githubLogin || githubLogin.length > 191) {
    throw oauthError('Resposta inválida do GitHub.', 502, ERROR_CODES.GITHUB_OAUTH_FAILED);
  }
  return { githubUserId, githubLogin };
}

async function loginWithIdentity(identity, githubLogin, now, rememberMe) {
  if (identity.user.accountStatus === 'ANONYMIZED') {
    throw oauthError('Não foi possível autenticar.', 403, ERROR_CODES.ACCOUNT_ANONYMIZED);
  }
  const refreshed = await githubAuthRepository.refreshIdentity(identity.id, githubLogin, now);
  const user = refreshed.user;
  return {
    user: authService.publicUser(user),
    ...(await authService.issueSession(user, rememberMe, { lastReauthenticatedAt: now })),
    accountCreated: false
  };
}

async function createGithubAccount({ token, profile, githubUserId, githubLogin, now, rememberMe }) {
  const githubEmail = await githubAppCredentialProvider.getPrimaryVerifiedEmail(token);
  const email = typeof githubEmail === 'string' ? githubEmail.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw oauthError(
      'Não foi possível criar a conta porque sua conta GitHub não possui um e-mail principal verificado disponível.',
      422,
      ERROR_CODES.GITHUB_VERIFIED_EMAIL_REQUIRED
    );
  }
  if (await githubAuthRepository.findIdentityTombstone(fingerprintGithubUserId(githubUserId))) {
    throw oauthError('Não foi possível autenticar.', 403, ERROR_CODES.ACCOUNT_ANONYMIZED);
  }
  const emailConflict = () =>
    oauthError(
      'Já existe uma conta TraceFlow associada a este endereço. Entre com sua conta atual e vincule o GitHub em Configurações.',
      409,
      ERROR_CODES.GITHUB_EMAIL_ACCOUNT_CONFLICT
    );
  if (await githubAuthRepository.findUserByEmail(email)) throw emailConflict();
  let username = await availableUsername(githubLogin);
  const profileName = typeof profile.name === 'string' ? profile.name.trim() : '';
  const name = profileName && profileName.length <= 120 ? profileName : githubLogin.slice(0, 120);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await githubAuthRepository.createGithubAccount({
        user: {
          name,
          username: username.username,
          mustSetUsername: username.mustSetUsername,
          email,
          emailVerifiedAt: now,
          passwordHash: null,
          lastLoginAt: now
        },
        identity: { githubUserId, githubLogin, lastAuthenticatedAt: now }
      });
      return {
        user: authService.publicUser(created.user),
        ...(await authService.issueSession(created.user, rememberMe, {
          lastReauthenticatedAt: now
        })),
        accountCreated: true
      };
    } catch (error) {
      if (!githubAuthRepository.isUniqueViolation(error)) throw error;
      const racedIdentity = await githubAuthRepository.findIdentityByGithubUserId(githubUserId);
      if (racedIdentity) return loginWithIdentity(racedIdentity, githubLogin, now, rememberMe);
      if (await githubAuthRepository.findUserByEmail(email)) throw emailConflict();
      username = await availableUsername(githubLogin);
    }
  }
  throw oauthError('Não foi possível criar a conta.', 409, ERROR_CODES.CONFLICT);
}

export const githubAuthService = {
  sanitizeInternalReturnTo,
  startLogin({ rememberMe = false, returnTo }) {
    return createState({ purpose: 'LOGIN', rememberMe, returnTo });
  },
  async startLink({ user, session, password }) {
    if (user.accountStatus !== 'ACTIVE')
      throw oauthError('A conta precisa estar ativa.', 403, ERROR_CODES.ACCOUNT_NOT_ACTIVE);
    if (!user.emailVerifiedAt)
      throw oauthError(
        'Verifique seu e-mail antes de vincular o GitHub.',
        403,
        ERROR_CODES.FORBIDDEN
      );
    if (!(await authService.verifyPassword(user.id, password)))
      throw oauthError('Senha atual inválida.', 403, ERROR_CODES.CURRENT_PASSWORD_INVALID);
    if (await githubAuthRepository.findIdentityByUserId(user.id))
      throw oauthError(
        'Uma conta GitHub já está vinculada.',
        409,
        ERROR_CODES.GITHUB_IDENTITY_ALREADY_EXISTS
      );
    return createState({
      purpose: 'LINK_IDENTITY',
      userId: user.id,
      sessionId: session.id,
      returnTo: '/settings/integrations'
    });
  },
  async startSensitiveReauthentication({ user, session }, { returnTo } = {}) {
    if (!['ACTIVE', 'DELETION_PENDING'].includes(user.accountStatus))
      throw oauthError('A conta precisa estar ativa.', 403, ERROR_CODES.ACCOUNT_NOT_ACTIVE);
    if (user.hasLocalPassword)
      throw oauthError('A senha local já foi cadastrada.', 409, ERROR_CODES.PASSWORD_ALREADY_SET);
    if (!(await githubAuthRepository.findIdentityByUserId(user.id)))
      throw oauthError(
        'Nenhuma conta GitHub vinculada.',
        409,
        ERROR_CODES.GITHUB_IDENTITY_NOT_LINKED
      );
    return createState({
      purpose: 'REAUTH_SENSITIVE_ACTION',
      userId: user.id,
      sessionId: session.id,
      returnTo: sanitizeInternalReturnTo(returnTo, '/settings/security')
    });
  },
  async completeCallback({ code, state, browserCookie }) {
    let step = 'validate_state';
    let purpose = 'UNKNOWN';
    let oauthReturnTo = '/settings/security';
    try {
      assertConfigured();
      if (typeof code !== 'string' || !code || code.length > 512 || typeof state !== 'string') {
        throw oauthError('Callback GitHub inválido.', 400, ERROR_CODES.GITHUB_OAUTH_STATE_INVALID);
      }
      const browser = parseBrowserCookie(browserCookie);
      if (!browser || !safeEqual(browser.state, state)) {
        throw oauthError('Estado OAuth inválido.', 400, ERROR_CODES.GITHUB_OAUTH_STATE_INVALID);
      }
      const now = new Date();
      const record = await githubAuthRepository.findOAuthState(hashToken(state));
      if (!record || record.usedAt) {
        throw oauthError('Estado OAuth inválido.', 400, ERROR_CODES.GITHUB_OAUTH_STATE_INVALID);
      }
      purpose = record.purpose;
      oauthReturnTo = sanitizeInternalReturnTo(record.returnTo, '/settings/security');
      if (record.expiresAt <= now) {
        throw oauthError('Estado OAuth expirado.', 400, ERROR_CODES.GITHUB_OAUTH_STATE_EXPIRED);
      }
      if (record.purpose !== 'LOGIN' && !validSessionState(record, now)) {
        throw oauthError(
          'Sessão do fluxo OAuth inválida.',
          401,
          ERROR_CODES.GITHUB_OAUTH_STATE_INVALID
        );
      }
      const consumed = await githubAuthRepository.consumeOAuthState(record.id, now);
      if (consumed.count !== 1) {
        throw oauthError('Estado OAuth inválido.', 400, ERROR_CODES.GITHUB_OAUTH_STATE_INVALID);
      }
      step = 'exchange_code';
      const token = await githubAppCredentialProvider.exchangeLoginUserCode({
        code,
        codeVerifier: browser.codeVerifier
      });
      step = 'fetch_user';
      const profile = await githubAppCredentialProvider.getAuthenticatedUser(token);
      const { githubUserId, githubLogin } = assertGithubProfile(profile);
      if (await githubAuthRepository.findIdentityTombstone(fingerprintGithubUserId(githubUserId))) {
        throw oauthError('Não foi possível autenticar.', 403, ERROR_CODES.ACCOUNT_ANONYMIZED);
      }

      if (record.purpose === 'LOGIN') {
        step = 'resolve_identity';
        const identity = await githubAuthRepository.findIdentityByGithubUserId(githubUserId);
        const login = identity
          ? await loginWithIdentity(identity, githubLogin, now, record.rememberMe)
          : await createGithubAccount({
              token,
              profile,
              githubUserId,
              githubLogin,
              now,
              rememberMe: record.rememberMe
            });
        return {
          purpose: record.purpose,
          returnTo: sanitizeInternalReturnTo(record.returnTo),
          ...login
        };
      }

      if (record.purpose === 'LINK_IDENTITY') {
        step = 'link_identity';
        let linked;
        try {
          linked = await githubAuthRepository.linkIdentity({
            userId: record.userId,
            githubUserId,
            githubLogin,
            now
          });
        } catch (error) {
          if (!githubAuthRepository.isUniqueViolation(error)) throw error;
          throw oauthError(
            'Esta conta GitHub já está vinculada.',
            409,
            ERROR_CODES.GITHUB_IDENTITY_ALREADY_LINKED
          );
        }
        if (linked.status === 'linked')
          throw oauthError(
            'Esta conta GitHub já está vinculada.',
            409,
            ERROR_CODES.GITHUB_IDENTITY_ALREADY_LINKED
          );
        if (linked.status === 'exists')
          throw oauthError(
            'Uma conta GitHub já está vinculada.',
            409,
            ERROR_CODES.GITHUB_IDENTITY_ALREADY_EXISTS
          );
        return {
          purpose: record.purpose,
          userId: record.userId,
          returnTo: sanitizeInternalReturnTo(record.returnTo, '/settings/integrations')
        };
      }

      const identity = await githubAuthRepository.findIdentityByUserId(record.userId);
      if (!identity || identity.githubUserId !== githubUserId) {
        throw oauthError(
          'A conta GitHub não corresponde à identidade vinculada.',
          403,
          ERROR_CODES.GITHUB_IDENTITY_MISMATCH
        );
      }
      const updated = await githubAuthRepository.markSensitiveReauthenticated(
        record.sessionId,
        record.userId,
        githubUserId,
        now
      );
      if (updated.count !== 1)
        throw oauthError('Reautenticação inválida.', 401, ERROR_CODES.GITHUB_OAUTH_STATE_INVALID);
      return {
        purpose: record.purpose,
        userId: record.userId,
        returnTo: sanitizeInternalReturnTo(record.returnTo, '/settings/security')
      };
    } catch (error) {
      logger.warn('Fluxo de autenticação GitHub interrompido.', {
        event: 'github_auth_failed',
        step,
        purpose,
        errorCode: error.code || ERROR_CODES.GITHUB_OAUTH_FAILED
      });
      if (error.code === ERROR_CODES.GITHUB_AUTH_FAILED) {
        const normalized = oauthError(
          'Não foi possível concluir a autenticação GitHub.',
          502,
          ERROR_CODES.GITHUB_OAUTH_FAILED
        );
        normalized.oauthPurpose = purpose;
        throw normalized;
      }
      if (error instanceof AppError) {
        error.oauthPurpose = purpose;
        error.oauthReturnTo = oauthReturnTo;
        throw error;
      }
      throw oauthError(
        'Não foi possível concluir a autenticação GitHub.',
        502,
        ERROR_CODES.GITHUB_OAUTH_FAILED
      );
    }
  },
  identity(userId) {
    return githubAuthRepository.findIdentityByUserId(userId);
  }
};
