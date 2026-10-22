import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { noteDatabaseFailure } from '../database/engine-health.js';
import { logger } from '../shared/logger/index.js';
import { createJobLease, jobErrorCodeOf } from './job-lease.js';
import { SCHEDULED_JOBS } from './scheduled-jobs.js';

export const FIRST_RUN_DELAY_MS = 10_000;

const countsOf = (report) =>
  Object.fromEntries(Object.entries(report ?? {}).filter(([, value]) => Number.isFinite(value)));

export function createJobRunner({
  jobs = SCHEDULED_JOBS,
  enabled = env.jobsEnabled,
  lease = createJobLease(),
  log = logger,
  ownerId = `worker:${randomUUID()}`,
  firstRunDelayMs = FIRST_RUN_DELAY_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  const timers = new Map();
  const running = new Map();
  let started = false;
  let stopped = false;

  async function execute(job, controller) {
    const startedAt = Date.now();
    const limit = job.maxRunMs ? setTimer(() => controller.abort(), job.maxRunMs) : null;
    try {
      const outcome = await lease(job.name, (signal) => job.run({ signal }), {
        ownerId,
        controller
      });
      if (!outcome.acquired) {
        log.info('O job não rodou: outra execução tem a lease.', {
          event: 'scheduled_job_skipped',
          job: job.name,
          reason: 'LEASE_HELD'
        });
        return outcome;
      }
      log[outcome.result?.failed ? 'warn' : 'info']('Job agendado concluído.', {
        event: 'scheduled_job_completed',
        job: job.name,
        ...countsOf(outcome.result),
        interrupted: controller.signal.aborted,
        durationMs: Date.now() - startedAt
      });
      return outcome;
    } catch (error) {
      noteDatabaseFailure(error);
      log.error('O job agendado falhou; a próxima execução retoma.', {
        event: 'scheduled_job_failed',
        job: job.name,
        errorCode: jobErrorCodeOf(error),
        durationMs: Date.now() - startedAt
      });
      return { acquired: true, failed: true };
    } finally {
      if (limit) clearTimer(limit);
    }
  }

  function schedule(job, delayMs) {
    if (stopped) return;
    timers.set(
      job.name,
      setTimer(() => {
        timers.delete(job.name);
        void launch(job);
      }, delayMs)
    );
  }

  function launch(job) {
    if (stopped) return Promise.resolve(null);
    if (running.has(job.name)) return running.get(job.name).promise;
    const controller = new AbortController();
    const promise = execute(job, controller).finally(() => {
      running.delete(job.name);
      schedule(job, job.intervalMs);
    });
    running.set(job.name, { controller, promise });
    return promise;
  }

  return {
    start() {
      if (started || stopped) return false;
      if (!enabled) {
        log.warn('Jobs agendados desligados; habilite JOBS_ENABLED para rodar a agenda.', {
          event: 'scheduled_jobs_disabled'
        });
        return false;
      }
      started = true;
      log.info('Jobs agendados iniciados.', {
        event: 'scheduled_jobs_started',
        jobs: jobs.map((job) => job.name).join(',')
      });
      for (const job of jobs) schedule(job, firstRunDelayMs);
      return true;
    },

    runNow(name) {
      const job = jobs.find((candidate) => candidate.name === name);
      if (!job) throw new Error(`Job desconhecido: ${name}`);
      clearTimer(timers.get(name));
      timers.delete(name);
      return launch(job);
    },

    async stop() {
      stopped = true;
      for (const timer of timers.values()) clearTimer(timer);
      timers.clear();
      const pending = [...running.values()];
      for (const { controller } of pending) controller.abort();
      await Promise.allSettled(pending.map(({ promise }) => promise));
      if (started)
        log.info('Jobs agendados encerrados.', {
          event: 'scheduled_jobs_stopped',
          interrupted: pending.length
        });
    }
  };
}
