import dotenv from 'dotenv';
import { ConfigurationError } from '../shared/errors/index.js';

dotenv.config();

const allowedEnvironments = new Set(['development', 'test', 'production']);

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

  return Object.freeze({
    nodeEnv,
    port: parsePort(source.PORT),
    databaseUrl,
    testDatabaseUrl,
    githubToken: source.GITHUB_TOKEN || undefined,
    frontendUrl,
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isProduction: nodeEnv === 'production',
    configurationValid: true
  });
}

export const env = createEnvironment(process.env);
