// Service de projetos: concentra regras do RF02 antes de persistir no banco.
// TODO: Implementar demais fluxos de RF01, RF21 e RF22 em tarefas futuras.
import { getGithubRepository } from '../github/github.client.js';
import { projectRepository } from './project.repository.js';

class ProjectServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ProjectServiceError';
    this.statusCode = statusCode;
  }
}

const requiredGithubFields = [
  'githubRepositoryId',
  'githubOwner',
  'githubRepositoryName',
  'githubRepositoryFullName',
  'githubRepositoryUrl',
  'githubDefaultBranch'
];

function validateGithubRepositoryData(data) {
  const missingField = requiredGithubFields.find((field) => !data[field]);

  if (missingField) {
    throw new ProjectServiceError('Dados do repositorio GitHub incompletos.', 400);
  }
}

async function ensureRepositoryIsNotLinked(data) {
  const projectById = await projectRepository.findByGithubRepositoryId(data.githubRepositoryId);

  if (projectById) {
    throw new ProjectServiceError('Ja existe um projeto vinculado a este repositorio GitHub.', 409);
  }

  const projectByFullName = await projectRepository.findByGithubRepositoryFullName(
    data.githubRepositoryFullName
  );

  if (projectByFullName) {
    throw new ProjectServiceError('Ja existe um projeto vinculado a este repositorio GitHub.', 409);
  }
}

async function verifyGithubRepositoryAccess(data) {
  try {
    const repository = await getGithubRepository(data.githubOwner, data.githubRepositoryName);
    const repositoryId = String(repository.id);

    if (
      repositoryId !== String(data.githubRepositoryId) ||
      repository.full_name !== data.githubRepositoryFullName
    ) {
      throw new ProjectServiceError(
        'Dados do repositorio GitHub nao correspondem ao repositorio acessivel.',
        400
      );
    }

    return repository;
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    if (error.status === 404) {
      throw new ProjectServiceError('Repositorio GitHub nao encontrado ou sem permissao de acesso.', 404);
    }

    throw error;
  }
}

function buildProjectData(data, repository) {
  const projectName = data.name || data.nome || data.githubRepositoryName;
  const description = data.description ?? repository.description;

  return {
    name: projectName,
    description,
    status: 'ATIVO',
    githubOwner: repository.owner.login,
    githubRepo: repository.name,
    githubUrl: repository.html_url,
    githubRepositoryId: String(repository.id),
    githubRepositoryName: repository.name,
    githubRepositoryFullName: repository.full_name,
    githubRepositoryUrl: repository.html_url,
    githubDefaultBranch: repository.default_branch,
    githubIsPrivate: repository.private,
    githubIntegratedAt: new Date()
  };
}

export const projectService = {
  async createProjectFromGithubRepository(data) {
    validateGithubRepositoryData(data);
    const repository = await verifyGithubRepositoryAccess(data);
    const projectData = buildProjectData(data, repository);

    await ensureRepositoryIsNotLinked(projectData);

    return projectRepository.createFromGithub(projectData);
  }
};
