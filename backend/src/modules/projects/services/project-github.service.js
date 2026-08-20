import { githubAppService } from '../../github/github-app.service.js';
import { projectRepository } from '../project.repository.js';
import {
  parseProjectId,
  ProjectServiceError,
  validateGithubAutoSyncEnabled
} from '../project.schema.js';
import { buildProjectAccessData } from './project-access-code.service.js';

export const projectGithubService = {
  async createProjectFromGithubRepository(data, ownerUserId) {
    const { installation, repository } = await githubAppService.resolveAuthorizedRepository(
      ownerUserId,
      data.githubInstallationId,
      data.githubRepositoryId
    );
    await githubAppService.assertRepositoryAvailable(
      repository.githubRepositoryId,
      null,
      ownerUserId
    );
    const projectData = {
      name: (data.name || repository.name).trim(),
      description: data.description?.trim() || repository.description || null,
      responsibleTeam: data.responsibleTeam?.trim() || 'Equipe do projeto',
      ...(await buildProjectAccessData())
    };
    try {
      return await projectRepository.createGithubAppProject(
        projectData,
        ownerUserId,
        installation.id,
        repository
      );
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ProjectServiceError(
          'Já existe um projeto vinculado a este repositório GitHub.',
          409
        );
      }
      throw error;
    }
  },
  async updateGithubSyncSettings(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    validateGithubAutoSyncEnabled(data.githubAutoSyncEnabled);
    const project = await projectRepository.findById(parsedProjectId);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
    if (!project.githubIntegration)
      throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
    return projectRepository.updateGithubSyncSettings(parsedProjectId, data.githubAutoSyncEnabled);
  }
};
