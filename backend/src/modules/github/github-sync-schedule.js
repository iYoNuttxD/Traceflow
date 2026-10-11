import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';

export const syncSchedulePolicy = () => ({
  intervalMs: env.githubSyncIntervalMs,
  tickMs: env.githubSchedulerTickMs,
  concurrency: env.githubAutomaticConcurrency,
  leaseMs: env.githubSyncLeaseMs,
  backoffMaxMs: env.githubSyncBackoffMaxMs
});

function offset(projectId, windowMs) {
  return (
    createHash('sha256').update(`github-sync:${projectId}`).digest().readUInt32BE(0) % windowMs
  );
}

// First enable/recovery spreads projects over an epoch-aligned window. A restart
// never turns all overdue schedules into jobs at the same instant.
export function distributedSyncAt(projectId, now, policy = syncSchedulePolicy()) {
  const phase = offset(projectId, policy.intervalMs);
  const earliest = now.getTime() + policy.tickMs;
  const window = Math.floor((earliest - phase) / policy.intervalMs) + 1;
  return new Date(window * policy.intervalMs + phase);
}

export function nextSyncAfterRun(
  projectId,
  now,
  failures = 0,
  retryAt,
  policy = syncSchedulePolicy()
) {
  const delay = Math.min(
    policy.intervalMs * 2 ** Math.min(failures, 10),
    Math.max(policy.intervalMs, policy.backoffMaxMs)
  );
  const jitter = offset(projectId, Math.max(1, Math.floor(policy.intervalMs / 5)));
  return new Date(Math.max(now.getTime() + delay, retryAt?.getTime() || 0) + jitter);
}

export function eligibleIntegration(integration) {
  return Boolean(
    integration?.autoSyncEnabled &&
    integration.status === 'ACTIVE' &&
    integration.installation?.status === 'ACTIVE' &&
    integration.repositoryFullName &&
    integration.repositoryName &&
    !integration.project?.deletedAt &&
    !integration.project?.purgeStartedAt
  );
}
