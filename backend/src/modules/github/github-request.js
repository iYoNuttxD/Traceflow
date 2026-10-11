import { env } from '../../config/env.js';
import { ERROR_CODES, ExternalServiceError } from '../../shared/errors/index.js';
import {
  githubRetryNotBefore,
  isGithubRateLimitError,
  normalizeGithubError
} from './github-error.js';

const retryableStatuses = new Set([429, 502, 503, 504]);
const retryableCodes = new Set(['ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']);

export function isRetryableGithubError(error) {
  if (error?.status === 401 || error?.status === 404 || error?.status === 422) return false;
  if (error?.status === 403) return isGithubRateLimitError(error);
  return retryableStatuses.has(error?.status) || retryableCodes.has(error?.code);
}

export function calculateGithubRetryDelay(
  error,
  attempt,
  random = Math.random,
  maxDelayMs = env.githubRetryMaxDelayMs || 60_000
) {
  const notBefore = githubRetryNotBefore(error);
  if (notBefore) return Math.max(0, notBefore.getTime() - Date.now());
  const retryAfter = Number(error?.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, maxDelayMs);
  }

  const resetAt = Number(error?.response?.headers?.['x-ratelimit-reset']);
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.min(Math.max(resetAt * 1000 - Date.now(), 0), maxDelayMs);
  }

  return Math.min(250 * 2 ** attempt + Math.floor(random() * 100), maxDelayMs);
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function toExternalServiceError(error) {
  const normalized = normalizeGithubError(error);
  const isRateLimit = normalized.code === ERROR_CODES.GITHUB_RATE_LIMITED;
  const statusCode = isRateLimit
    ? 429
    : normalized.code === ERROR_CODES.RESOURCE_NOT_FOUND
      ? 404
      : normalized.code === ERROR_CODES.GITHUB_AUTH_FAILED
        ? 403
        : error?.code === 'ETIMEDOUT'
          ? 503
          : 500;
  const externalError = new ExternalServiceError(normalized.message, statusCode, normalized.code, {
    cause: error,
    useFallbackMessage: !isRateLimit,
    exposeTechnicalDetails: isRateLimit
  });
  externalError.externalStatus = normalized.externalStatus;
  externalError.retryAt = githubRetryNotBefore(error);
  return externalError;
}

export async function executeGithubRequest(
  operation,
  {
    maxRetries = env.githubRetryMax,
    maxDelayMs = env.githubRetryMaxDelayMs || 60_000,
    wait = sleep,
    random = Math.random
  } = {}
) {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableGithubError(error)) {
        throw toExternalServiceError(error);
      }
      const delayMs = calculateGithubRetryDelay(error, attempt, random, maxDelayMs);
      // Never shorten GitHub's Retry-After to fit the in-request wait budget.
      // The persisted scheduler cooldown takes over when the wait is longer.
      if (delayMs > maxDelayMs) throw toExternalServiceError(error);
      attempt += 1;
      await wait(delayMs);
    }
  }
}
