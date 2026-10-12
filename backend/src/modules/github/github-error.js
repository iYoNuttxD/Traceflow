import { ERROR_CODES } from '../../shared/errors/index.js';

function header(error, name) {
  const headers = error?.response?.headers;
  if (!headers) return undefined;
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

export function isGithubRateLimitError(error) {
  const externalStatus = Number(error?.status);
  if (externalStatus === 429) return true;
  if (externalStatus !== 403) return false;

  const remainingHeader = header(error, 'x-ratelimit-remaining');
  const remaining =
    remainingHeader == null || remainingHeader === '' ? NaN : Number(remainingHeader);
  const retryHeader = header(error, 'retry-after');
  const retryAfter = retryHeader == null || retryHeader === '' ? NaN : Number(retryHeader);
  // GitHub may identify secondary limits only in its structured response message.
  // Never pass provider text through to clients or logs.
  const message = error?.response?.data?.message;
  const providerRateLimit =
    typeof message === 'string' &&
    /\b(?:secondary rate limit|(?:api )?rate limit exceeded|abuse detection)\b/i.test(message);
  return (
    providerRateLimit ||
    remaining === 0 ||
    (Number.isFinite(retryAfter) && retryAfter >= 0) ||
    (typeof retryHeader === 'string' &&
      !Number.isFinite(retryAfter) &&
      Number.isFinite(Date.parse(retryHeader)))
  );
}

export function githubRetryNotBefore(error, now = new Date()) {
  if (error?.retryAt instanceof Date) return error.retryAt;
  if (error?.cause) {
    const nested = githubRetryNotBefore(error.cause, now);
    if (nested) return nested;
  }
  const retry = header(error, 'retry-after');
  const transientWithRetry = Number(error?.status ?? error?.externalStatus) >= 500 && retry != null;
  if (
    !isGithubRateLimitError(error) &&
    error?.code !== ERROR_CODES.GITHUB_RATE_LIMITED &&
    !transientWithRetry
  )
    return null;
  const seconds = retry == null || retry === '' ? NaN : Number(retry);
  const parsed = typeof retry === 'string' ? Date.parse(retry) : NaN;
  const retryMs = Number.isFinite(seconds)
    ? seconds >= 0
      ? now.getTime() + seconds * 1000
      : NaN
    : parsed;
  const reset = Number(header(error, 'x-ratelimit-reset')) * 1000;
  const explicit = Number.isFinite(retryMs) || (Number.isFinite(reset) && reset > 0);
  return new Date(
    Math.max(
      now.getTime() + (explicit ? 0 : 60000),
      Number.isFinite(retryMs) ? retryMs : 0,
      Number.isFinite(reset) ? reset : 0
    )
  );
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
