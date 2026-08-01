import { githubInstallationClientFactory } from '../github.client.js';
import { githubRepository as githubIntegrationRepository } from '../github.repository.js';
import { normalizeGithubError } from '../github-error.js';
import { projectRepository } from '../../projects/project.repository.js';
import {
  buildGithubRepositoryMetadata,
  parseProjectId,
  ProjectServiceError
} from '../../projects/project.schema.js';
import { syncProjectCommits } from './sync-project-commits.service.js';
import { syncProjectIssues } from './sync-project-issues.service.js';
import { syncProjectPullRequests } from './sync-project-pull-requests.service.js';

const projectsInSync = new Set();

function linkedRepositoryCoordinates(project) {
  const repo = project.githubRepositoryName || project.githubRepo;
  if (!project.githubOwner || !repo) {
    throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }
  return { owner: project.githubOwner, repo };
}

function normalizeGithubSyncError(error) {
  if (error instanceof ProjectServiceError) return error.message;
  return normalizeGithubError(error).message;
}

async function validateAndRefreshRepository(project, githubClient) {
  const coordinates = linkedRepositoryCoordinates(project);
  const repository = await githubClient.getRepository(coordinates.owner, coordinates.repo);

  if (
    project.githubRepositoryId &&
    repository.githubRepositoryId !== String(project.githubRepositoryId)
  ) {
    throw new ProjectServiceError(
      'Dados do repositório GitHub não correspondem ao projeto integrado.',
      400
    );
  }

  const metadata = buildGithubRepositoryMetadata(repository);
  if (!project.githubIntegratedAt) metadata.githubIntegratedAt = new Date();
  await projectRepository.updateGithubRepositoryMetadata(project.id, metadata);
  return repository;
}

export async function syncProjectGithubData(projectId) {
  const parsedProjectId = parseProjectId(projectId);
  if (projectsInSync.has(parsedProjectId)) {
    throw new ProjectServiceError(
      'Sincronização do GitHub já está em andamento para este projeto.',
      409
    );
  }

  projectsInSync.add(parsedProjectId);
  const attemptedAt = new Date();
  let project;

  try {
    project = await projectRepository.findById(parsedProjectId);
    if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
    linkedRepositoryCoordinates(project);
    await projectRepository.markGithubSyncStarted(parsedProjectId, attemptedAt);

    const integration = await githubIntegrationRepository.findIntegration(parsedProjectId);
    if (
      !integration ||
      integration.status !== 'ACTIVE' ||
      integration.installation?.status !== 'ACTIVE'
    ) {
      throw new ProjectServiceError(
        'Reconecte a GitHub App antes de sincronizar este projeto.',
        409
      );
    }
    const githubClient = await githubInstallationClientFactory.forInstallation(
      integration.installation.githubInstallationId
    );
    const repository = await validateAndRefreshRepository(project, githubClient);
    const commitSummary = await syncProjectCommits({ project, repository, githubClient });
    const pullRequestSummary = await syncProjectPullRequests({ project, repository, githubClient });
    const issueSummary = await syncProjectIssues({ project, repository, githubClient });
    const updatedProject = await projectRepository.markGithubSyncSucceeded(
      parsedProjectId,
      new Date()
    );

    return {
      summary: {
        commits: commitSummary,
        pullRequests: pullRequestSummary,
        issues: issueSummary
      },
      project: updatedProject
    };
  } catch (error) {
    if (project) {
      await projectRepository.markGithubSyncFailed(
        parsedProjectId,
        attemptedAt,
        normalizeGithubSyncError(error).slice(0, 255)
      );
    }
    throw error;
  } finally {
    projectsInSync.delete(parsedProjectId);
  }
}
