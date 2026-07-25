import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Octokit: vi.fn(),
  getAuthenticated: vi.fn()
}));

vi.mock('@octokit/rest', () => ({ Octokit: mocks.Octokit }));
vi.mock('../../src/config/env.js', () => ({
  env: {
    githubToken: 'token-artificial-de-teste',
    githubRequestTimeoutMs: 15000,
    githubRetryMax: 0
  }
}));

import {
  checkGithubAuthentication,
  getGithubClient
} from '../../src/modules/github/github.client.js';

describe('configuração segura do Octokit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticated.mockResolvedValue({
      data: { login: 'usuario-artificial', id: 1, type: 'User' }
    });
    mocks.Octokit.mockImplementation(function OctokitDouble() {
      return { rest: { users: { getAuthenticated: mocks.getAuthenticated } } };
    });
  });

  it('fixa host oficial e timeout sem acessar a rede', async () => {
    const client = getGithubClient();
    expect(client).toBeDefined();
    expect(mocks.Octokit).toHaveBeenCalledWith({
      auth: 'token-artificial-de-teste',
      baseUrl: 'https://api.github.com',
      request: { timeout: 15000 }
    });
    await expect(checkGithubAuthentication()).resolves.toEqual({
      login: 'usuario-artificial',
      id: 1,
      type: 'User'
    });
  });
});
