// Service de consulta das Pull Requests importadas pelo contrato atual.
import { projectRepository } from '../projects/project.repository.js';
import { pullRequestRepository } from './pullRequest.repository.js';
import { DomainError as PullRequestServiceError } from '../../shared/errors/index.js';

export const pullRequestService = {
  async listProjectPullRequests(projectId, query = {}) {
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new PullRequestServiceError('Projeto não encontrado.', 404);
    }

    return pullRequestRepository.listByProjectId(projectId, {
      search: query.search
    });
  }
};
