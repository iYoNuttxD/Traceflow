// Service de Issues importadas.
// TODO: Adicionar filtros por estado, label e responsavel quando o MVP evoluir.
import { projectRepository } from '../projects/project.repository.js';
import { issueRepository } from './issue.repository.js';

class IssueServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'IssueServiceError';
    this.statusCode = statusCode;
  }
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new IssueServiceError('ProjectId invalido.', 400);
  }

  return parsedProjectId;
}

export const issueService = {
  async listProjectIssues(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new IssueServiceError('Projeto nao encontrado.', 404);
    }

    return issueRepository.listByProjectId(parsedProjectId);
  }
};
