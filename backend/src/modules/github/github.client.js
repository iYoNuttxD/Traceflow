// Cliente de integracao com GitHub via Octokit.
// Este arquivo centraliza autenticacao e comunicacao externa com a API do GitHub.
// TODO: Adicionar funcoes para repositorio, commits, pull requests e issues em tarefas futuras.
import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';

let octokitInstance = null;

export function getGithubClient() {
  if (!octokitInstance) {
    const token = env.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      throw new Error(
        'GITHUB_TOKEN nao configurado. Defina a variavel no arquivo .env para usar a integracao com GitHub.'
      );
    }

    octokitInstance = new Octokit({
      auth: token
    });
  }

  return octokitInstance;
}

export async function checkGithubAuthentication() {
  const github = getGithubClient();
  const response = await github.rest.users.getAuthenticated();

  return {
    login: response.data.login,
    id: response.data.id,
    type: response.data.type
  };
}

export async function getGithubRepository(owner, repo) {
  const github = getGithubClient();
  const response = await github.rest.repos.get({ owner, repo });

  return response.data;
}
