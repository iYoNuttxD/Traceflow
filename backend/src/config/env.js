import dotenv from 'dotenv';
import { Buffer } from 'node:buffer';
import { ConfigurationError } from '../shared/errors/index.js';

dotenv.config();

const allowedEnvironments = new Set(['development', 'test', 'production']);
const allowedRateLimitProfiles = new Set(['development', 'production']);
const allowedCorsMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

function parsePort(value) {
  const port = value === undefined || value === '' ? 3001 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('Configuração inválida: PORT deve ser um número entre 1 e 65535.');
  }
  return port;
}

function parseUrl(value, key, { protocol } = {}) {
  if (!value) throw new ConfigurationError(`Configuração obrigatória ausente: ${key}.`);
  try {
    const parsed = new URL(value);
    if (protocol && parsed.protocol !== protocol) throw new Error('invalid protocol');
    return value;
  } catch {
    throw new ConfigurationError(`Configuração inválida: ${key} deve ser uma URL válida.`);
  }
}

function parseInteger(value, key, { defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = value === undefined || value === '' ? defaultValue : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ConfigurationError(
      `Configuração inválida: ${key} deve ser um número inteiro entre ${min} e ${max}.`
    );
  }
  return parsed;
}

function parseCsv(value, fallback = []) {
  const source = value === undefined || value === '' ? fallback : String(value).split(',');
  return [...new Set(source.map((item) => item.trim()).filter(Boolean))];
}

function parseCorsOrigins(source, nodeEnv, frontendUrl) {
  const fallback =
    nodeEnv === 'production'
      ? []
      : nodeEnv === 'test'
        ? ['http://frontend.test']
        : [frontendUrl, 'http://localhost:5173'];
  const origins = parseCsv(source.CORS_ALLOWED_ORIGINS, fallback);

  if (nodeEnv === 'production' && origins.length === 0) {
    throw new ConfigurationError(
      'Configuração obrigatória ausente: CORS_ALLOWED_ORIGINS em produção.'
    );
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new ConfigurationError(
        'Configuração inválida: CORS_ALLOWED_ORIGINS não aceita wildcard.'
      );
    }
    const parsed = parseUrl(origin, 'CORS_ALLOWED_ORIGINS');
    if (!['http:', 'https:'].includes(new URL(parsed).protocol)) {
      throw new ConfigurationError(
        'Configuração inválida: CORS_ALLOWED_ORIGINS aceita somente HTTP(S).'
      );
    }
  }

  return origins;
}

function parseCorsMethods(value) {
  const methods = parseCsv(value, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).map(
    (method) => method.toUpperCase()
  );
  if (methods.length === 0 || methods.some((method) => !allowedCorsMethods.has(method))) {
    throw new ConfigurationError(
      'Configuração inválida: CORS_ALLOWED_METHODS contém método não permitido.'
    );
  }
  return methods;
}

function parseCorsHeaders(value) {
  const headers = parseCsv(value, ['Content-Type', 'X-Request-Id', 'X-CSRF-Token']);
  if (headers.length === 0 || headers.some((header) => !/^[A-Za-z0-9-]+$/.test(header))) {
    throw new ConfigurationError(
      'Configuração inválida: CORS_ALLOWED_HEADERS contém header inválido.'
    );
  }
  return headers;
}

function parseBodyLimit(value) {
  const bodyLimit = value || '100kb';
  const match = /^(\d+)(b|kb|mb)$/i.exec(bodyLimit);
  if (!match) {
    throw new ConfigurationError('Configuração inválida: BODY_LIMIT deve usar b, kb ou mb.');
  }
  const bytes = Number(match[1]) * { b: 1, kb: 1024, mb: 1024 * 1024 }[match[2].toLowerCase()];
  if (bytes < 1024 || bytes > 10 * 1024 * 1024) {
    throw new ConfigurationError('Configuração inválida: BODY_LIMIT deve estar entre 1kb e 10mb.');
  }
  return bodyLimit.toLowerCase();
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') {
    throw new ConfigurationError(
      'Configuração inválida: TRUST_PROXY não pode ser true irrestrito.'
    );
  }
  if (/^\d+$/.test(value)) {
    return parseInteger(value, 'TRUST_PROXY', { min: 1, max: 10 });
  }
  if (['loopback', 'linklocal', 'uniquelocal'].includes(value)) return value;
  throw new ConfigurationError(
    'Configuração inválida: TRUST_PROXY deve ser false, um número de saltos ou uma faixa confiável.'
  );
}

function parseSameSite(value) {
  const normalized = (value || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(normalized)) {
    throw new ConfigurationError(
      'Configuração inválida: SESSION_COOKIE_SAME_SITE deve ser lax, strict ou none.'
    );
  }
  return normalized;
}

function parseBoolean(value, key, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError(`Configuração inválida: ${key} deve ser true ou false.`);
}

function parsePrivacyPseudonymizationKey(source, nodeEnv) {
  const value =
    source.PRIVACY_PSEUDONYMIZATION_KEY ||
    (nodeEnv === 'production' ? undefined : 'traceflow-nonproduction-pseudonymization-key');
  if (!value) {
    throw new ConfigurationError('Configuração obrigatória ausente: PRIVACY_PSEUDONYMIZATION_KEY.');
  }
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new ConfigurationError(
      'Configuração inválida: PRIVACY_PSEUDONYMIZATION_KEY deve possuir ao menos 32 bytes.'
    );
  }
  return value;
}

function parseEmailConfiguration(source, nodeEnv) {
  const provider = source.EMAIL_PROVIDER || (nodeEnv === 'production' ? 'smtp' : 'capture');
  if (!['capture', 'smtp'].includes(provider)) {
    throw new ConfigurationError('Configuração inválida: EMAIL_PROVIDER deve ser capture ou smtp.');
  }
  if (nodeEnv === 'production' && provider !== 'smtp') {
    throw new ConfigurationError(
      'Configuração inválida: EMAIL_PROVIDER deve ser smtp em produção.'
    );
  }
  const from =
    source.EMAIL_FROM || (provider === 'capture' ? 'no-reply@traceflow.test' : undefined);
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    throw new ConfigurationError('Configuração inválida: EMAIL_FROM deve ser um e-mail válido.');
  }
  if (provider === 'smtp') {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
      if (!source[key]) throw new ConfigurationError(`Configuração obrigatória ausente: ${key}.`);
    }
  }
  return {
    emailProvider: provider,
    emailFrom: from,
    smtpHost: source.SMTP_HOST,
    smtpPort: parseInteger(source.SMTP_PORT, 'SMTP_PORT', {
      defaultValue: 587,
      min: 1,
      max: 65535
    }),
    smtpSecure: parseBoolean(source.SMTP_SECURE, 'SMTP_SECURE', false),
    smtpUser: source.SMTP_USER,
    smtpPassword: source.SMTP_PASSWORD,
    passwordResetUrl: parseUrl(
      source.PASSWORD_RESET_URL || 'http://localhost:5173/reset-password',
      'PASSWORD_RESET_URL'
    ),
    invitationAcceptUrl: parseUrl(
      source.INVITATION_ACCEPT_URL || 'http://localhost:5173/invitations/accept',
      'INVITATION_ACCEPT_URL'
    ),
    emailVerificationUrl: parseUrl(
      source.EMAIL_VERIFICATION_URL || 'http://localhost:5173/verify-email',
      'EMAIL_VERIFICATION_URL'
    ),
    emailChangeUrl: parseUrl(
      source.EMAIL_CHANGE_CONFIRM_URL ||
        'http://localhost:5173/settings/account/email-change/confirm',
      'EMAIL_CHANGE_CONFIRM_URL'
    ),
    accountReactivationUrl: parseUrl(
      source.ACCOUNT_REACTIVATION_URL || 'http://localhost:5173/account/reactivation/confirm',
      'ACCOUNT_REACTIVATION_URL'
    )
  };
}

function parseGithubAppConfiguration(source, nodeEnv) {
  const keys = [
    'GITHUB_APP_ID',
    'GITHUB_APP_CLIENT_ID',
    'GITHUB_APP_CLIENT_SECRET',
    'GITHUB_APP_SLUG',
    'GITHUB_APP_PRIVATE_KEY_BASE64',
    'GITHUB_APP_WEBHOOK_SECRET',
    'GITHUB_APP_CALLBACK_URL',
    'GITHUB_APP_FRONTEND_SUCCESS_URL',
    'GITHUB_APP_FRONTEND_ERROR_URL'
  ];
  const present = keys.filter((key) => source[key]);
  if (present.length > 0 && present.length !== keys.length) {
    const missing = keys.filter((key) => !source[key]).join(', ');
    throw new ConfigurationError(`Configuração GitHub App incompleta. Ausentes: ${missing}.`);
  }
  if (nodeEnv === 'production' && present.length === 0) {
    throw new ConfigurationError('Configuração obrigatória ausente: credenciais da GitHub App.');
  }
  if (present.length === 0) return { githubAppConfigured: false };
  const githubLoginCallbackUrl =
    source.GITHUB_LOGIN_CALLBACK_URL ||
    (nodeEnv === 'production' ? undefined : 'http://localhost:3001/api/auth/github/callback');
  const parsedGithubLoginCallbackUrl = parseUrl(
    githubLoginCallbackUrl,
    'GITHUB_LOGIN_CALLBACK_URL'
  );
  if (nodeEnv === 'production' && new URL(parsedGithubLoginCallbackUrl).protocol !== 'https:') {
    throw new ConfigurationError(
      'Configuração inválida: GITHUB_LOGIN_CALLBACK_URL deve usar HTTPS em produção.'
    );
  }
  return {
    githubAppConfigured: true,
    githubAppId: String(source.GITHUB_APP_ID),
    githubAppClientId: source.GITHUB_APP_CLIENT_ID,
    githubAppClientSecret: source.GITHUB_APP_CLIENT_SECRET,
    githubAppSlug: source.GITHUB_APP_SLUG,
    githubAppPrivateKeyBase64: source.GITHUB_APP_PRIVATE_KEY_BASE64,
    githubAppWebhookSecret: source.GITHUB_APP_WEBHOOK_SECRET,
    githubAppCallbackUrl: parseUrl(source.GITHUB_APP_CALLBACK_URL, 'GITHUB_APP_CALLBACK_URL'),
    githubAppFrontendSuccessUrl: parseUrl(
      source.GITHUB_APP_FRONTEND_SUCCESS_URL,
      'GITHUB_APP_FRONTEND_SUCCESS_URL'
    ),
    githubAppFrontendErrorUrl: parseUrl(
      source.GITHUB_APP_FRONTEND_ERROR_URL,
      'GITHUB_APP_FRONTEND_ERROR_URL'
    ),
    githubLoginCallbackUrl: parsedGithubLoginCallbackUrl
  };
}

export function createEnvironment(source = {}) {
  const nodeEnv = source.NODE_ENV || 'development';
  if (!allowedEnvironments.has(nodeEnv)) {
    throw new ConfigurationError(
      'Configuração inválida: NODE_ENV deve ser development, test ou production.'
    );
  }

  const testDatabaseUrl = source.TEST_DATABASE_URL
    ? parseUrl(source.TEST_DATABASE_URL, 'TEST_DATABASE_URL', { protocol: 'mysql:' })
    : undefined;
  const databaseSource =
    nodeEnv === 'test' && testDatabaseUrl ? testDatabaseUrl : source.DATABASE_URL;
  const databaseUrl = parseUrl(databaseSource, 'DATABASE_URL', { protocol: 'mysql:' });
  const frontendUrl = parseUrl(source.FRONTEND_URL || 'http://localhost:5173', 'FRONTEND_URL');

  const corsAllowedOrigins = parseCorsOrigins(source, nodeEnv, frontendUrl);
  const emailConfiguration = parseEmailConfiguration(source, nodeEnv);
  const githubAppConfiguration = parseGithubAppConfiguration(source, nodeEnv);
  const rateLimitProfile =
    source.RATE_LIMIT_PROFILE || (nodeEnv === 'production' ? 'production' : 'development');
  if (!allowedRateLimitProfiles.has(rateLimitProfile)) {
    throw new ConfigurationError(
      'Configuração inválida: RATE_LIMIT_PROFILE deve ser development ou production.'
    );
  }
  const developmentRateLimits = rateLimitProfile === 'development';

  return Object.freeze({
    nodeEnv,
    port: parsePort(source.PORT),
    databaseUrl,
    testDatabaseUrl,
    ...githubAppConfiguration,
    privacyPseudonymizationKey: parsePrivacyPseudonymizationKey(source, nodeEnv),
    frontendUrl,
    bodyLimit: parseBodyLimit(source.BODY_LIMIT),
    corsAllowedOrigins: Object.freeze(corsAllowedOrigins),
    corsAllowedMethods: Object.freeze(parseCorsMethods(source.CORS_ALLOWED_METHODS)),
    corsAllowedHeaders: Object.freeze(parseCorsHeaders(source.CORS_ALLOWED_HEADERS)),
    rateLimitWindowMs: parseInteger(source.RATE_LIMIT_WINDOW_MS, 'RATE_LIMIT_WINDOW_MS', {
      defaultValue: 15 * 60 * 1000,
      min: 1000,
      max: 24 * 60 * 60 * 1000
    }),
    rateLimitMax: parseInteger(source.RATE_LIMIT_MAX, 'RATE_LIMIT_MAX', {
      defaultValue: nodeEnv === 'test' ? 1000 : 200,
      min: 1,
      max: 100000
    }),
    sensitiveRateLimitMax: parseInteger(
      source.SENSITIVE_RATE_LIMIT_MAX,
      'SENSITIVE_RATE_LIMIT_MAX',
      { defaultValue: nodeEnv === 'test' ? 1000 : 20, min: 1, max: 10000 }
    ),
    rateLimitProfile,
    rateLimitGlobalWindowMs: parseInteger(
      source.RATE_LIMIT_GLOBAL_WINDOW_MS,
      'RATE_LIMIT_GLOBAL_WINDOW_MS',
      { defaultValue: 60_000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitGlobalMax: parseInteger(source.RATE_LIMIT_GLOBAL_MAX, 'RATE_LIMIT_GLOBAL_MAX', {
      defaultValue: developmentRateLimits ? 4000 : 1000,
      min: 1,
      max: 100000
    }),
    rateLimitReadBurstWindowMs: parseInteger(
      source.RATE_LIMIT_READ_BURST_WINDOW_MS,
      'RATE_LIMIT_READ_BURST_WINDOW_MS',
      { defaultValue: 10_000, min: 1000, max: 60 * 60 * 1000 }
    ),
    rateLimitReadBurstMax: parseInteger(
      source.RATE_LIMIT_READ_BURST_MAX,
      'RATE_LIMIT_READ_BURST_MAX',
      { defaultValue: developmentRateLimits ? 120 : 60, min: 1, max: 100000 }
    ),
    rateLimitReadWindowMs: parseInteger(
      source.RATE_LIMIT_READ_WINDOW_MS,
      'RATE_LIMIT_READ_WINDOW_MS',
      { defaultValue: 5 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitReadMax: parseInteger(source.RATE_LIMIT_READ_MAX, 'RATE_LIMIT_READ_MAX', {
      defaultValue: developmentRateLimits ? 1200 : 600,
      min: 1,
      max: 100000
    }),
    rateLimitAuthWindowMs: parseInteger(
      source.RATE_LIMIT_AUTH_WINDOW_MS,
      'RATE_LIMIT_AUTH_WINDOW_MS',
      { defaultValue: 15 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitAuthMax: parseInteger(source.RATE_LIMIT_AUTH_MAX, 'RATE_LIMIT_AUTH_MAX', {
      defaultValue: nodeEnv === 'test' ? 1000 : 20,
      min: 1,
      max: 10000
    }),
    rateLimitEmailWindowMs: parseInteger(
      source.RATE_LIMIT_EMAIL_WINDOW_MS,
      'RATE_LIMIT_EMAIL_WINDOW_MS',
      { defaultValue: 60 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitEmailMax: parseInteger(source.RATE_LIMIT_EMAIL_MAX, 'RATE_LIMIT_EMAIL_MAX', {
      defaultValue: nodeEnv === 'test' ? 1000 : 5,
      min: 1,
      max: 10000
    }),
    rateLimitSensitiveWindowMs: parseInteger(
      source.RATE_LIMIT_SENSITIVE_WINDOW_MS,
      'RATE_LIMIT_SENSITIVE_WINDOW_MS',
      { defaultValue: 15 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitSensitiveMax: parseInteger(
      source.RATE_LIMIT_SENSITIVE_MAX,
      'RATE_LIMIT_SENSITIVE_MAX',
      { defaultValue: nodeEnv === 'test' ? 1000 : 20, min: 1, max: 10000 }
    ),
    rateLimitExportWindowMs: parseInteger(
      source.RATE_LIMIT_EXPORT_WINDOW_MS,
      'RATE_LIMIT_EXPORT_WINDOW_MS',
      { defaultValue: 60 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }
    ),
    rateLimitExportMax: parseInteger(source.RATE_LIMIT_EXPORT_MAX, 'RATE_LIMIT_EXPORT_MAX', {
      defaultValue: nodeEnv === 'test' ? 1000 : 3,
      min: 1,
      max: 1000
    }),
    githubRequestTimeoutMs: parseInteger(
      source.GITHUB_REQUEST_TIMEOUT_MS,
      'GITHUB_REQUEST_TIMEOUT_MS',
      { defaultValue: 15000, min: 1000, max: 120000 }
    ),
    githubRetryMax: parseInteger(source.GITHUB_RETRY_MAX, 'GITHUB_RETRY_MAX', {
      defaultValue: 2,
      min: 0,
      max: 5
    }),
    githubRetryMaxDelayMs: parseInteger(
      source.GITHUB_RETRY_MAX_DELAY_MS,
      'GITHUB_RETRY_MAX_DELAY_MS',
      { defaultValue: 60 * 1000, min: 1000, max: 5 * 60 * 1000 }
    ),
    sessionTtlMs: parseInteger(source.SESSION_TTL_MS, 'SESSION_TTL_MS', {
      defaultValue: 8 * 60 * 60 * 1000,
      min: 5 * 60 * 1000,
      max: 30 * 24 * 60 * 60 * 1000
    }),
    persistentSessionTtlMs: parseInteger(
      source.PERSISTENT_SESSION_TTL_MS,
      'PERSISTENT_SESSION_TTL_MS',
      {
        defaultValue: 30 * 24 * 60 * 60 * 1000,
        min: 24 * 60 * 60 * 1000,
        max: 90 * 24 * 60 * 60 * 1000
      }
    ),
    passwordResetTtlMs: parseInteger(source.PASSWORD_RESET_TTL_MS, 'PASSWORD_RESET_TTL_MS', {
      defaultValue: 30 * 60 * 1000,
      min: 5 * 60 * 1000,
      max: 24 * 60 * 60 * 1000
    }),
    invitationTtlMs: parseInteger(source.INVITATION_TTL_MS, 'INVITATION_TTL_MS', {
      defaultValue: 7 * 24 * 60 * 60 * 1000,
      min: 60 * 60 * 1000,
      max: 30 * 24 * 60 * 60 * 1000
    }),
    emailVerificationTtlMs: parseInteger(
      source.EMAIL_VERIFICATION_TTL_MS,
      'EMAIL_VERIFICATION_TTL_MS',
      { defaultValue: 24 * 60 * 60 * 1000, min: 15 * 60 * 1000, max: 7 * 24 * 60 * 60 * 1000 }
    ),
    emailChangeTtlMs: parseInteger(source.EMAIL_CHANGE_TTL_MS, 'EMAIL_CHANGE_TTL_MS', {
      defaultValue: 30 * 60 * 1000,
      min: 5 * 60 * 1000,
      max: 24 * 60 * 60 * 1000
    }),
    accountReactivationTtlMs: parseInteger(
      source.ACCOUNT_REACTIVATION_TTL_MS,
      'ACCOUNT_REACTIVATION_TTL_MS',
      { defaultValue: 30 * 60 * 1000, min: 5 * 60 * 1000, max: 24 * 60 * 60 * 1000 }
    ),
    githubAppStateTtlMs: parseInteger(source.GITHUB_APP_STATE_TTL_MS, 'GITHUB_APP_STATE_TTL_MS', {
      defaultValue: 10 * 60 * 1000,
      min: 60 * 1000,
      max: 30 * 60 * 1000
    }),
    githubRepositoryAuthorizationTtlMs: parseInteger(
      source.GITHUB_REPOSITORY_AUTHORIZATION_TTL_MS,
      'GITHUB_REPOSITORY_AUTHORIZATION_TTL_MS',
      {
        defaultValue: 7 * 24 * 60 * 60 * 1000,
        min: 24 * 60 * 60 * 1000,
        max: 30 * 24 * 60 * 60 * 1000
      }
    ),
    githubOAuthStateTtlMs: parseInteger(
      source.GITHUB_OAUTH_STATE_TTL_MS,
      'GITHUB_OAUTH_STATE_TTL_MS',
      { defaultValue: 10 * 60 * 1000, min: 60 * 1000, max: 30 * 60 * 1000 }
    ),
    githubReauthenticationTtlMs: parseInteger(
      source.GITHUB_REAUTHENTICATION_TTL_MS,
      'GITHUB_REAUTHENTICATION_TTL_MS',
      { defaultValue: 10 * 60 * 1000, min: 60 * 1000, max: 30 * 60 * 1000 }
    ),
    ...emailConfiguration,
    sessionRetentionDays: parseInteger(
      source.AUTH_SESSION_RETENTION_DAYS,
      'AUTH_SESSION_RETENTION_DAYS',
      { defaultValue: 30, min: 1, max: 3650 }
    ),
    passwordResetRetentionDays: parseInteger(
      source.AUTH_PASSWORD_RESET_RETENTION_DAYS,
      'AUTH_PASSWORD_RESET_RETENTION_DAYS',
      { defaultValue: 7, min: 1, max: 3650 }
    ),
    invitationRetentionDays: parseInteger(
      source.AUTH_INVITATION_RETENTION_DAYS,
      'AUTH_INVITATION_RETENTION_DAYS',
      { defaultValue: 30, min: 1, max: 3650 }
    ),
    emailVerificationRetentionDays: parseInteger(
      source.AUTH_EMAIL_VERIFICATION_RETENTION_DAYS,
      'AUTH_EMAIL_VERIFICATION_RETENTION_DAYS',
      { defaultValue: 7, min: 1, max: 3650 }
    ),
    githubConnectionStateRetentionDays: parseInteger(
      source.GITHUB_CONNECTION_STATE_RETENTION_DAYS,
      'GITHUB_CONNECTION_STATE_RETENTION_DAYS',
      { defaultValue: 7, min: 1, max: 3650 }
    ),
    githubWebhookDeliveryRetentionDays: parseInteger(
      source.GITHUB_WEBHOOK_DELIVERY_RETENTION_DAYS,
      'GITHUB_WEBHOOK_DELIVERY_RETENTION_DAYS',
      { defaultValue: 30, min: 1, max: 3650 }
    ),
    auditRetentionDays: parseInteger(source.AUDIT_RETENTION_DAYS, 'AUDIT_RETENTION_DAYS', {
      defaultValue: 365,
      min: 30,
      max: 3650
    }),
    deactivatedAccountRetentionDays: parseInteger(
      source.DEACTIVATED_ACCOUNT_RETENTION_DAYS,
      'DEACTIVATED_ACCOUNT_RETENTION_DAYS',
      { defaultValue: 30, min: 1, max: 3650 }
    ),
    exportFileTtlMinutes: parseInteger(source.EXPORT_FILE_TTL_MINUTES, 'EXPORT_FILE_TTL_MINUTES', {
      defaultValue: 15,
      min: 5,
      max: 1440
    }),
    privacyRequestRetentionDays: parseInteger(
      source.PRIVACY_REQUEST_RETENTION_DAYS,
      'PRIVACY_REQUEST_RETENTION_DAYS',
      { defaultValue: 365, min: 30, max: 3650 }
    ),
    accountDeletionGraceDays: parseInteger(
      source.ACCOUNT_DELETION_GRACE_DAYS,
      'ACCOUNT_DELETION_GRACE_DAYS',
      { defaultValue: 30, min: 30, max: 90 }
    ),
    sessionCookieName: source.SESSION_COOKIE_NAME || 'traceflow_session',
    githubOAuthCookieName: source.GITHUB_OAUTH_COOKIE_NAME || 'traceflow_github_oauth',
    sessionCookieSameSite: parseSameSite(source.SESSION_COOKIE_SAME_SITE),
    trustProxy: parseTrustProxy(source.TRUST_PROXY),
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isProduction: nodeEnv === 'production',
    configurationValid: true
  });
}

export const env = createEnvironment(process.env);
