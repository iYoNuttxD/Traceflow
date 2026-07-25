import { describe, expect, it, vi } from 'vitest';
import { createGithubCredentialProvider } from '../../src/modules/github/github-credential.provider.js';
import { createGithubClient } from '../../src/modules/github/github.client.js';
import {
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest,
  mapGithubRepository
} from '../../src/modules/github/github.mapper.js';
import { collectGithubPages, paginateGithub } from '../../src/modules/github/github-pagination.js';

describe('fronteira GitHub da E9', () => {
  it('resolve a credencial apenas no backend e falha sem expor o token', () => {
    expect(createGithubCredentialProvider({ environment: { githubToken: 'token-artificial' } }).getToken())
      .toBe('token-artificial');
    expect(() => createGithubCredentialProvider({ environment: {} }).getToken()).toThrow(
      'Integração GitHub indisponível.'
    );
  });

  it('normaliza Repository, Commit, PullRequest e Issue sem payload Octokit', () => {
    expect(mapGithubRepository({
      id: 1, name: 'repo', owner: { login: 'owner' }, full_name: 'owner/repo',
      html_url: 'https://github.com/owner/repo', default_branch: 'trunk', private: true
    })).toEqual({
      githubRepositoryId: '1', name: 'repo', owner: 'owner', fullName: 'owner/repo',
      url: 'https://github.com/owner/repo', defaultBranch: 'trunk', private: true,
      description: null
    });
    expect(mapGithubCommit({ sha: 'abc', commit: { author: { date: '2026-01-01T00:00:00Z' } } }, 'trunk'))
      .toMatchObject({ hash: 'abc', branch: 'trunk', date: expect.any(Date) });
    expect(mapGithubPullRequest({ id: 2, number: 2, title: 'PR', base: { ref: 'trunk' } }))
      .toMatchObject({ githubId: '2', targetBranch: 'trunk' });
    expect(mapGithubIssue({ id: 3, number: 3, title: 'Issue', labels: ['bug'] }))
      .toMatchObject({ githubId: '3', labels: ['bug'] });
    expect(mapGithubIssue({ id: 4, pull_request: {} })).toBeNull();
  });

  it('pagina até o fim e propaga interrupção sem ocultar páginas anteriores', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], hasNext: true })
      .mockResolvedValueOnce({ items: [3], hasNext: false });
    await expect(collectGithubPages(paginateGithub(fetchPage, { perPage: 2 })))
      .resolves.toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenNthCalledWith(2, { page: 2, perPage: 2 });

    const interrupted = paginateGithub(vi.fn()
      .mockResolvedValueOnce({ items: [1], hasNext: true })
      .mockRejectedValueOnce(new Error('interrompida')), { perPage: 1 });
    const first = await interrupted.next();
    expect(first.value).toEqual([1]);
    await expect(interrupted.next()).rejects.toThrow('interrompida');
  });

  it('factory fixa host/timeout e envia branch principal, state all e páginas', async () => {
    const calls = [];
    const endpoints = {
      users: { getAuthenticated: vi.fn(async () => ({ data: { login: 'owner', id: 1, type: 'User' } })) },
      repos: {
        get: vi.fn(async () => ({ data: { id: 1, name: 'repo', owner: { login: 'owner' }, full_name: 'owner/repo', html_url: 'https://github.com/owner/repo', default_branch: 'trunk', private: false } })),
        listForAuthenticatedUser: vi.fn(async (params) => { calls.push(['repos', params]); return { data: [] }; }),
        listCommits: vi.fn(async (params) => { calls.push(['commits', params]); return { data: [] }; })
      },
      pulls: { list: vi.fn(async (params) => { calls.push(['pulls', params]); return { data: [
        { id: 2, number: 2, title: 'Principal', base: { ref: 'trunk' } },
        { id: 3, number: 3, title: 'Outra', base: { ref: 'develop' } }
      ] }; }) },
      issues: { listForRepo: vi.fn(async (params) => { calls.push(['issues', params]); return { data: [{ id: 9, pull_request: {} }] }; }) }
    };
    const OctokitClass = vi.fn(function FakeOctokit(options) {
      this.options = options;
      this.rest = endpoints;
    });
    const client = createGithubClient({
      credentialProvider: { getToken: () => 'token-artificial' },
      OctokitClass,
      requestExecutor: (operation) => operation()
    });

    await collectGithubPages(client.listRepositoryPages());
    await collectGithubPages(client.listCommitPages({ owner: 'owner', repo: 'repo', branch: 'trunk' }));
    await expect(collectGithubPages(client.listPullRequestPages({ owner: 'owner', repo: 'repo', branch: 'trunk' })))
      .resolves.toEqual([expect.objectContaining({ githubId: '2', targetBranch: 'trunk' })]);
    await expect(collectGithubPages(client.listIssuePages({ owner: 'owner', repo: 'repo' }))).resolves.toEqual([]);

    expect(OctokitClass).toHaveBeenCalledWith(expect.objectContaining({
      auth: 'token-artificial', baseUrl: 'https://api.github.com'
    }));
    expect(calls).toContainEqual(['commits', expect.objectContaining({ sha: 'trunk', page: 1 })]);
    expect(calls).toContainEqual(['pulls', expect.objectContaining({ state: 'all', base: 'trunk', page: 1 })]);
    expect(calls).toContainEqual(['issues', expect.objectContaining({ state: 'all', page: 1 })]);
  });
});
