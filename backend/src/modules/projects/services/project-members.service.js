import { projectRepository } from '../project.repository.js';
import {
  buildMemberData,
  normalizeAccessCode,
  parseProjectId,
  ProjectServiceError
} from '../project.schema.js';

export const projectMembersService = {
  async addProjectMember(projectId, data, defaultRole = 'MEMBRO') {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);

    const memberData = buildMemberData(data, defaultRole);
    if (memberData.email) {
      const existingMember = await projectRepository.findMemberByProjectEmail(
        parsedProjectId,
        memberData.email
      );
      if (existingMember) {
        throw new ProjectServiceError('Este membro já está vinculado ao projeto.', 409);
      }
    }
    return projectRepository.createProjectMember(parsedProjectId, memberData);
  },

  async joinProject(data, authenticatedUser) {
    const payload = data && typeof data === 'object' ? data : {};
    const accessCode = normalizeAccessCode(payload.accessCode);
    if (!accessCode) {
      throw new ProjectServiceError('Informe o código de acesso do projeto.', 400);
    }

    const project = await projectRepository.findProjectByAccessCode(accessCode);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
    const member = await projectMembersService.addProjectMember(project.id, payload);
    if (authenticatedUser?.id) {
      await projectRepository.upsertProjectMembership(
        project.id,
        authenticatedUser.id,
        payload.role
      );
    }

    return { project: { id: project.id, name: project.name }, member };
  }
};
