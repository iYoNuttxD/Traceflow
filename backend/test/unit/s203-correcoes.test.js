import { describe, expect, it } from 'vitest';
import { githubSyncFailure } from '../../src/modules/github/github-error.js';
import { DomainError } from '../../src/shared/errors/index.js';

const STORAGE_MESSAGE =
  'Não foi possível gravar os dados da sincronização. Tente de novo em instantes.';
const BUSY_MESSAGE =
  'O projeto está com outra alteração em andamento. Tente sincronizar de novo em instantes.';

const failing = (properties, message = 'falha') => Object.assign(new Error(message), properties);

describe('S2-03 correções — C1-03 classificação das falhas da sincronização (S203-A06)', () => {
  it.each([
    ['P2002', failing({ code: 'P2002' })],
    ['P2028', failing({ code: 'P2028' })],
    ['P2034', failing({ code: 'P2034' })],
    ['P1017', failing({ code: 'P1017' })],
    ['P1001', failing({ errorCode: 'P1001' })]
  ])('erro do Prisma %s vira GITHUB_SYNC_STORAGE_FAILED, com a causa só no log', (cause, error) => {
    expect(githubSyncFailure(error)).toEqual({
      code: 'GITHUB_SYNC_STORAGE_FAILED',
      message: STORAGE_MESSAGE,
      causeCode: cause
    });
  });

  it('erro do Prisma sem código vira GITHUB_SYNC_STORAGE_FAILED pela classe', () => {
    const error = failing({ name: 'PrismaClientUnknownRequestError' });

    expect(githubSyncFailure(error)).toEqual({
      code: 'GITHUB_SYNC_STORAGE_FAILED',
      message: STORAGE_MESSAGE,
      causeCode: 'PrismaClientUnknownRequestError'
    });
  });

  it('trava esgotada continua GITHUB_SYNC_PROJECT_BUSY, com a própria mensagem', () => {
    const error = failing({ code: 'GITHUB_SYNC_PROJECT_BUSY' }, BUSY_MESSAGE);

    expect(githubSyncFailure(error)).toEqual({
      code: 'GITHUB_SYNC_PROJECT_BUSY',
      message: BUSY_MESSAGE,
      causeCode: null
    });
  });

  it.each([
    [
      'limite de taxa',
      failing({ code: 'GITHUB_RATE_LIMITED' }, 'Limite de requisições do GitHub atingido.'),
      'GITHUB_RATE_LIMITED',
      'Limite de requisições do GitHub atingido.'
    ],
    [
      '401 cru',
      failing({ status: 401 }),
      'GITHUB_SYNC_FAILED',
      'Token GitHub inválido, expirado ou sem permissão.'
    ],
    [
      '403 cru',
      failing({ status: 403 }),
      'GITHUB_SYNC_FAILED',
      'Token GitHub inválido, expirado ou sem permissão.'
    ],
    [
      '404 cru',
      failing({ status: 404 }),
      'GITHUB_SYNC_FAILED',
      'Repositório GitHub não encontrado ou sem permissão de acesso.'
    ],
    ['conexão', failing({ code: 'ENOTFOUND' }), 'ENOTFOUND', 'Falha de conexão com o GitHub.'],
    [
      'desconhecido',
      failing({}),
      'GITHUB_SYNC_FAILED',
      'Não foi possível sincronizar com o GitHub.'
    ]
  ])('falha do GitHub (%s) mantém o código e a mensagem de hoje', (_, error, code, message) => {
    expect(githubSyncFailure(error)).toEqual({ code, message, causeCode: null });
  });

  it('erro de domínio do projeto mantém a própria mensagem', () => {
    const error = new DomainError('Projeto não encontrado.', 404);

    expect(githubSyncFailure(error)).toEqual({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Projeto não encontrado.',
      causeCode: null
    });
  });
});
