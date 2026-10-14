import { env } from '../../../config/env.js';
import { githubSchedulerRepository } from '../github-scheduler.repository.js';

export async function getGithubAutomationStatus(projectId, now = new Date()) {
  const schedule = await githubSchedulerRepository.schedule(Number(projectId));
  const result = { checkedAt: now, nextSyncAt: schedule?.nextSyncAt ?? null };
  try {
    const latest = await githubSchedulerRepository.latest();
    const available =
      latest && now - latest.heartbeatAt <= Math.max(60000, env.githubSchedulerTickMs * 3);
    return {
      ...result,
      status: available ? 'AVAILABLE' : 'UNAVAILABLE',
      reason: available ? null : 'WORKER_NOT_OBSERVED',
      lastHeartbeatAt: latest?.heartbeatAt ?? null
    };
  } catch (error) {
    // A rolling schema upgrade must not break manual sync/status or project access.
    if (error.code !== 'P2021') throw error;
    return { ...result, status: 'UNAVAILABLE', reason: 'SCHEMA_NOT_READY', lastHeartbeatAt: null };
  }
}
