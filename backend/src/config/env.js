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
  const headers = parseCsv(value, ['Content-Type', 'X-Request-Id']);
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
      defaultValue: 200,
      min: 1,
      max: 100000
    }),
    sensitiveRateLimitMax: parseInteger(
      source.SENSITIVE_RATE_LIMIT_MAX,
      'SENSITIVE_RATE_LIMIT_MAX',
      { defaultValue: 20, min: 1, max: 10000 }
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
    trustProxy: parseTrustProxy(source.TRUST_PROXY),
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isProduction: nodeEnv === 'production',
    configurationValid: true
  });
}

export const env = createEnvironment(process.env);
