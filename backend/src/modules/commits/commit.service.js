// Service de commits importados.
// TODO: Adicionar filtros por branch, autor e periodo quando o MVP evoluir.
import { projectRepository } from '../projects/project.repository.js';
import { commitRepository } from './commit.repository.js';
import { DomainError as CommitServiceError } from '../../shared/errors/index.js';

export const commitService = {
  async listProjectCommits(projectId, query = {}) {
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new CommitServiceError('Projeto não encontrado.', 404);
    }

    return commitRepository.listByProjectId(projectId, {
      search: query.search
    });
  }
};
