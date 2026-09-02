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

  it('lista uma instalação pelo endpoint do user access token sem depender de username', async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        total_count: 1,
        installations: [
          {
            id: 77,
            account: { id: 700, login: 'traceflow', type: 'Organization' },
            created_at: '2030-01-01T00:00:00Z'
          }
        ]
      }
    });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.request = request;
    });
    const requestExecutor = vi.fn((operation) => operation());
    const provider = createGithubAppCredentialProvider({
      environment: {
        githubAppConfigured: true,
        githubRequestTimeoutMs: 15000,
        githubRetryMax: 2
      },
      OctokitClass,
      requestExecutor
    });

    await expect(
      provider.listInstallationsAccessibleToUser('user-token-artificial')
    ).resolves.toEqual([
      {
        githubInstallationId: '77',
        accountId: '700',
        accountLogin: 'traceflow',
        accountType: 'Organization',
        installedAt: new Date('2030-01-01T00:00:00Z')
      }
    ]);
    expect(request).toHaveBeenCalledWith('GET /user/installations', { per_page: 100, page: 1 });
    expect(JSON.stringify(request.mock.calls)).not.toContain('/users//installation');
    expect(OctokitClass).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: 'user-token-artificial',
        request: { timeout: 15000 }
      })
    );
    expect(requestExecutor).toHaveBeenCalledWith(expect.any(Function), { maxRetries: 2 });
  });

  it('troca code de login com callback fixo e PKCE e lê somente e-mail primário verificado', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'user-token-efemero' })
    });
    const request = vi.fn(async (route) =>
      route === 'GET /user'
        ? { data: { id: 123, login: 'octocat' } }
        : {
            data: [
              { email: 'unverified@example.test', primary: true, verified: false },
              { email: 'verified@example.test', primary: true, verified: true }
            ]
          }
    );
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.request = request;
    });
    const provider = createGithubAppCredentialProvider({
      environment: {
        githubAppConfigured: true,
        githubAppClientId: 'client-id',
        githubAppClientSecret: 'client-secret',
        githubLoginCallbackUrl: 'https://api.traceflow.test/api/auth/github/callback',
        githubRequestTimeoutMs: 15000,
        githubRetryMax: 0
      },
      OctokitClass,
      fetchImpl,
      requestExecutor: (operation) => operation()
    });
    await expect(
      provider.exchangeLoginUserCode({ code: 'oauth-code', codeVerifier: 'verifier-seguro' })
    ).resolves.toBe('user-token-efemero');
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body.get('redirect_uri')).toBe('https://api.traceflow.test/api/auth/github/callback');
    expect(body.get('code_verifier')).toBe('verifier-seguro');
    await expect(provider.getAuthenticatedUser('user-token-efemero')).resolves.toMatchObject({
      id: 123
    });
    await expect(provider.getPrimaryVerifiedEmail('user-token-efemero')).resolves.toBe(
      'verified@example.test'
    );
    expect(request).toHaveBeenCalledWith('GET /user');
    expect(request).toHaveBeenCalledWith('GET /user/emails', { per_page: 100 });
  });

  it('pagina todas as instalações e encontra dados disponíveis somente em página posterior', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      account: { id: index + 1000, login: `account-${index}`, type: 'User' }
    }));
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { total_count: 101, installations: firstPage } })
      .mockResolvedValueOnce({
        data: {
          total_count: 101,
          installations: [
            {
              id: 150617962,
              account: { id: 700, login: 'traceflow', type: 'Organization' }
            }
          ]
        }
      });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.request = request;
    });
    const provider = createGithubAppCredentialProvider({
      environment: {
        githubAppConfigured: true,
        githubRequestTimeoutMs: 15000,
        githubRetryMax: 2
      },
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    const installations = await provider.listInstallationsAccessibleToUser('token-paginado');
    expect(installations).toHaveLength(101);
    expect(
      installations.find(({ githubInstallationId }) => githubInstallationId === '150617962')
    ).toMatchObject({ accountLogin: 'traceflow' });
    expect(request).toHaveBeenNthCalledWith(2, 'GET /user/installations', {
      per_page: 100,
      page: 2
    });
  });

  it('consulta a instalação com credencial da App e retorna somente metadata técnica', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const getInstallation = vi.fn().mockResolvedValue({
      data: {
        id: 77,
        account: { id: 700, login: 'traceflow', type: 'Organization' },
        created_at: '2030-01-01T00:00:00Z',
        permissions: { contents: 'read' }
      }
    });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { getInstallation } };
    });
    const provider = createGithubAppCredentialProvider({
      environment: {
        githubAppConfigured: true,
        githubAppId: '123',
        githubAppPrivateKeyBase64: Buffer.from(
          privateKey.export({ type: 'pkcs8', format: 'pem' })
        ).toString('base64'),
        githubRequestTimeoutMs: 15000,
        githubRetryMax: 2
      },
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(provider.getInstallation('77')).resolves.toEqual({
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      installedAt: new Date('2030-01-01T00:00:00Z')
    });
    expect(getInstallation).toHaveBeenCalledWith({ installation_id: 77 });
    expect(JSON.stringify(getInstallation.mock.calls)).not.toContain('permissions');
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
    const commit = mapGithubCommit(
      { sha: 'abc', commit: { author: { date: '2026-01-01T00:00:00Z' } } },
      'trunk'
    );
    expect(commit).toMatchObject({ hash: 'abc', date: expect.any(Date) });
    expect(commit).not.toHaveProperty('branch');
    expect(
      mapGithubPullRequest({ id: 2, number: 2, title: 'PR', base: { ref: 'trunk' } })
    ).toMatchObject({ githubId: '2', targetBranch: 'trunk' });
    expect(mapGithubIssue({ id: 4, pull_request: {} })).toBeNull();
  });

  it('valida acesso da instalação com uma única chamada e aceita zero repositórios', async () => {
    const listRepos = vi.fn().mockResolvedValue({
      data: { total_count: 0, repositories: [] },
      headers: {
        link: '<https://api.github.com/installation/repositories?page=2>; rel="next"'
      }
    });
    const requestExecutor = vi.fn((operation) => operation());
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor
    });

    await expect(client.verifyRepositoryAccess()).resolves.toBeUndefined();
    expect(listRepos).toHaveBeenCalledOnce();
    expect(listRepos).toHaveBeenCalledWith({ per_page: 1, page: 1 });
    expect(requestExecutor).toHaveBeenCalledOnce();
  });

  it.each([403, 429])('propaga erro GitHub %s na verificação mínima de acesso', async (status) => {
    const githubError = Object.assign(new Error('Falha GitHub normalizada'), { status });
    const listRepos = vi.fn().mockRejectedValue(githubError);
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(client.verifyRepositoryAccess()).rejects.toBe(githubError);
    expect(listRepos).toHaveBeenCalledOnce();
  });

  it('pagina até o fim e cria client exclusivamente com token de instalação recebido', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1], hasNext: true })
      .mockResolvedValueOnce({ items: [2], hasNext: false });
    await expect(collectGithubPages(paginateGithub(fetchPage, { perPage: 1 }))).resolves.toEqual([
      1, 2
    ]);
    const listRepos = vi.fn().mockResolvedValue({
      data: { total_count: 0, repositories: [] }
    });
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
        baseUrl: 'https://api.github.com',
        request: { timeout: expect.any(Number) }
      })
    );
    expect(listRepos).toHaveBeenCalledWith({ per_page: 100, page: 1 });
  });

  it('extrai um ou vários repositórios do envelope da instalação e preserva DTO mínimo', async () => {
    const repositories = [
      {
        id: 123,
        name: 'Traceflow',
        owner: { login: 'iYoNuttxD' },
        full_name: 'iYoNuttxD/Traceflow',
        html_url: 'https://github.com/iYoNuttxD/Traceflow',
        default_branch: 'main',
        private: false
      },
      {
        id: 124,
        name: 'Traceflow-Docs',
        owner: { login: 'iYoNuttxD' },
        full_name: 'iYoNuttxD/Traceflow-Docs',
        html_url: 'https://github.com/iYoNuttxD/Traceflow-Docs',
        default_branch: 'trunk',
        private: true
      }
    ];
    const listRepos = vi
      .fn()
      .mockResolvedValueOnce({ data: { total_count: 1, repositories: repositories.slice(0, 1) } })
      .mockResolvedValueOnce({ data: { total_count: repositories.length, repositories } });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(collectGithubPages(client.listRepositoryPages())).resolves.toEqual([
      expect.objectContaining({ githubRepositoryId: '123', name: 'Traceflow' })
    ]);
    const listed = await collectGithubPages(client.listRepositoryPages());
    expect(listed).toEqual([
      expect.objectContaining({
        githubRepositoryId: '123',
        name: 'Traceflow',
        owner: 'iYoNuttxD',
        fullName: 'iYoNuttxD/Traceflow',
        defaultBranch: 'main',
        private: false
      }),
      expect.objectContaining({ githubRepositoryId: '124', private: true })
    ]);
    expect(JSON.stringify(listed)).not.toContain('installation-token-artificial');
  });

  it('distingue instalação sem repositórios de envelope inválido', async () => {
    const listRepos = vi
      .fn()
      .mockResolvedValueOnce({ data: { total_count: 0, repositories: [] } })
      .mockResolvedValueOnce({ data: { total_count: 1 } })
      .mockResolvedValueOnce({ data: { total_count: 1, repositories: {} } });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(collectGithubPages(client.listRepositoryPages())).resolves.toEqual([]);
    await expect(collectGithubPages(client.listRepositoryPages())).rejects.toThrow(
      'Resposta inválida ao listar repositórios da instalação.'
    );
    await expect(collectGithubPages(client.listRepositoryPages())).rejects.toThrow(
      'Resposta inválida ao listar repositórios da instalação.'
    );
  });

  it('coleta mais de 100 repositórios sem usar total_count como tamanho da página', async () => {
    const repository = (id) => ({
      id,
      name: `repo-${id}`,
      owner: { login: 'traceflow' },
      full_name: `traceflow/repo-${id}`,
      html_url: `https://github.com/traceflow/repo-${id}`,
      default_branch: 'main',
      private: false
    });
    const firstPage = Array.from({ length: 100 }, (_, index) => repository(index + 1));
    const listRepos = vi
      .fn()
      .mockResolvedValueOnce({
        data: { total_count: 101, repositories: firstPage },
        headers: { link: '<https://api.github.com/installation/repositories?page=2>; rel="next"' }
      })
      .mockResolvedValueOnce({
        data: { total_count: 101, repositories: [repository(101)] },
        headers: {}
      });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = { apps: { listReposAccessibleToInstallation: listRepos } };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(collectGithubPages(client.listRepositoryPages())).resolves.toHaveLength(101);
    expect(listRepos).toHaveBeenNthCalledWith(1, { per_page: 100, page: 1 });
    expect(listRepos).toHaveBeenNthCalledWith(2, { per_page: 100, page: 2 });
  });

  it('mantém branches, commits, pull requests e issues paginados em arrays', async () => {
    const listBranches = vi.fn().mockResolvedValue({
      data: [
        { name: 'main', commit: { sha: 'abc' } },
        { name: 'feature', commit: { sha: 'def' } }
      ],
      headers: {}
    });
    const listCommits = vi.fn().mockResolvedValue({
      data: [{ sha: 'abc', commit: { message: 'commit', author: { date: '2030-01-01' } } }],
      headers: {}
    });
    const listPullRequests = vi.fn().mockResolvedValue({
      data: [
        { id: 2, number: 2, title: 'PR A', head: { ref: 'feature-a' }, base: { ref: 'main' } },
        { id: 3, number: 3, title: 'PR B', head: { ref: 'feature-b' }, base: { ref: 'develop' } },
        { id: 4, number: 4, title: 'PR C', head: { ref: 'main' }, base: { ref: 'release' } }
      ],
      headers: {}
    });
    const listIssues = vi.fn().mockResolvedValue({
      data: [{ id: 3, number: 3, title: 'Issue', labels: [] }],
      headers: {}
    });
    const OctokitClass = vi.fn(function OctokitDouble() {
      this.rest = {
        repos: { listBranches, listCommits },
        pulls: { list: listPullRequests },
        issues: { listForRepo: listIssues }
      };
    });
    const client = createGithubClient({
      auth: 'installation-token-artificial',
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await expect(
      collectGithubPages(client.listBranchPages({ owner: 'traceflow', repo: 'repo' }))
    ).resolves.toEqual([
      { name: 'main', headSha: 'abc' },
      { name: 'feature', headSha: 'def' }
    ]);

    const commits = await collectGithubPages(
      client.listCommitPages({ owner: 'traceflow', repo: 'repo', branch: 'main' })
    );
    expect(commits).toEqual([expect.objectContaining({ hash: 'abc' })]);
    expect(commits[0]).not.toHaveProperty('branch');
    await expect(
      collectGithubPages(client.listPullRequestPages({ owner: 'traceflow', repo: 'repo' }))
    ).resolves.toEqual([
      expect.objectContaining({ githubId: '2', sourceBranch: 'feature-a', targetBranch: 'main' }),
      expect.objectContaining({
        githubId: '3',
        sourceBranch: 'feature-b',
        targetBranch: 'develop'
      }),
      expect.objectContaining({ githubId: '4', sourceBranch: 'main', targetBranch: 'release' })
    ]);
    expect(listPullRequests).toHaveBeenCalledWith({
      owner: 'traceflow',
      repo: 'repo',
      state: 'all',
      per_page: 100,
      page: 1
    });
    await expect(
      collectGithubPages(client.listIssuePages({ owner: 'traceflow', repo: 'repo' }))
    ).resolves.toEqual([expect.objectContaining({ githubId: '3', title: 'Issue' })]);
  });
});
