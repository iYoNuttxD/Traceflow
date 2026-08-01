import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGithubAppCredentialProvider } from '../../src/modules/github/github-credential.provider.js';
import { createGithubClient } from '../../src/modules/github/github.client.js';
import {
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest,
  mapGithubRepository
} from '../../src/modules/github/github.mapper.js';
import { collectGithubPages, paginateGithub } from '../../src/modules/github/github-pagination.js';

describe('fronteira GitHub App da L1', () => {
  it('gera credencial curta por instalação sem expor ou persistir tokens', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const calls = [];
    const OctokitClass = vi.fn(function OctokitDouble(options) {
      calls.push(options);
      this.rest = {
        apps: {
          createInstallationAccessToken: vi
            .fn()
            .mockResolvedValue({ data: { token: 'installation-token-artificial' } })
        }
      };
    });
    const provider = createGithubAppCredentialProvider({
      environment: {
        githubAppConfigured: true,
        githubAppId: '123',
        githubAppPrivateKeyBase64: Buffer.from(
          privateKey.export({ type: 'pkcs8', format: 'pem' })
        ).toString('base64'),
        githubRequestTimeoutMs: 15000,
        githubAppClientId: 'client',
        githubAppClientSecret: 'secret',
        githubAppCallbackUrl: 'https://example.test/callback'
      },
      OctokitClass
    });
    await expect(provider.createInstallationToken('99')).resolves.toBe(
      'installation-token-artificial'
    );
    expect(calls[0]).toMatchObject({
      baseUrl: 'https://api.github.com',
      request: { timeout: 15000 }
    });
    expect(calls[0].auth.split('.')).toHaveLength(3);
  });

  it('normaliza os DTOs sem payload Octokit', () => {
    expect(
      mapGithubRepository({
        id: 1,
        name: 'repo',
        owner: { login: 'owner' },
        full_name: 'owner/repo',
        html_url: 'https://github.com/owner/repo',
        default_branch: 'trunk',
        private: true
      })
    ).toMatchObject({ githubRepositoryId: '1', fullName: 'owner/repo', defaultBranch: 'trunk' });
    expect(
      mapGithubCommit({ sha: 'abc', commit: { author: { date: '2026-01-01T00:00:00Z' } } }, 'trunk')
    ).toMatchObject({ hash: 'abc', branch: 'trunk', date: expect.any(Date) });
    expect(
      mapGithubPullRequest({ id: 2, number: 2, title: 'PR', base: { ref: 'trunk' } })
    ).toMatchObject({ githubId: '2', targetBranch: 'trunk' });
    expect(mapGithubIssue({ id: 4, pull_request: {} })).toBeNull();
  });

  it('pagina até o fim e cria client exclusivamente com token de instalação recebido', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], hasNext: true })
      .mockResolvedValueOnce({ items: [2], hasNext: false });
    await expect(collectGithubPages(paginateGithub(fetchPage, { perPage: 1 }))).resolves.toEqual([
      1, 2
    ]);
    const listRepos = vi.fn().mockResolvedValue({ data: [] });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });
    await collectGithubPages(client.listRepositoryPages());
    expect(OctokitClass).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'installation-token-artificial',
        baseUrl: 'https://api.github.com'
      })
    );
  });
});
