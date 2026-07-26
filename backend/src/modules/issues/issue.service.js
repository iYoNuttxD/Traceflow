// Service de Issues importadas.
import { projectRepository } from '../projects/project.repository.js';
import { issueRepository } from './issue.repository.js';
import { DomainError as IssueServiceError } from '../../shared/errors/index.js';

export const issueService = {
  async listProjectIssues(projectId, query = {}) {
    const project = await projectRepository.findById(projectId);

    if (!project) {
      throw new IssueServiceError('Projeto não encontrado.', 404);
    }

    return issueRepository.listByProjectId(projectId, {
      search: query.search
    });
  }
};
