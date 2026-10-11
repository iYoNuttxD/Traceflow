import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logger/index.js';
import { githubAppCredentialProvider } from '../github-credential.provider.js';
import { githubSyncRunRepository } from '../github-sync-run.repository.js';
import { syncSchedulePolicy } from '../github-sync-schedule.js';
import { executeGithubSyncRun } from './github-sync-run.service.js';

export function createGithubSyncScheduler({
  enabled = env.githubSchedulerEnabled,
  configured = () => githubAppCredentialProvider.isConfigured(),
  repository = githubSyncRunRepository,
  execute = executeGithubSyncRun,
  policy = syncSchedulePolicy(),
  now = () => new Date()
} = {}) {
  let stopped = false;
  let started = false;
  let timer;
  let ticking;
  const running = new Map();
  const reportFailure = (error) =>
    logger.error('Worker GitHub não concluiu a operação.', {
      event: 'github_scheduler_operation_failed',
      errorCode: error.code || 'WORKER_FAILED'
    });

  function launch(run) {
    if (stopped || running.has(run.id)) return;
    const work = execute(run.id)
      .catch(reportFailure)
      .finally(() => running.delete(run.id));
    running.set(run.id, work);
  }

  async function tickWork() {
    const time = now();
    const cutoff = new Date(time.getTime() - policy.leaseMs);
    for (const run of await repository.listRecoverable(cutoff)) {
      if (stopped) return;
      if (run.status === 'RUNNING' || (run.heartbeatAt || run.updatedAt) < cutoff) {
        const expired = await repository.expireIfStillStale(run.id, run.projectId, cutoff, time);
        if (expired.count)
          logger.warn('Execução GitHub interrompida recuperada.', {
            event: 'github_sync_recovered',
            runId: run.id,
            projectId: run.projectId
          });
      } else if (configured()) launch(run);
    }
    if (stopped || !configured()) return;
    for (const candidate of await repository.listAutomaticCandidates(time)) {
      if (stopped) return;
      const result = await repository.reserveAutomatic(candidate.projectId, now(), policy);
      if (result.outcome === 'RESERVED') {
        logger.info('Sincronização automática reservada.', {
          event: 'github_sync_claimed',
          projectId: candidate.projectId,
          runId: result.run.id
        });
        launch(result.run);
      } else if (result.outcome === 'SCHEDULED' || result.outcome === 'ALREADY_RUNNING') {
        logger.info('Agenda GitHub atualizada.', {
          event:
            result.outcome === 'SCHEDULED'
              ? 'github_sync_scheduled'
              : 'github_sync_skipped_running',
          projectId: candidate.projectId,
          nextSyncAt: result.nextSyncAt
        });
      }
    }
  }

  function tick() {
    if (!enabled || stopped) return Promise.resolve();
    if (!ticking)
      ticking = tickWork().finally(() => {
        ticking = null;
      });
    return ticking;
  }

  async function loop() {
    try {
      await tick();
    } catch (error) {
      reportFailure(error);
    }
    if (!stopped) timer = setTimeout(() => void loop(), policy.tickMs);
  }

  return {
    tick,
    start() {
      if (!enabled || started || stopped) return false;
      started = true;
      logger.info('Worker periódico GitHub iniciado.', {
        event: 'github_scheduler_started',
        intervalMs: policy.intervalMs,
        concurrency: policy.concurrency,
        configured: configured()
      });
      void loop();
      return true;
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await ticking?.catch(reportFailure);
      await Promise.allSettled([...running.values()]);
    },
    async drain() {
      await Promise.allSettled([...running.values()]);
    }
  };
}
