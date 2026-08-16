import { projectRepository } from '../project.repository.js';
import { buildMemberData, parseProjectId, ProjectServiceError } from '../project.schema.js';

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
  }
};
