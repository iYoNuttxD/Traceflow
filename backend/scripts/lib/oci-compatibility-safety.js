import { randomBytes } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { validateTestDatabaseUrl, sanitizedDatabaseTarget } from './database-safety.js';

export class CompatibilityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function requireCondition(condition, code, message) {
  if (!condition) throw new CompatibilityError(code, message);
}

// Intentionally stricter than the shared test guard. This runner owns an entire
// new mysqld, never a schema on an existing server. No DNS, socket URL, forwarding,
// existing credentials, .env loading or DATABASE_URL fallback is accepted.
export function validateCompatibilityTarget(environment) {
  requireCondition(
    !environment.DATABASE_URL,
    'AMBIGUOUS_DATABASE_URL',
    'Remova DATABASE_URL do ambiente do runner. Nenhum fallback é permitido.'
  );
  let value;
  try {
    value = validateTestDatabaseUrl(environment.TEST_DATABASE_URL);
  } catch {
    throw new CompatibilityError(
      'INVALID_TEST_DATABASE_URL',
      'TEST_DATABASE_URL isolada é obrigatória.'
    );
  }
  const url = new URL(value);
  requireCondition(
    url.hostname === '127.0.0.1' && Number(url.port) >= 49152 && Number(url.port) <= 65535,
    'PROTECTED_DATABASE_HOST',
    'Somente 127.0.0.1 em porta efêmera explícita é permitido.'
  );
  requireCondition(
    !url.search && !url.hash,
    'AMBIGUOUS_DATABASE_OPTIONS',
    'Parâmetros de conexão e fragmentos externos não são permitidos.'
  );
  const match = /^\/tf_oci_([a-f0-9]{12})_test$/.exec(url.pathname);
  requireCondition(match, 'INVALID_OWNED_SCHEMA', 'O schema deve seguir tf_oci_<12 hex>_test.');
  const runId = match[1];
  requireCondition(
    url.username === `tf_oci_${runId}` && /^[a-f0-9]{64}$/.test(url.password),
    'INVALID_TEST_CREDENTIALS',
    'Use uma identidade exclusiva e uma credencial aleatória desta execução.'
  );
  return {
    runId,
    username: url.username,
    password: url.password,
    url: value,
    ...sanitizedDatabaseTarget(value),
    controlSchema: `tf_oci_${runId}_owner`
  };
}

export function assertServerIdentity(actual, expected) {
  requireCondition(
    actual.version === expected.version,
    'MYSQL_VERSION_MISMATCH',
    'Versão efetiva diferente da versão autorizada.'
  );
  requireCondition(
    actual.serverUuid === expected.serverUuid &&
      actual.datadir.replace(/\/$/, '') === expected.datadir &&
      String(actual.port) === String(expected.port) &&
      actual.database === expected.database,
    'SERVER_IDENTITY_MISMATCH',
    'A conexão não pertence ao mysqld descartável desta execução.'
  );
  if (expected.ownerToken)
    requireCondition(
      actual.ownerToken === expected.ownerToken,
      'OWNER_MISMATCH',
      'Propriedade da execução não comprovada.'
    );
}

export function classifyFailure(error) {
  const code = error?.code || '';
  if (['P1000', 'ER_ACCESS_DENIED_ERROR'].includes(code)) return 'AUTHENTICATION_FAILED';
  if (['ETIMEDOUT', 'P1001', 'P1002', 'P2024'].includes(code)) return 'CONNECTION_UNAVAILABLE';
  if (/engine|binary target|ELF|architecture/i.test(error?.message || ''))
    return 'NATIVE_ENGINE_UNAVAILABLE';
  if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(code))
    return 'NATIVE_DEPENDENCY_MISSING';
  return code || 'VALIDATION_FAILED';
}

export function assertCommandResult(result, phase) {
  requireCondition(
    !result.error && !result.signal && result.status === 0,
    `${phase}_FAILED`,
    `A etapa ${phase} não concluiu com sucesso.`
  );
}

export function assertNativeRuntime(actual, expected) {
  requireCondition(
    actual.platform === expected.platform && actual.architecture === expected.architecture,
    'NATIVE_ARCHITECTURE_MISMATCH',
    'Arquitetura efetiva diferente da declarada.'
  );
  requireCondition(
    actual.objects.some((path) => path.includes(expected.engine)),
    'NATIVE_ENGINE_MISMATCH',
    'Engine Prisma incompatível ou não carregada.'
  );
  requireCondition(
    actual.objects.some((path) => path.includes('argon2')),
    'NATIVE_DEPENDENCY_MISSING',
    'Biblioteca nativa Argon2 não carregada.'
  );
}

export function sanitizeOutput(value, secrets = []) {
  let output = String(value ?? '');
  for (const secret of secrets.filter(Boolean))
    output = output.replaceAll(secret, '[REDACTED_SECRET]');
  return output
    .replace(/mysql:\/\/[^\s\x22\x27`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(password|MYSQL_PWD)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED_SECRET]');
}

export async function createOwnedDirectory(runId) {
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(join(parent, 'traceflow-oci-'));
  const owner = { runId, token: randomBytes(32).toString('hex'), root };
  await writeFile(join(root, '.owner.json'), JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
  return owner;
}

export async function removeOwnedDirectory(owner, { serverStopped }) {
  requireCondition(
    serverStopped === true,
    'CLEANUP_SERVER_RUNNING',
    'Limpeza recusada: servidor ainda pode estar ativo.'
  );
  const stat = await lstat(owner.root);
  requireCondition(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (!process.getuid || stat.uid === process.getuid()) &&
      basename(owner.root).startsWith('traceflow-oci-') &&
      (await realpath(owner.root)) === resolve(owner.root),
    'CLEANUP_UNSAFE_PATH',
    'Limpeza recusada: diretório não comprovado.'
  );
  const marker = join(owner.root, '.owner.json');
  requireCondition(
    (await lstat(marker)).isFile() && !(await lstat(marker)).isSymbolicLink(),
    'CLEANUP_UNSAFE_MARKER',
    'Marcador de propriedade inválido.'
  );
  const saved = JSON.parse(await readFile(marker, 'utf8'));
  requireCondition(
    saved.runId === owner.runId && saved.token === owner.token && saved.root === owner.root,
    'CLEANUP_OWNER_MISMATCH',
    'Limpeza recusada: propriedade divergente.'
  );
  await rm(owner.root, { recursive: true });
}
