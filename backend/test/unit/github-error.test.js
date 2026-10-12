import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../src/shared/errors/index.js';
import {
  githubRetryNotBefore,
  normalizeGithubError
} from '../../src/modules/github/github-error.js';
import { executeGithubRequest } from '../../src/modules/github/github-request.js';

describe('normalização de falhas GitHub', () => {
  it.each([undefined, '', '-1', 'invalid'])(
    'usa fallback conservador para Retry-After inválido: %s',
    (retry) => {
      const now = new Date();
      const error = {
        status: 403,
        response: {
          data: { message: 'You have exceeded a secondary rate limit.' },
          headers: { 'retry-after': retry }
        }
      };
      expect(githubRetryNotBefore(error, now).getTime() - now.getTime()).toBe(60000);
      expect(
        normalizeGithubError({ status: 403, response: { headers: { 'retry-after': retry } } })
      ).toMatchObject({ code: ERROR_CODES.GITHUB_AUTH_FAILED });
    }
  );
  it.each([
    'You have exceeded a secondary rate limit. Please wait a few minutes.',
    'API rate limit exceeded for installation.',
    'You have triggered an abuse detection mechanism.'
  ])('reconhece 403 pelo corpo do provedor e preserva retry sanitizado: %s', async (message) => {
    const error = { status: 403, response: { data: { message } } };
    expect(normalizeGithubError(error)).toEqual({
      code: ERROR_CODES.GITHUB_RATE_LIMITED,
      message: 'Limite de requisições do GitHub atingido.',
      externalStatus: 403
    });
    const now = new Date();
    expect(githubRetryNotBefore(error, now).getTime() - now.getTime()).toBe(60000);
    const wait = vi.fn();
    const operation = vi.fn().mockRejectedValue(error);
    await expect(
      executeGithubRequest(operation, { maxRetries: 2, maxDelayMs: 1000, wait })
    ).rejects.toMatchObject({ code: ERROR_CODES.GITHUB_RATE_LIMITED, retryAt: expect.any(Date) });
    expect(operation).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it.each([
    'Resource not accessible by integration',
    'Permission denied',
    'Repository size limit reached'
  ])('não confunde permissão ou limites não reconhecidos com rate limit: %s', (message) => {
    expect(normalizeGithubError({ status: 403, response: { data: { message } } })).toMatchObject({
      code: ERROR_CODES.GITHUB_AUTH_FAILED
    });
  });
  it('normaliza autenticação e rate limit sem carregar resposta externa', () => {
    expect(
      normalizeGithubError({ status: 401, response: { headers: { token: 'secret' } } })
    ).toEqual({
      message: 'Token GitHub inválido, expirado ou sem permissão.',
      code: ERROR_CODES.GITHUB_AUTH_FAILED,
      externalStatus: 401
    });
    expect(
      normalizeGithubError({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0', authorization: 'secret' } }
      })
    ).toEqual({
      message: 'Limite de requisições do GitHub atingido.',
      code: ERROR_CODES.GITHUB_RATE_LIMITED,
      externalStatus: 403
    });
    expect(
      normalizeGithubError({ status: 403, response: { headers: { 'retry-after': '2' } } })
    ).toMatchObject({ code: ERROR_CODES.GITHUB_RATE_LIMITED, externalStatus: 403 });
    expect(
      normalizeGithubError({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '4999' } }
      })
    ).toMatchObject({ code: ERROR_CODES.GITHUB_AUTH_FAILED, externalStatus: 403 });
  });

  it('normaliza not found, rede e falha genérica', () => {
    expect(normalizeGithubError({ status: 404 }).message).toBe(
      'Repositório GitHub não encontrado ou sem permissão de acesso.'
    );
    expect(normalizeGithubError({ code: 'ETIMEDOUT' }).message).toBe(
      'Falha de conexão com o GitHub.'
    );
    expect(normalizeGithubError(new Error('detalhe privado'))).toEqual({
      message: 'Não foi possível sincronizar com o GitHub.',
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      externalStatus: undefined
    });
  });
});
