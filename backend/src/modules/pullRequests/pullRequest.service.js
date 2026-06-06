// Service de Pull Requests importados.
// TODO: Adicionar filtros por estado, branch e autor quando o MVP evoluir.
import { projectRepository } from '../projects/project.repository.js';
import { pullRequestRepository } from './pullRequest.repository.js';

class PullRequestServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PullRequestServiceError';
    this.statusCode = statusCode;
  }
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new PullRequestServiceError('ProjectId invalido.', 400);
  }

  return parsedProjectId;
}

export const pullRequestService = {
  async listProjectPullRequests(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new PullRequestServiceError('Projeto nao encontrado.', 404);
    }

    return pullRequestRepository.listByProjectId(parsedProjectId);
  }
};
