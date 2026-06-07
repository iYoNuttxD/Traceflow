// Service GitHub: coordena casos de uso do modulo sem acessar HTTP diretamente.
// TODO: Implementar importacao de commits, pull requests e issues em tarefas futuras.
import {
  checkGithubAuthentication,
  getGithubClient,
  listGithubRepositoryCollaborators
} from './github.client.js';
import { projectRepository } from '../projects/project.repository.js';

class GithubServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'GithubServiceError';
    this.statusCode = statusCode;
  }
}

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

function mapCollaborator(collaborator) {
  return {
    login: collaborator.login,
    name: collaborator.name || collaborator.login,
    avatarUrl: collaborator.avatar_url,
    htmlUrl: collaborator.html_url,
    type: collaborator.type
  };
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new GithubServiceError('ID do projeto inválido.', 400);
  }

  return parsedProjectId;
}

function ensureGithubLinkedProject(project) {
  if (!project) {
    throw new GithubServiceError('Projeto não encontrado.', 404);
  }

  const repositoryName = project.githubRepositoryName || project.githubRepo;

  if (!project.githubOwner || !repositoryName) {
    throw new GithubServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }

  return {
    owner: project.githubOwner,
    repo: repositoryName
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
  },

  async listProjectRepositoryMembers(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findProjectById(parsedProjectId);
    const repository = ensureGithubLinkedProject(project);
    const collaborators = await listGithubRepositoryCollaborators(
      repository.owner,
      repository.repo
    );

    return collaborators.map(mapCollaborator);
  }
};
