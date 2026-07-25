import { ERROR_CODES } from '../../shared/errors/index.js';

export function normalizeGithubError(error) {
  if (error?.code === ERROR_CODES.GITHUB_RATE_LIMITED ||
      error?.code === ERROR_CODES.GITHUB_AUTH_FAILED ||
      error?.code === ERROR_CODES.RESOURCE_NOT_FOUND ||
      error?.code === ERROR_CODES.EXTERNAL_SERVICE_ERROR) {
    return {
      message: error.message,
      code: error.code,
      externalStatus: error.externalStatus
    };
  }
  const externalStatus = Number.isInteger(error?.status) ? error.status : undefined;

  if (
    externalStatus === 429 ||
    (externalStatus === 403 && error?.response?.headers?.['x-ratelimit-remaining'] === '0')
  ) {
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
