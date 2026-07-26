import { beforeEach, describe, expect, it, vi } from 'vitest';

const githubClientMocks = vi.hoisted(() => ({
  checkGithubAuthentication: vi.fn(),
  getGithubClient: vi.fn()
}));

vi.mock('../../src/modules/github/github.client.js', () => githubClientMocks);

import { githubService } from '../../src/modules/github/github.service.js';
import { ERROR_CODES, ExternalServiceError } from '../../src/shared/errors/index.js';

async function* pages(...values) {
  for (const value of values) yield value;
}

describe('githubService com fronteira GitHub substituída', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mantém o contrato da autenticação simulada sem acessar rede', async () => {
    githubClientMocks.checkGithubAuthentication.mockResolvedValue({
      login: 'usuario-artificial',
      id: 101,
      type: 'User'
    });
    await expect(githubService.checkAuthentication()).resolves.toEqual({
      login: 'usuario-artificial',
      id: 101,
      type: 'User'
    });
  });

  it('combina todas as páginas de repositórios preservando o DTO público', async () => {
    const first = {
      githubRepositoryId: '201',
      name: 'primeiro',
      owner: 'artificial',
      fullName: 'artificial/primeiro',
      url: 'https://github.com/artificial/primeiro',
      defaultBranch: 'trunk',
      private: false,
      description: null
    };
    const second = {
      ...first,
      githubRepositoryId: '202',
      name: 'segundo',
      fullName: 'artificial/segundo'
    };
    githubClientMocks.getGithubClient.mockReturnValue({
      listRepositoryPages: () => pages([first], [second])
    });

    await expect(githubService.listRepositories()).resolves.toEqual([first, second]);
  });

  it('propaga a falha já sanitizada da fronteira externa', async () => {
    const failure = new ExternalServiceError(
      'Não foi possível sincronizar com o GitHub.',
      500,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR
    );
    githubClientMocks.getGithubClient.mockReturnValue({
      listRepositoryPages: () =>
        (async function* fail() {
          throw failure;
        })()
    });

    await expect(githubService.listRepositories()).rejects.toBe(failure);
  });
});
