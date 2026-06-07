// Service de commits importados.
// TODO: Adicionar filtros por branch, autor e periodo quando o MVP evoluir.
import { projectRepository } from '../projects/project.repository.js';
import { commitRepository } from './commit.repository.js';

class CommitServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CommitServiceError';
    this.statusCode = statusCode;
  }
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new CommitServiceError('ProjectId invalido.', 400);
  }

  return parsedProjectId;
}

export const commitService = {
  async listProjectCommits(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new CommitServiceError('Projeto nao encontrado.', 404);
    }

    return commitRepository.listByProjectId(parsedProjectId);
  }
};
