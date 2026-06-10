// Service de Issues importadas.
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
    throw new IssueServiceError('ID do projeto inválido.', 400);
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

export const issueService = {
  async listProjectIssues(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new IssueServiceError('Projeto não encontrado.', 404);
    }

    return issueRepository.listByProjectId(parsedProjectId, {
      search: normalizeSearch(query.search)
    });
  }
};
