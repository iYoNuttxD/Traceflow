import { beforeEach, describe, expect, it, vi } from 'vitest';

const githubClientMocks = vi.hoisted(() => ({
  checkGithubAuthentication: vi.fn(),
  getGithubClient: vi.fn()
}));

vi.mock('../../src/modules/github/github.client.js', () => githubClientMocks);

import { githubService } from '../../src/modules/github/github.service.js';
import { ERROR_CODES, ExternalServiceError } from '../../src/shared/errors/index.js';

describe('githubService com fronteira Octokit substituída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(githubClientMocks.checkGithubAuthentication).toHaveBeenCalledOnce();
  });

  it('mapeia a primeira página de repositórios no formato atual', async () => {
    const listForAuthenticatedUser = vi.fn().mockResolvedValue({
      data: [
        {
          id: 202,
          name: 'repositorio-artificial',
          owner: { login: 'usuario-artificial' },
          full_name: 'usuario-artificial/repositorio-artificial',
          html_url: 'https://github.com/usuario-artificial/repositorio-artificial',
          default_branch: 'main',
          private: true,
          description: 'Descrição artificial'
        }
      ]
    });
    githubClientMocks.getGithubClient.mockReturnValue({
      rest: { repos: { listForAuthenticatedUser } }
    });

    await expect(githubService.listRepositories()).resolves.toEqual([
      {
        githubRepositoryId: '202',
        name: 'repositorio-artificial',
        owner: 'usuario-artificial',
        fullName: 'usuario-artificial/repositorio-artificial',
        url: 'https://github.com/usuario-artificial/repositorio-artificial',
        defaultBranch: 'main',
        private: true,
        description: 'Descrição artificial'
      }
    ]);
    expect(listForAuthenticatedUser).toHaveBeenCalledWith({
      per_page: 100,
      sort: 'updated'
    });
  });

  it('normaliza a falha do client sem propagar detalhes externos', async () => {
    const externalError = new Error('falha artificial');
    githubClientMocks.getGithubClient.mockReturnValue({
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockRejectedValue(externalError)
        }
      }
    });

    const operation = githubService.listRepositories();
    await expect(operation).rejects.toMatchObject({
      name: 'ExternalServiceError',
      statusCode: 500,
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      message: 'Não foi possível sincronizar com o GitHub.'
    });
    await expect(operation).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
