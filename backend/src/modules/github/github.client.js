import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { githubAppCredentialProvider } from './github-credential.provider.js';
import {
  mapGithubBranch,
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest,
  mapGithubRepository
} from './github.mapper.js';
import { paginateGithub } from './github-pagination.js';
import { executeGithubRequest } from './github-request.js';

const PAGE_SIZE = 100;
const extractArrayItems = (data) => data;
const extractInstallationRepositories = (data) => {
  if (!data || !Array.isArray(data.repositories)) {
    throw new Error('Resposta inválida ao listar repositórios da instalação.');
  }
  return data.repositories;
};
const hasNextPage = (response, count) =>
  typeof response?.headers?.link === 'string'
    ? /rel="next"/.test(response.headers.link)
    : count === PAGE_SIZE;

export function createGithubClient({
  auth,
  OctokitClass = Octokit,
  requestExecutor = executeGithubRequest
} = {}) {
  if (!auth) throw new Error('Installation access token is required.');
  const octokit = new OctokitClass({
    auth,
    baseUrl: 'https://api.github.com',
    request: { timeout: env.githubRequestTimeoutMs }
  });
  async function requestPage(
    endpoint,
    params,
    mapper,
    { filter, extractItems = extractArrayItems } = {}
  ) {
    const response = await requestExecutor(() => endpoint(params));
    const pageItems = extractItems(response.data);
    if (!Array.isArray(pageItems)) {
      throw new Error('Formato de resposta paginada do GitHub inesperado.');
    }
    const mapped = pageItems.map(mapper);
    const items = typeof filter === 'function' ? mapped.filter(filter) : mapped;
    return { items, hasNext: hasNextPage(response, pageItems.length) };
  }
  return Object.freeze({
    async getRepository(owner, repo) {
      const response = await requestExecutor(() => octokit.rest.repos.get({ owner, repo }));
      return mapGithubRepository(response.data);
    },
    listRepositoryPages() {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.apps.listReposAccessibleToInstallation,
            { per_page: perPage, page },
            mapGithubRepository,
            { extractItems: extractInstallationRepositories }
          ),
        { perPage: PAGE_SIZE }
      );
    },
    listCommitPages({ owner, repo, branch }) {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.repos.listCommits,
            { owner, repo, sha: branch, per_page: perPage, page },
            mapGithubCommit
          ),
        { perPage: PAGE_SIZE }
      );
    },
    listBranchPages({ owner, repo }) {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.repos.listBranches,
            { owner, repo, per_page: perPage, page },
            mapGithubBranch
          ),
        { perPage: PAGE_SIZE }
      );
    },
    listPullRequestPages({ owner, repo }) {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.pulls.list,
            { owner, repo, state: 'all', per_page: perPage, page },
            mapGithubPullRequest
          ),
        { perPage: PAGE_SIZE }
      );
    },
    listIssuePages({ owner, repo }) {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.issues.listForRepo,
            { owner, repo, state: 'all', per_page: perPage, page },
            mapGithubIssue,
            { filter: Boolean }
          ),
        { perPage: PAGE_SIZE }
      );
    }
  });
}

export function createGithubInstallationClientFactory({
  credentialProvider = githubAppCredentialProvider
} = {}) {
  return Object.freeze({
    async forInstallation(installationId) {
      const token = await credentialProvider.createInstallationToken(installationId);
      return createGithubClient({ auth: token });
    }
  });
}

export const githubInstallationClientFactory = createGithubInstallationClientFactory();
