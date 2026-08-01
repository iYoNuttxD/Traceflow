import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { githubAppCredentialProvider } from './github-credential.provider.js';
import {
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest,
  mapGithubRepository
} from './github.mapper.js';
import { paginateGithub } from './github-pagination.js';
import { executeGithubRequest } from './github-request.js';

const PAGE_SIZE = 100;
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
  async function requestPage(endpoint, params, mapper, { filter } = {}) {
    const response = await requestExecutor(() => endpoint(params));
    const mapped = response.data.map(mapper);
    const items = typeof filter === 'function' ? mapped.filter(filter) : mapped;
    return { items, hasNext: hasNextPage(response, response.data.length) };
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
            mapGithubRepository
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
            (item) => mapGithubCommit(item, branch)
          ),
        { perPage: PAGE_SIZE }
      );
    },
    listPullRequestPages({ owner, repo, branch }) {
      return paginateGithub(
        ({ page, perPage }) =>
          requestPage(
            octokit.rest.pulls.list,
            { owner, repo, state: 'all', base: branch, per_page: perPage, page },
            mapGithubPullRequest,
            { filter: (item) => item.targetBranch === branch }
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
