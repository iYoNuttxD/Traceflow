import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../src/shared/errors/index.js';
import { normalizeGithubError } from '../../src/modules/github/github-error.js';

describe('normalização de falhas GitHub', () => {
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
