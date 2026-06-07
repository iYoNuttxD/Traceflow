// Service GitHub: coordena casos de uso do modulo sem acessar HTTP diretamente.
// TODO: Implementar importacao de commits, pull requests e issues em tarefas futuras.
import { checkGithubAuthentication, getGithubClient } from './github.client.js';

function mapRepository(repo) {
  return {
    githubRepositoryId: String(repo.id),
    name: repo.name,
    owner: repo.owner.login,
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    private: repo.private,
    description: repo.description
  };
}

export const githubService = {
  async checkAuthentication() {
    return checkGithubAuthentication();
  },

  async listRepositories() {
    const github = getGithubClient();
    const response = await github.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated'
    });

    return response.data.map(mapRepository);
  }
};
