import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  distributedSyncAt,
  nextSyncAfterRun
} from '../../src/modules/github/github-sync-schedule.js';
import { githubRetryNotBefore } from '../../src/modules/github/github-error.js';
import { executeGithubRequest } from '../../src/modules/github/github-request.js';

const policy = {
  intervalMs: 1800000,
  tickMs: 15000,
  concurrency: 2,
  leaseMs: 1800000,
  backoffMaxMs: 21600000
};
const now = new Date('2026-10-11T12:00:00Z');
afterEach(() => vi.useRealTimers());

describe('persisted scheduling policy', () => {
  it('spreads a deterministic sample through the configured window and survives restarts', () => {
    const schedule = Array.from({ length: 100 }, (_, id) =>
      distributedSyncAt(id + 1, now, policy).getTime()
    );
    expect(new Set(schedule).size).toBeGreaterThan(90);
    expect(Math.max(...schedule) - Math.min(...schedule)).toBeGreaterThan(policy.intervalMs / 2);
    for (const date of schedule) {
      expect(date).toBeGreaterThan(now.getTime() + policy.tickMs);
      expect(date).toBeLessThanOrEqual(now.getTime() + policy.tickMs + policy.intervalMs);
    }
    expect(distributedSyncAt(1, now, policy).getTime()).toBe(schedule[0]);
  });
  it('keeps the base interval, adds stable bounded jitter and caps exponential failures', () => {
    const start = nextSyncAfterRun(7, now, 0, null, policy);
    expect(start - now).toBeGreaterThanOrEqual(policy.intervalMs);
    expect(start - now).toBeLessThan(policy.intervalMs * 1.2);
    expect(nextSyncAfterRun(7, now, 1, null, policy) - start).toBe(policy.intervalMs);
    expect(nextSyncAfterRun(7, now, 10, null, policy)).toEqual(
      nextSyncAfterRun(7, now, 100, null, policy)
    );
    expect(nextSyncAfterRun(7, now, 100, null, policy) - now).toBeLessThan(
      policy.backoffMaxMs + policy.intervalMs / 5
    );
    const custom = { ...policy, intervalMs: 60000 };
    expect(nextSyncAfterRun(7, now, 0, null, custom) - now).toBeLessThan(72000);
  });
  it.each([429, 503])(
    'honors Retry-After/reset beyond the bounded wait after %s and preserves cooldown',
    async (status) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const error = {
        status,
        response: {
          headers: {
            'retry-after': '7200',
            'x-ratelimit-reset': String(now.getTime() / 1000 + 3600)
          }
        }
      };
      const wait = vi.fn();
      const operation = vi.fn().mockRejectedValue(error);
      await expect(
        executeGithubRequest(operation, { maxRetries: 2, maxDelayMs: 60000, wait })
      ).rejects.toMatchObject({
        code: status === 429 ? 'GITHUB_RATE_LIMITED' : 'EXTERNAL_SERVICE_ERROR',
        retryAt: new Date(now.getTime() + 7200000)
      });
      expect(wait).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledOnce();
      expect(githubRetryNotBefore({ status: 429 }, now) - now).toBe(60000);
      expect(
        githubRetryNotBefore(
          {
            status: 429,
            response: { headers: { 'retry-after': new Date(now.getTime() + 120000).toUTCString() } }
          },
          now
        ) - now
      ).toBe(120000);
      expect(githubRetryNotBefore({ status: 503 }, now)).toBeNull();
    }
  );
});
