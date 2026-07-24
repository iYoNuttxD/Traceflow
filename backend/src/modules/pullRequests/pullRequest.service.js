// Service de Pull Requests importados.
// TODO: Adicionar filtros por estado, branch e autor quando o MVP evoluir.
import { projectRepository } from '../projects/project.repository.js';
import { pullRequestRepository } from './pullRequest.repository.js';
import { DomainError as PullRequestServiceError } from '../../shared/errors/index.js';

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new PullRequestServiceError('ID do projeto inválido.', 400);
  }

  return parsedProjectId;
}

function normalizeSearch(search) {
  if (search === undefined || search === null) {
    return undefined;
  }

  const normalizedSearch = String(search).trim();

  return normalizedSearch || undefined;
}

export const pullRequestService = {
  async listProjectPullRequests(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new PullRequestServiceError('Projeto não encontrado.', 404);
    }

    return pullRequestRepository.listByProjectId(parsedProjectId, {
      search: normalizeSearch(query.search)
    });
  }
};
