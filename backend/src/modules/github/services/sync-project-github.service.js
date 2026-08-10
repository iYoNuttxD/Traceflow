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
import { syncProjectBranches } from './sync-project-branches.service.js';
import { syncProjectIssues } from './sync-project-issues.service.js';
import { syncProjectPullRequests } from './sync-project-pull-requests.service.js';
import { logger } from '../../../shared/logger/index.js';

const projectsInSync = new Set();
const noProgress = async () => {};

function linkedRepositoryCoordinates(project) {
  const repo = project.githubRepositoryName || project.githubRepo;
  if (!project.githubOwner || !repo) {
    throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }
  return { owner: project.githubOwner, repo };
}

export function normalizeGithubSyncError(error) {
  if (error instanceof ProjectServiceError) return error.message;
  return normalizeGithubError(error).message;
}

function logStep(event, projectId, step, startedAt, details = {}) {
  logger.info(`Etapa de sincronização GitHub ${event === 'started' ? 'iniciada' : 'concluída'}.`, {
    event: `github_sync_step_${event}`,
    projectId,
    step,
    ...(event === 'completed' ? { durationMs: Date.now() - startedAt } : {}),
    ...details
  });
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

export async function syncProjectGithubData(projectId, { onProgress = noProgress } = {}) {
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

    let stepStartedAt = Date.now();
    await onProgress({ step: 'REPOSITORY', currentBranch: null });
    logStep('started', parsedProjectId, 'repository', stepStartedAt);
    const repository = await validateAndRefreshRepository(project, githubClient);
    logStep('completed', parsedProjectId, 'repository', stepStartedAt);

    stepStartedAt = Date.now();
    await onProgress({ step: 'BRANCHES', currentBranch: null });
    logStep('started', parsedProjectId, 'branches', stepStartedAt);
    const branchResult = await syncProjectBranches({ project, repository, githubClient });
    await onProgress({ branchCount: branchResult.summary.found });
    logStep('completed', parsedProjectId, 'branches', stepStartedAt, {
      branchCount: branchResult.summary.found
    });

    stepStartedAt = Date.now();
    await onProgress({ step: 'COMMITS', processedBranches: 0, currentBranch: null });
    logStep('started', parsedProjectId, 'commits', stepStartedAt, {
      branchCount: branchResult.summary.active
    });
    const commitSummary = await syncProjectCommits({
      project,
      repository,
      branches: branchResult.branches,
      githubClient,
      onProgress
    });
    logStep('completed', parsedProjectId, 'commits', stepStartedAt, {
      branchCount: branchResult.summary.active,
      pages: commitSummary.pages,
      items: commitSummary.foundAcrossBranches
    });

    stepStartedAt = Date.now();
    await onProgress({ step: 'PULL_REQUESTS', currentBranch: null });
    logStep('started', parsedProjectId, 'pull_requests', stepStartedAt);
    const pullRequestSummary = await syncProjectPullRequests({ project, repository, githubClient });
    await onProgress({
      pullRequestsFound: pullRequestSummary.found,
      pullRequestsCreated: pullRequestSummary.created,
      pullRequestsUpdated: pullRequestSummary.updated
    });
    logStep('completed', parsedProjectId, 'pull_requests', stepStartedAt, {
      items: pullRequestSummary.found
    });

    stepStartedAt = Date.now();
    await onProgress({ step: 'ISSUES' });
    logStep('started', parsedProjectId, 'issues', stepStartedAt);
    const issueSummary = await syncProjectIssues({ project, repository, githubClient });
    await onProgress({
      issuesFound: issueSummary.found,
      issuesCreated: issueSummary.created,
      issuesUpdated: issueSummary.updated
    });
    logStep('completed', parsedProjectId, 'issues', stepStartedAt, {
      items: issueSummary.found
    });

    stepStartedAt = Date.now();
    await onProgress({ step: 'PERSIST' });
    logStep('started', parsedProjectId, 'persist', stepStartedAt);
    const updatedProject = await projectRepository.markGithubSyncSucceeded(
      parsedProjectId,
      new Date()
    );
    logStep('completed', parsedProjectId, 'persist', stepStartedAt);

    return {
      summary: {
        branches: branchResult.summary,
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
