import { beforeEach, describe, expect, it, vi } from 'vitest';

const liveness = vi.hoisted(() => ({
  checkSchema: vi.fn(),
  latest: vi.fn(),
  heartbeat: vi.fn(),
  remove: vi.fn()
}));
vi.mock('../../src/modules/github/github-scheduler.repository.js', () => ({
  githubSchedulerRepository: liveness
}));
vi.mock('../../src/modules/github/github-sync-run.repository.js', () => ({
  githubSyncRunRepository: {}
}));
vi.mock('../../src/modules/github/github-credential.provider.js', () => ({
  githubAppCredentialProvider: {}
}));
vi.mock('../../src/modules/github/services/github-sync-run.service.js', () => ({
  executeGithubSyncRun: vi.fn()
}));

import { createGithubSyncScheduler } from '../../src/modules/github/services/github-sync-scheduler.service.js';

const time = new Date('2026-10-11T12:00:00Z');
const policy = { intervalMs: 1800000, tickMs: 15000, concurrency: 2, leaseMs: 1800000 };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  liveness.latest.mockResolvedValue(null);
  liveness.remove.mockResolvedValue({ count: 1 });
});

describe('bounded scheduler scanning', () => {
  it('continues after the per-tick budget instead of restarting the same 1000 blocked candidates', async () => {
    const candidates = Array.from({ length: 1001 }, (_, index) => ({
      projectId: index + 1,
      nextSyncAt: time
    }));
    const repository = {
      listRecoverable: vi.fn().mockResolvedValue([]),
      listAutomaticCandidates: vi.fn(async (_now, limit, after) =>
        candidates.slice(after?.projectId || 0, (after?.projectId || 0) + limit)
      ),
      reserveAutomatic: vi.fn(async (projectId) =>
        projectId <= 1000
          ? { outcome: 'CAPACITY', reason: 'INSTALLATION_BUSY' }
          : { outcome: 'RESERVED', run: { id: 1001, projectId } }
      )
    };
    const execute = vi.fn().mockResolvedValue(null);
    const worker = createGithubSyncScheduler({
      enabled: true,
      configured: () => true,
      now: () => time,
      policy,
      log,
      repository,
      execute
    });
    try {
      await worker.tick();
      expect(repository.listAutomaticCandidates).toHaveBeenCalledTimes(10);
      expect(repository.reserveAutomatic).toHaveBeenCalledTimes(1000);
      expect(execute).not.toHaveBeenCalled();
      await worker.tick();
      expect(repository.reserveAutomatic).toHaveBeenCalledTimes(1001);
      expect(execute).toHaveBeenCalledExactlyOnceWith(1001);
      expect(
        repository.listAutomaticCandidates.mock.calls.map(([, , after]) => after?.projectId || 0)
      ).toEqual(Array.from({ length: 11 }, (_, index) => index * 100));
    } finally {
      await worker.stop();
    }
  });
});
