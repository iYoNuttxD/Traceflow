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
    throw new CommitServiceError('ID do projeto inválido.', 400);
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

export const commitService = {
  async listProjectCommits(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new CommitServiceError('Projeto não encontrado.', 404);
    }

    return commitRepository.listByProjectId(parsedProjectId, {
      search: normalizeSearch(query.search)
    });
  }
};
