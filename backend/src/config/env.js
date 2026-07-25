import dotenv from 'dotenv';
import { ConfigurationError } from '../shared/errors/index.js';

dotenv.config();

const allowedEnvironments = new Set(['development', 'test', 'production']);
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
  const fallback = nodeEnv === 'production'
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
      throw new ConfigurationError('Configuração inválida: CORS_ALLOWED_ORIGINS não aceita wildcard.');
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
  const methods = parseCsv(value, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
    .map((method) => method.toUpperCase());
  if (methods.length === 0 || methods.some((method) => !allowedCorsMethods.has(method))) {
    throw new ConfigurationError('Configuração inválida: CORS_ALLOWED_METHODS contém método não permitido.');
  }
  return methods;
}

function parseCorsHeaders(value) {
  const headers = parseCsv(value, ['Content-Type', 'X-Request-Id', 'X-CSRF-Token']);
  if (headers.length === 0 || headers.some((header) => !/^[A-Za-z0-9-]+$/.test(header))) {
    throw new ConfigurationError('Configuração inválida: CORS_ALLOWED_HEADERS contém header inválido.');
  }
  return headers;
}

function parseBodyLimit(value) {
  const bodyLimit = value || '100kb';
  const match = /^(\d+)(b|kb|mb)$/i.exec(bodyLimit);
  if (!match) {
    throw new ConfigurationError('Configuração inválida: BODY_LIMIT deve usar b, kb ou mb.');
  }
  const bytes = Number(match[1]) * ({ b: 1, kb: 1024, mb: 1024 * 1024 })[match[2].toLowerCase()];
  if (bytes < 1024 || bytes > 10 * 1024 * 1024) {
    throw new ConfigurationError('Configuração inválida: BODY_LIMIT deve estar entre 1kb e 10mb.');
  }
  return bodyLimit.toLowerCase();
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') {
    throw new ConfigurationError('Configuração inválida: TRUST_PROXY não pode ser true irrestrito.');
  }
  if (/^\d+$/.test(value)) {
    return parseInteger(value, 'TRUST_PROXY', { min: 1, max: 10 });
  }
  if (['loopback', 'linklocal', 'uniquelocal'].includes(value)) return value;
  throw new ConfigurationError('Configuração inválida: TRUST_PROXY deve ser false, um número de saltos ou uma faixa confiável.');
}

function parseSameSite(value) {
  const normalized = (value || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(normalized)) {
    throw new ConfigurationError('Configuração inválida: SESSION_COOKIE_SAME_SITE deve ser lax, strict ou none.');
  }
  return normalized;
}

function parseBoolean(value, key, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError(`Configuração inválida: ${key} deve ser true ou false.`);
}

function parseEmailConfiguration(source, nodeEnv) {
  const provider = source.EMAIL_PROVIDER || (nodeEnv === 'production' ? 'smtp' : 'capture');
  if (!['capture', 'smtp'].includes(provider)) {
    throw new ConfigurationError('Configuração inválida: EMAIL_PROVIDER deve ser capture ou smtp.');
  }
  if (nodeEnv === 'production' && provider !== 'smtp') {
    throw new ConfigurationError('Configuração inválida: EMAIL_PROVIDER deve ser smtp em produção.');
  }
  const from = source.EMAIL_FROM || (provider === 'capture' ? 'no-reply@traceflow.test' : undefined);
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
    smtpPort: parseInteger(source.SMTP_PORT, 'SMTP_PORT', { defaultValue: 587, min: 1, max: 65535 }),
    smtpSecure: parseBoolean(source.SMTP_SECURE, 'SMTP_SECURE', false),
    smtpUser: source.SMTP_USER,
    smtpPassword: source.SMTP_PASSWORD,
    passwordResetUrl: parseUrl(source.PASSWORD_RESET_URL || 'http://localhost:5173/reset-password', 'PASSWORD_RESET_URL'),
    invitationAcceptUrl: parseUrl(source.INVITATION_ACCEPT_URL || 'http://localhost:5173/invitations/accept', 'INVITATION_ACCEPT_URL')
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
  const databaseSource = nodeEnv === 'test' && testDatabaseUrl
    ? testDatabaseUrl
    : source.DATABASE_URL;
  const databaseUrl = parseUrl(databaseSource, 'DATABASE_URL', { protocol: 'mysql:' });
  const frontendUrl = parseUrl(
    source.FRONTEND_URL || 'http://localhost:5173',
    'FRONTEND_URL'
  );

  if (nodeEnv === 'production' && !source.GITHUB_TOKEN) {
    throw new ConfigurationError('Configuração obrigatória ausente: GITHUB_TOKEN.');
  }

  const corsAllowedOrigins = parseCorsOrigins(source, nodeEnv, frontendUrl);
  const emailConfiguration = parseEmailConfiguration(source, nodeEnv);

  return Object.freeze({
    nodeEnv,
    port: parsePort(source.PORT),
    databaseUrl,
    testDatabaseUrl,
    githubToken: source.GITHUB_TOKEN || undefined,
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
    sessionTtlMs: parseInteger(source.SESSION_TTL_MS, 'SESSION_TTL_MS', {
      defaultValue: 8 * 60 * 60 * 1000, min: 5 * 60 * 1000, max: 30 * 24 * 60 * 60 * 1000
    }),
    passwordResetTtlMs: parseInteger(source.PASSWORD_RESET_TTL_MS, 'PASSWORD_RESET_TTL_MS', {
      defaultValue: 30 * 60 * 1000, min: 5 * 60 * 1000, max: 24 * 60 * 60 * 1000
    }),
    invitationTtlMs: parseInteger(source.INVITATION_TTL_MS, 'INVITATION_TTL_MS', {
      defaultValue: 7 * 24 * 60 * 60 * 1000, min: 60 * 60 * 1000, max: 30 * 24 * 60 * 60 * 1000
    }),
    ...emailConfiguration,
    sessionRetentionDays: parseInteger(source.AUTH_SESSION_RETENTION_DAYS, 'AUTH_SESSION_RETENTION_DAYS', { defaultValue: 30, min: 1, max: 3650 }),
    passwordResetRetentionDays: parseInteger(source.AUTH_PASSWORD_RESET_RETENTION_DAYS, 'AUTH_PASSWORD_RESET_RETENTION_DAYS', { defaultValue: 7, min: 1, max: 3650 }),
    invitationRetentionDays: parseInteger(source.AUTH_INVITATION_RETENTION_DAYS, 'AUTH_INVITATION_RETENTION_DAYS', { defaultValue: 30, min: 1, max: 3650 }),
    sessionCookieName: source.SESSION_COOKIE_NAME || 'traceflow_session',
    sessionCookieSameSite: parseSameSite(source.SESSION_COOKIE_SAME_SITE),
    trustProxy: parseTrustProxy(source.TRUST_PROXY),
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isProduction: nodeEnv === 'production',
    configurationValid: true
  });
}

export const env = createEnvironment(process.env);
