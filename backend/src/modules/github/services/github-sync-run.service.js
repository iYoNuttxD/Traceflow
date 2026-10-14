import { githubSyncRunRepository } from '../github-sync-run.repository.js';
import { projectRepository } from '../../projects/project.repository.js';
import { auditService } from '../../audit/audit.service.js';
import { parseProjectId, ProjectServiceError } from '../../projects/project.schema.js';
import { logger } from '../../../shared/logger/index.js';
import { traceabilityAlertService } from '../../traceability/traceability-alert.service.js';
import { githubEventNotificationService } from '../../notifications/github-event-notification.service.js';
import { githubRetryNotBefore, githubSyncFailure, normalizeGithubError } from '../github-error.js';
import { syncProjectGithubData } from './sync-project-github.service.js';

import { env } from '../../../config/env.js';
import { withProjectWriteGuard } from '../../projects/project-write-context.js';

export const GITHUB_SYNC_STALE_AFTER_MS = env.githubSyncLeaseMs;
const FAILURE_RECORD_PAUSES_MS = [250, 500];
const CONNECTION_FAILURES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2025',
  'P2028'
]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function publicRun(run, { alreadyRunning = false } = {}) {
  if (!run) return null;
  return {
    id: run.id,
    projectId: run.projectId,
    origin: run.origin,
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

async function recordFailure(run, failure) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return attempt === 0
        ? await githubSyncRunRepository.fail(run.id, failure)
        : await githubSyncRunRepository.failOnRecoveryConnection(run.id, failure);
    } catch (error) {
      if (!CONNECTION_FAILURES.has(error?.code) || attempt >= FAILURE_RECORD_PAUSES_MS.length) {
        logger.error('Não foi possível registrar a falha da execução GitHub.', {
          event: 'github_sync_run_failure_unrecorded',
          projectId: run.projectId,
          runId: run.id,
          errorCode: failure.errorCode,
          causeCode: String(error?.code || 'UNKNOWN').slice(0, 64)
        });
        return false;
      }
      await wait(FAILURE_RECORD_PAUSES_MS[attempt]);
    }
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
    runId: run.id,
    origin: run.origin
  });

  let heartbeatTimer;
  let heartbeatWork;
  let finished = false;
  function heartbeat() {
    heartbeatTimer = setTimeout(
      () => {
        heartbeatWork = githubSyncRunRepository
          .updateProgress(run.id, {})
          .catch((error) => {
            logger.warn('Heartbeat GitHub indisponível.', {
              event: 'github_sync_heartbeat_failed',
              runId,
              errorCode: error.code || 'DATABASE_UNAVAILABLE'
            });
          })
          .finally(() => {
            if (!finished) heartbeat();
          });
      },
      Math.min(30000, Math.floor(env.githubSyncLeaseMs / 3))
    );
    heartbeatTimer.unref?.();
  }
  heartbeat();
  try {
    const result = await withProjectWriteGuard(
      run.projectId,
      (tx) => githubSyncRunRepository.assertLease(tx, run.id, run.projectId),
      () =>
        syncProjectGithubData(run.projectId, {
          persistedRunId: run.id,
          onProgress: async (progress) => {
            if ((await githubSyncRunRepository.updateProgress(run.id, progress)) === false) {
              throw new ProjectServiceError(
                'A execução não está mais ativa.',
                409,
                'GITHUB_SYNC_LEASE_LOST'
              );
            }
          }
        }),
      { nowait: true }
    );
    const finishedAt = new Date();
    const completed = await githubSyncRunRepository.succeed(
      run.id,
      result.summary,
      finishedAt,
      finishedAt.getTime() - startedAtMs
    );
    if (!completed) return publicRun(await githubSyncRunRepository.findById(run.id));
    await recordRunAudit(run, 'GITHUB_SYNC_SUCCEEDED');
    await traceabilityAlertService.reconcileAfterSync(run.projectId);
    await githubEventNotificationService.dispatchAfterSync(run.projectId);
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
    const normalized = normalizeGithubError(error);
    const failure = githubSyncFailure(error);
    const errorCode = failure.code.slice(0, 191);
    const durationMs = finishedAt.getTime() - startedAtMs;
    const failed = await recordFailure(run, {
      errorCode,
      errorMessage: failure.message.slice(0, 191),
      finishedAt,
      durationMs,
      retryAt: githubRetryNotBefore(error, finishedAt),
      permanent:
        ['GITHUB_AUTH_FAILED', 'RESOURCE_NOT_FOUND'].includes(normalized.code) &&
        [401, 403, 404].includes(normalized.externalStatus)
    });
    if (failed === null) return publicRun(await githubSyncRunRepository.findById(run.id));
    if (errorCode === 'GITHUB_RATE_LIMITED')
      logger.warn('Sincronização adiada pelo limite do GitHub.', {
        event: 'github_sync_delayed_rate_limit',
        projectId: run.projectId,
        runId: run.id,
        retryAt: githubRetryNotBefore(error, finishedAt)
      });
    await recordRunAudit(run, 'GITHUB_SYNC_FAILED', 'FAILURE', errorCode);
    await traceabilityAlertService.reconcileAfterSync(run.projectId);
    await githubEventNotificationService.dispatchAfterSync(run.projectId);
    const current = failed || run;
    logger.warn('Execução persistida de sincronização GitHub falhou.', {
      event: 'github_sync_run_failed',
      projectId: run.projectId,
      runId: run.id,
      step: current.step,
      branch: current.currentBranch,
      durationMs,
      errorCode,
      ...(failure.causeCode ? { causeCode: failure.causeCode } : {})
    });
    return publicRun(current);
  } finally {
    finished = true;
    clearTimeout(heartbeatTimer);
    await heartbeatWork;
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

function isStale(run, cutoff) {
  const livenessAt = run.heartbeatAt || run.updatedAt;
  return livenessAt instanceof Date && livenessAt < cutoff;
}

async function findActiveRun(projectId, now = new Date()) {
  const active = await githubSyncRunRepository.findActive(projectId);
  if (!active) return null;

  const cutoff = new Date(now.getTime() - GITHUB_SYNC_STALE_AFTER_MS);
  if (!isStale(active, cutoff)) return active;

  const expired = await githubSyncRunRepository.expireIfStillStale(
    active.id,
    projectId,
    cutoff,
    now
  );
  if (expired.count > 0) {
    return null;
  }

  return githubSyncRunRepository.findActive(projectId);
}

export async function requestProjectGithubSync(
  projectId,
  requestedByUserId,
  { schedule = scheduleInProcess, now = new Date() } = {}
) {
  const parsedProjectId = parseProjectId(projectId);
  await assertProjectCanSync(parsedProjectId);
  const active = await findActiveRun(parsedProjectId, now);
  if (active) return publicRun(active, { alreadyRunning: true });

  let run;
  // Coalesce short manual/automatic races without waiting inside a transaction.
  // A long writer gets a controlled 503 after at most three fresh attempts.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      run = await githubSyncRunRepository.create(parsedProjectId, requestedByUserId);
      break;
    } catch (error) {
      const busy = error.code === 'GITHUB_SYNC_BUSY';
      if (!busy && !githubSyncRunRepository.isActiveConflict(error)) throw error;
      const raced = await githubSyncRunRepository.findActive(parsedProjectId);
      if (raced) return publicRun(raced, { alreadyRunning: true });
      if (!busy || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  schedule(run.id);
  return publicRun(run);
}

export async function getProjectGithubSyncStatus(projectId, { now = new Date() } = {}) {
  const parsedProjectId = parseProjectId(projectId);
  const active = await findActiveRun(parsedProjectId, now);
  return publicRun(active || (await githubSyncRunRepository.findLatest(parsedProjectId)));
}
