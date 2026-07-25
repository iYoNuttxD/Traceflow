import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { githubCredentialProvider } from './github-credential.provider.js';
import {
  mapGithubCommit,
  mapGithubIssue,
  mapGithubPullRequest,
  mapGithubRepository
} from './github.mapper.js';
import { paginateGithub } from './github-pagination.js';
import { executeGithubRequest } from './github-request.js';

const PAGE_SIZE = 100;

function hasNextPage(response, itemCount) {
  const link = response?.headers?.link;
  if (typeof link === 'string') return /rel="next"/.test(link);
  return itemCount === PAGE_SIZE;
}

export function createGithubClient({
  credentialProvider = githubCredentialProvider,
  OctokitClass = Octokit,
  requestExecutor = executeGithubRequest
} = {}) {
  const octokit = new OctokitClass({
    auth: credentialProvider.getToken(),
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
    async checkAuthentication() {
      const response = await requestExecutor(() => octokit.rest.users.getAuthenticated());
      return {
        login: response.data.login,
        id: response.data.id,
        type: response.data.type
      };
    },

    async getRepository(owner, repo) {
      const response = await requestExecutor(() => octokit.rest.repos.get({ owner, repo }));
      return mapGithubRepository(response.data);
    },

    listRepositoryPages() {
      return paginateGithub(({ page, perPage }) => requestPage(
        octokit.rest.repos.listForAuthenticatedUser,
        { per_page: perPage, page, sort: 'updated' },
        mapGithubRepository
      ), { perPage: PAGE_SIZE });
    },

    listCommitPages({ owner, repo, branch }) {
      return paginateGithub(({ page, perPage }) => requestPage(
        octokit.rest.repos.listCommits,
        { owner, repo, sha: branch, per_page: perPage, page },
        (item) => mapGithubCommit(item, branch)
      ), { perPage: PAGE_SIZE });
    },

    listPullRequestPages({ owner, repo, branch }) {
      return paginateGithub(({ page, perPage }) => requestPage(
        octokit.rest.pulls.list,
        { owner, repo, state: 'all', base: branch, per_page: perPage, page },
        mapGithubPullRequest,
        { filter: (pullRequest) => pullRequest.targetBranch === branch }
      ), { perPage: PAGE_SIZE });
    },

    listIssuePages({ owner, repo }) {
      return paginateGithub(({ page, perPage }) => requestPage(
        octokit.rest.issues.listForRepo,
        { owner, repo, state: 'all', per_page: perPage, page },
        mapGithubIssue,
        { filter: Boolean }
      ), { perPage: PAGE_SIZE });
    }
  });
}

let githubClientInstance;

export function getGithubClient() {
  if (!githubClientInstance) githubClientInstance = createGithubClient();
  return githubClientInstance;
}

export function checkGithubAuthentication() {
  return getGithubClient().checkAuthentication();
}

export function getGithubRepository(owner, repo) {
  return getGithubClient().getRepository(owner, repo);
}
