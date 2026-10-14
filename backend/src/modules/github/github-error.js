import { isLockBusy } from '../../database/locks.js';
import { isLockWaitTimeout } from '../../database/lock-wait.js';
import { DomainError, ERROR_CODES } from '../../shared/errors/index.js';

const STORAGE_CAUSE = /^P\d{4}$/;
const STORAGE_FAILURE_MESSAGE =
  'Não foi possível gravar os dados da sincronização. Tente de novo em instantes.';
export const PROJECT_BUSY_MESSAGE =
  'O projeto está com outra alteração em andamento. Tente sincronizar de novo em instantes.';

function header(error, name) {
  const headers = error?.response?.headers;
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

export function isGithubRateLimitError(error) {
  const externalStatus = Number(error?.status);
  if (externalStatus === 429) return true;
  if (externalStatus !== 403) return false;

  const remaining = Number(header(error, 'x-ratelimit-remaining'));
  const retryAfter = Number(header(error, 'retry-after'));
  return remaining === 0 || (Number.isFinite(retryAfter) && retryAfter >= 0);
}

export function normalizeGithubError(error) {
  if (
    error?.code === ERROR_CODES.GITHUB_RATE_LIMITED ||
    error?.code === ERROR_CODES.GITHUB_AUTH_FAILED ||
    error?.code === ERROR_CODES.RESOURCE_NOT_FOUND ||
    error?.code === ERROR_CODES.EXTERNAL_SERVICE_ERROR
  ) {
    return {
      message: error.message,
      code: error.code,
      externalStatus: error.externalStatus
    };
  }
  const externalStatus = Number.isInteger(error?.status) ? error.status : undefined;

  if (isGithubRateLimitError(error)) {
    return {
      message: 'Limite de requisições do GitHub atingido.',
      code: ERROR_CODES.GITHUB_RATE_LIMITED,
      externalStatus
    };
  }

  if (externalStatus === 401 || externalStatus === 403) {
    return {
      message: 'Token GitHub inválido, expirado ou sem permissão.',
      code: ERROR_CODES.GITHUB_AUTH_FAILED,
      externalStatus
    };
  }

  if (externalStatus === 404) {
    return {
      message: 'Repositório GitHub não encontrado ou sem permissão de acesso.',
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      externalStatus
    };
  }

  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error?.code)) {
    return {
      message: 'Falha de conexão com o GitHub.',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR
    };
  }

  return {
    message: 'Não foi possível sincronizar com o GitHub.',
    code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    externalStatus
  };
}

function storageCauseOf(error) {
  if (error?.code === 'TRANSACTION_DEADLINE') return 'TRANSACTION_DEADLINE';
  for (const value of [error?.code, error?.errorCode])
    if (STORAGE_CAUSE.test(String(value ?? ''))) return String(value);
  const name = String(error?.name ?? '');
  return name.startsWith('PrismaClient') ? name : null;
}

export function githubSyncFailure(error) {
  if (
    error?.code === ERROR_CODES.GITHUB_SYNC_PROJECT_BUSY ||
    isLockBusy(error) ||
    isLockWaitTimeout(error)
  )
    return {
      code: ERROR_CODES.GITHUB_SYNC_PROJECT_BUSY,
      message: PROJECT_BUSY_MESSAGE,
      causeCode: null
    };
  const causeCode = storageCauseOf(error);
  if (causeCode)
    return {
      code: ERROR_CODES.GITHUB_SYNC_STORAGE_FAILED,
      message: STORAGE_FAILURE_MESSAGE,
      causeCode
    };
  return {
    code: String(error?.code || 'GITHUB_SYNC_FAILED'),
    message: error instanceof DomainError ? error.message : normalizeGithubError(error).message,
    causeCode: null
  };
}
