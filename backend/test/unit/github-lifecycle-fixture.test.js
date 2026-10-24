import { afterEach, describe, expect, it, vi } from 'vitest';
import { coverGithubEvents, LINKED_SINCE } from '../helpers/github-lifecycle.js';

afterEach(() => vi.useRealTimers());

describe('historical GitHub event coverage fixture', () => {
  it.each(['2026-10-20T22:00:00Z', '2027-10-20T22:00:00Z', '2040-01-01T00:00:00Z'])(
    'keeps the fixed events covered when the wall clock is %s',
    async (wallClock) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(wallClock));
      const upsert = vi.fn().mockResolvedValue({});
      await coverGithubEvents({ gitHubEventCoverage: { upsert } }, 17);
      expect(upsert).toHaveBeenCalledWith({
        where: { projectId: 17 },
        create: { projectId: 17, coverageFrom: LINKED_SINCE },
        update: { coverageFrom: LINKED_SINCE }
      });
      expect(LINKED_SINCE.getTime()).toBeLessThan(new Date('2026-10-20T10:00:00Z').getTime());
      expect(new Date().getTime()).toBeGreaterThan(new Date('2026-10-20T10:00:00Z').getTime());
    }
  );
});
