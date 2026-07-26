import { projectRepository } from '../project.repository.js';
import {
  buildEditableProjectData,
  parseProjectId,
  ProjectServiceError
} from '../project.schema.js';
import { buildProjectInviteData } from './project-invite.service.js';

function protectGithubRepositoryIdentity(project, projectData) {
  const hasGithubIdentity = ['githubOwner', 'githubRepo', 'githubUrl'].some(
    (field) => projectData[field] !== undefined
  );
  if (!hasGithubIdentity) return;

  const current = {
    githubOwner: project.githubOwner,
    githubRepo: project.githubRepositoryName || project.githubRepo,
    githubUrl: project.githubRepositoryUrl || project.githubUrl
  };
  const changed = Object.entries(current).some(
    ([field, value]) => projectData[field] !== undefined && projectData[field] !== value
  );

  if (changed) {
    throw new ProjectServiceError(
      'O repositório integrado não pode ser alterado pela edição comum do projeto.',
      400
    );
  }
}

export const projectCrudService = {
  async createProject(data, ownerUserId) {
    const projectData = {
      ...buildEditableProjectData(data, true),
      ...(await buildProjectInviteData())
    };
    return projectRepository.createProject(projectData, ownerUserId);
  },

  async findAllProjects(userId) {
    return projectRepository.findAllProjects(userId);
  },

  async getProjectById(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
    return project;
  },

  async updateProject(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);

    const projectData = buildEditableProjectData(data);
    protectGithubRepositoryIdentity(project, projectData);
    if (Object.keys(projectData).length === 0) return project;
    return projectRepository.updateProject(parsedProjectId, projectData);
  }
};
