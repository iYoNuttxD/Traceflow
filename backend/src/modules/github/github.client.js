// Cliente de integracao com GitHub via Octokit.
// Este arquivo centraliza autenticacao e comunicacao externa com a API do GitHub.
// TODO: Adicionar funcoes para repositorio, commits, pull requests e issues em tarefas futuras.
import { Octokit } from '@octokit/rest';
import { env } from '../../config/env.js';
import { ERROR_CODES, ExternalServiceError } from '../../shared/errors/index.js';

let octokitInstance = null;

export function getGithubClient() {
  if (!octokitInstance) {
    const token = env.githubToken;

    if (!token) {
      throw new ExternalServiceError(
        'Integração GitHub indisponível.',
        500,
        ERROR_CODES.GITHUB_AUTH_FAILED
      );
    }

    octokitInstance = new Octokit({
      auth: token,
      baseUrl: 'https://api.github.com',
      request: { timeout: env.githubRequestTimeoutMs }
    });
  }

  return octokitInstance;
}

export async function checkGithubAuthentication() {
  const github = getGithubClient();
  const { executeGithubRequest } = await import('./github-request.js');
  const response = await executeGithubRequest(() => github.rest.users.getAuthenticated());

  return {
    login: response.data.login,
    id: response.data.id,
    type: response.data.type
  };
}

export async function getGithubRepository(owner, repo) {
  const github = getGithubClient();
  const { executeGithubRequest } = await import('./github-request.js');
  const response = await executeGithubRequest(() => github.rest.repos.get({ owner, repo }));

  return response.data;
}
