import { env } from '../../../config/env.js';
import { logger } from '../../../shared/logger/index.js';
import { githubAppCredentialProvider } from '../github-credential.provider.js';
import { githubSyncRunRepository } from '../github-sync-run.repository.js';
import { syncSchedulePolicy } from '../github-sync-schedule.js';
import { executeGithubSyncRun } from './github-sync-run.service.js';
import { randomUUID } from 'node:crypto';
import { githubSchedulerRepository } from '../github-scheduler.repository.js';

export function createGithubSyncScheduler({
  enabled = env.githubSchedulerEnabled,
  log = logger,
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
  const workerId = randomUUID();
  const decisions = new Map();
  let stopping;
  let registered = false;
  let unavailable = false;
  let recoveryInitialized = false;
  let recoveryBefore = null;
  let candidateCursor = null;
  const reportFailure = (error) =>
    log.error('Worker GitHub não concluiu a operação.', {
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
    await githubSchedulerRepository.checkSchema();
    const time = now();
    const cutoff = new Date(time.getTime() - policy.leaseMs);
    for (const run of await repository.listRecoverable(cutoff)) {
      if (stopped) return;
      if (run.status === 'RUNNING' || (run.heartbeatAt || run.updatedAt) < cutoff) {
        const expired = await repository.expireIfStillStale(run.id, run.projectId, cutoff, time);
        if (expired.count)
          log.warn('Execução GitHub interrompida recuperada.', {
            event: 'github_sync_recovered',
            runId: run.id,
            projectId: run.projectId
          });
      } else if (configured()) launch(run);
    }
    if (stopped) return;
    if (!configured()) {
      if (!unavailable)
        log.warn('Scheduler aguarda configuração da GitHub App.', {
          event: 'github_scheduler_unavailable',
          reason: 'GITHUB_APP_NOT_CONFIGURED'
        });
      unavailable = true;
      if (registered) await githubSchedulerRepository.remove(workerId);
      registered = false;
      return;
    }
    unavailable = false;
    if (!recoveryInitialized) {
      const latest = await githubSchedulerRepository.latest();
      // A joining replica must not redistribute another live worker's capacity
      // waiters. On cold startup the fixed cutoff never ages with subsequent ticks.
      if (!latest || time - latest.heartbeatAt > Math.max(60000, policy.tickMs * 3))
        recoveryBefore = new Date(time.getTime() - policy.tickMs * 2);
      recoveryInitialized = true;
    }
    const pageSize = 100;
    // Bound work/memory per tick; continue from the last value cursor next tick
    // if a large blocked prefix exhausts this budget.
    candidatePages: for (let page = 0; page < 10; page++) {
      const candidates = await repository.listAutomaticCandidates(time, pageSize, candidateCursor);
      for (const candidate of candidates) {
        if (stopped) return;
        candidateCursor = candidate;
        const result = await repository.reserveAutomatic(
          candidate.projectId,
          now(),
          policy,
          recoveryBefore
        );
        const decision = `${result.outcome}:${result.reason || ''}:${result.nextSyncAt?.toISOString() || ''}`;
        if (decisions.get(candidate.projectId) !== decision) {
          decisions.set(candidate.projectId, decision);
          log.info('Projeto avaliado pelo scheduler GitHub.', {
            event: 'github_sync_eligible',
            projectId: candidate.projectId,
            outcome: result.outcome
          });
          if (result.outcome !== 'RESERVED')
            log.info('Sincronização automática aguardando execução.', {
              event:
                result.outcome === 'ALREADY_RUNNING'
                  ? 'github_sync_skipped_running'
                  : 'github_sync_postponed',
              projectId: candidate.projectId,
              reason: result.reason || result.outcome,
              previousNextSyncAt: result.previousNextSyncAt,
              nextSyncAt: result.nextSyncAt
            });
        }
        if (result.outcome === 'RESERVED') {
          decisions.delete(candidate.projectId);
          log.info('Sincronização automática reservada.', {
            event: 'github_sync_claimed',
            projectId: candidate.projectId,
            runId: result.run.id
          });
          launch(result.run);
        }
        if (result.reason === 'GLOBAL_CAPACITY') {
          candidateCursor = null;
          break candidatePages;
        }
      }
      if (candidates.length < pageSize) {
        candidateCursor = null;
        break;
      }
    }
    if (!stopped) {
      await githubSchedulerRepository.heartbeat(workerId, now());
      registered = true;
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
      if (started || stopped) return false;
      if (!enabled) {
        log.warn(
          'Scheduler GitHub desabilitado; habilite GITHUB_SCHEDULER_ENABLED para executar a agenda.',
          {
            event: 'github_scheduler_disabled'
          }
        );
        return false;
      }
      started = true;
      log.info('Worker periódico GitHub iniciado.', {
        event: 'github_scheduler_started',
        intervalMs: policy.intervalMs,
        concurrency: policy.concurrency,
        configured: configured()
      });
      void loop();
      return true;
    },
    stop() {
      stopping ||= (async () => {
        stopped = true;
        clearTimeout(timer);
        await ticking?.catch(reportFailure);
        if (registered) await githubSchedulerRepository.remove(workerId).catch(reportFailure);
        await Promise.allSettled([...running.values()]);
        log.info('Worker periódico GitHub encerrado.', { event: 'github_scheduler_stopped' });
      })();
      return stopping;
    },
    async drain() {
      await Promise.allSettled([...running.values()]);
    }
  };
}
