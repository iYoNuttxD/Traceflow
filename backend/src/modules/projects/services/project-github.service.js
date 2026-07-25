import { getGithubRepository } from '../../github/github.client.js';
import { projectRepository } from '../project.repository.js';
import {
  buildGithubProjectData,
  ensureGithubLinkedProject,
  parseProjectId,
  ProjectServiceError,
  validateGithubAutoSyncEnabled,
  validateGithubRepositoryData,
  validateOptionalGithubAutoSyncEnabled
} from '../project.schema.js';
import { buildProjectInviteData } from './project-invite.service.js';

async function ensureRepositoryIsNotLinked(data) {
  const projectById = await projectRepository.findByGithubRepositoryId(data.githubRepositoryId);
  if (projectById) {
    throw new ProjectServiceError('Já existe um projeto vinculado a este repositório GitHub.', 409);
  }

  const projectByFullName = await projectRepository.findByGithubRepositoryFullName(
    data.githubRepositoryFullName
  );
  if (projectByFullName) {
    throw new ProjectServiceError('Já existe um projeto vinculado a este repositório GitHub.', 409);
  }
}

async function verifyGithubRepositoryAccess(data) {
  try {
    const repository = await getGithubRepository(data.githubOwner, data.githubRepositoryName);
    if (
      repository.githubRepositoryId !== String(data.githubRepositoryId) ||
      repository.fullName !== data.githubRepositoryFullName
    ) {
      throw new ProjectServiceError('Dados do repositório GitHub não correspondem ao repositório acessível.', 400);
    }
    return repository;
  } catch (error) {
    if (error instanceof ProjectServiceError) throw error;
    if (error.status === 404 || error.statusCode === 404) {
      throw new ProjectServiceError('Repositório GitHub não encontrado ou sem permissão de acesso.', 404);
    }
    throw error;
  }
}

export const projectGithubService = {
  async createProjectFromGithubRepository(data, ownerUserId) {
    validateGithubRepositoryData(data);
    validateOptionalGithubAutoSyncEnabled(data.githubAutoSyncEnabled);
    const repository = await verifyGithubRepositoryAccess(data);
    const projectData = buildGithubProjectData(data, repository);
    const inviteData = await buildProjectInviteData();
    await ensureRepositoryIsNotLinked(projectData);
    return projectRepository.createProject({ ...projectData, ...inviteData }, ownerUserId);
  },

  async updateGithubSyncSettings(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    validateGithubAutoSyncEnabled(data.githubAutoSyncEnabled);
    const project = await projectRepository.findById(parsedProjectId);
    ensureGithubLinkedProject(project);
    return projectRepository.updateGithubSyncSettings(parsedProjectId, data.githubAutoSyncEnabled);
  }
};
