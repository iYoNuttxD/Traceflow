// Service de consulta dos commits importados pelo contrato atual.
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
