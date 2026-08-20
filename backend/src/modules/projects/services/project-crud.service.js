import { projectRepository } from '../project.repository.js';
import {
  buildEditableProjectData,
  parseProjectId,
  ProjectServiceError
} from '../project.schema.js';
import { buildProjectAccessData } from './project-access-code.service.js';

export const projectCrudService = {
  async createProject(data, ownerUserId) {
    const projectData = {
      ...buildEditableProjectData(data, true),
      ...(await buildProjectAccessData())
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
    if (Object.keys(projectData).length === 0) return project;
    return projectRepository.updateProject(parsedProjectId, projectData);
  }
};
