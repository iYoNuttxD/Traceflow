import { randomUUID } from 'node:crypto';
import { logger } from '../shared/logger/index.js';
import { scheduledJobLeaseRepository } from './scheduled-job-lease.repository.js';

export const JOB_LEASE_MS = 120_000;
export const JOB_RENEW_MS = 30_000;

const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;

export function jobErrorCodeOf(error, fallback = 'SCHEDULED_JOB_FAILED') {
  const code = String(error?.code ?? '');
  return SAFE_CODE.test(code) ? code : fallback;
}

export function createJobLease({
  leases = scheduledJobLeaseRepository,
  log = logger,
  clock = () => new Date(),
  leaseMs = JOB_LEASE_MS,
  renewMs = JOB_RENEW_MS
} = {}) {
  const until = (instant) => new Date(instant.getTime() + leaseMs);

  return async function withJobLease(
    name,
    work,
    { ownerId = `cli:${randomUUID()}`, controller = new AbortController() } = {}
  ) {
    const now = clock();
    if (!(await leases.acquire({ name, ownerId, now, leaseUntil: until(now) })))
      return { acquired: false };

    const lost = (event, message, error) => {
      if (controller.signal.aborted) return;
      log.error(message, {
        event,
        job: name,
        ...(error ? { errorCode: jobErrorCodeOf(error, 'LEASE_RENEW_FAILED') } : {})
      });
      controller.abort();
    };
    const renewal = setInterval(() => {
      leases.renew({ name, ownerId, leaseUntil: until(clock()) }).then(
        (kept) => {
          if (!kept)
            lost(
              'scheduled_job_lease_lost',
              'A lease do job passou para outro dono; a execução para.'
            );
        },
        (error) =>
          lost(
            'scheduled_job_lease_renew_failed',
            'Não foi possível renovar a lease do job; a execução para.',
            error
          )
      );
    }, renewMs);

    try {
      return { acquired: true, result: await work(controller.signal) };
    } finally {
      clearInterval(renewal);
      await leases.release({ name, ownerId, now: clock() }).catch((error) =>
        log.warn('Não foi possível liberar a lease do job; ela vence sozinha.', {
          event: 'scheduled_job_lease_release_failed',
          job: name,
          errorCode: jobErrorCodeOf(error, 'LEASE_RELEASE_FAILED')
        })
      );
    }
  };
}

export const withJobLease = createJobLease();
