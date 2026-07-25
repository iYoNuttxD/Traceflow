import { checkGithubAuthentication, getGithubClient } from './github.client.js';
import { collectGithubPages } from './github-pagination.js';

export const githubService = {
  async checkAuthentication() {
    return checkGithubAuthentication();
  },

  async listRepositories() {
    return collectGithubPages(getGithubClient().listRepositoryPages());
  }
};
