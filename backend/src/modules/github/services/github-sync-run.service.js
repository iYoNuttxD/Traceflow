import { githubSyncRunRepository } from '../github-sync-run.repository.js';
import { projectRepository } from '../../projects/project.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { parseProjectId, ProjectServiceError } from '../../projects/project.schema.js';
import { logger } from '../../../shared/logger/index.js';
import { normalizeGithubSyncError, syncProjectGithubData } from './sync-project-github.service.js';

export const GITHUB_SYNC_STALE_AFTER_MS = 30 * 60 * 1000;

function publicRun(run, { alreadyRunning = false } = {}) {
  if (!run) return null;
  return {
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    step: run.step,
    currentBranch: run.currentBranch,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    alreadyRunning,
    progress: {
      branchCount: run.branchCount,
      processedBranches: run.processedBranches,
      commitPages: run.commitPages
    },
    summary: {
      branches: { found: run.branchCount, active: run.branchCount },
      commits: {
        found: run.commitsFound,
        foundAcrossBranches: run.commitsObserved,
        created: run.commitsCreated,
        linksCreated: run.commitLinksCreated
      },
      pullRequests: {
        found: run.pullRequestsFound,
        created: run.pullRequestsCreated,
        updated: run.pullRequestsUpdated
      },
      issues: {
        found: run.issuesFound,
        created: run.issuesCreated,
        updated: run.issuesUpdated
      }
    },
    error: run.errorCode
      ? { code: run.errorCode, message: run.errorMessage || 'A sincronização não foi concluída.' }
      : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

async function assertProjectCanSync(projectId) {
  const project = await projectRepository.findById(projectId);
  if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
  const integration = project.githubIntegration;
  if (!integration?.repositoryFullName || !integration.repositoryName) {
    throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }
  if (
    !integration ||
    integration.status !== 'ACTIVE' ||
    integration.installation?.status !== 'ACTIVE'
  ) {
    throw new ProjectServiceError('Reconecte a GitHub App antes de sincronizar este projeto.', 409);
  }
}

async function recordRunAudit(run, action, result = 'SUCCESS', reasonCode) {
  try {
    await auditService.recordOperational({
      actorUserId: run.requestedByUserId,
      projectId: run.projectId,
      action,
      resourceType: 'GitHubSyncRun',
      resourceId: run.id,
      result,
      reasonCode
    });
  } catch (error) {
    logger.warn('Não foi possível registrar a auditoria da execução GitHub.', {
      event: 'github_sync_run_audit_failed',
      projectId: run.projectId,
      runId: run.id,
      action,
      errorCode: error.code || 'AUDIT_FAILED'
    });
  }
}

export async function executeGithubSyncRun(runId) {
  const claimedAt = new Date();
  if (!(await githubSyncRunRepository.claim(runId, claimedAt))) return null;
  const run = await githubSyncRunRepository.findById(runId);
  if (!run) return null;
  const startedAtMs = claimedAt.getTime();

  logger.info('Execução persistida de sincronização GitHub iniciada.', {
    event: 'github_sync_run_started',
    projectId: run.projectId,
    runId: run.id
  });

  try {
    const result = await syncProjectGithubData(run.projectId, {
      onProgress: (progress) => githubSyncRunRepository.updateProgress(run.id, progress)
    });
    const finishedAt = new Date();
    const completed = await githubSyncRunRepository.succeed(
      run.id,
      result.summary,
      finishedAt,
      finishedAt.getTime() - startedAtMs
    );
    await recordRunAudit(run, 'GITHUB_SYNC_SUCCEEDED');
    logger.info('Execução persistida de sincronização GitHub concluída.', {
      event: 'github_sync_run_completed',
      projectId: run.projectId,
      runId: run.id,
      durationMs: completed.durationMs,
      branchCount: completed.branchCount,
      items: completed.commitsObserved
    });
    return publicRun(completed);
  } catch (error) {
    const finishedAt = new Date();
    const errorCode = String(error.code || 'GITHUB_SYNC_FAILED').slice(0, 191);
    const errorMessage = normalizeGithubSyncError(error).slice(0, 191);
    const failed = await githubSyncRunRepository.fail(run.id, {
      errorCode,
      errorMessage,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAtMs
    });
    await recordRunAudit(run, 'GITHUB_SYNC_FAILED', 'FAILURE', errorCode);
    logger.warn('Execução persistida de sincronização GitHub falhou.', {
      event: 'github_sync_run_failed',
      projectId: run.projectId,
      runId: run.id,
      step: failed.step,
      branch: failed.currentBranch,
      durationMs: failed.durationMs,
      errorCode
    });
    return publicRun(failed);
  }
}

function scheduleInProcess(runId) {
  setImmediate(() => {
    void executeGithubSyncRun(runId).catch((error) => {
      logger.error('Falha inesperada ao iniciar a execução persistida do GitHub.', {
        event: 'github_sync_run_worker_failed',
        runId,
        errorCode: error.code || 'GITHUB_SYNC_WORKER_FAILED'
      });
    });
  });
}

async function expireStaleRun(projectId, now = new Date()) {
  const cutoff = new Date(now.getTime() - GITHUB_SYNC_STALE_AFTER_MS);
  const expired = await githubSyncRunRepository.expireStale(projectId, cutoff, now);
  if (expired.count > 0) {
    await projectRepository.markGithubSyncFailed(
      projectId,
      now,
      'A execução foi interrompida antes da conclusão.'
    );
  }
}

export async function requestProjectGithubSync(
  projectId,
  requestedByUserId,
  { schedule = scheduleInProcess, now = new Date() } = {}
) {
  const parsedProjectId = parseProjectId(projectId);
  await assertProjectCanSync(parsedProjectId);
  await expireStaleRun(parsedProjectId, now);

  const active = await githubSyncRunRepository.findActive(parsedProjectId);
  if (active) return publicRun(active, { alreadyRunning: true });

  let run;
  try {
    run = await githubSyncRunRepository.create(parsedProjectId, requestedByUserId);
  } catch (error) {
    if (!githubSyncRunRepository.isActiveConflict(error)) throw error;
    const raced = await githubSyncRunRepository.findActive(parsedProjectId);
    if (raced) return publicRun(raced, { alreadyRunning: true });
    throw error;
  }

  schedule(run.id);
  return publicRun(run);
}

export async function getProjectGithubSyncStatus(projectId, { now = new Date() } = {}) {
  const parsedProjectId = parseProjectId(projectId);
  await expireStaleRun(parsedProjectId, now);
  const active = await githubSyncRunRepository.findActive(parsedProjectId);
  return publicRun(active || (await githubSyncRunRepository.findLatest(parsedProjectId)));
}
