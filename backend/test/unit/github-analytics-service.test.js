import { describe, expect, it, vi } from 'vitest';
import { githubAnalyticsRepository } from '../../src/modules/indicators/github-analytics.repository.js';
import { githubAnalyticsService } from '../../src/modules/indicators/github-analytics.service.js';

vi.mock('../../src/modules/indicators/github-analytics.repository.js', () => ({
  githubAnalyticsRepository: { read: vi.fn() }
}));

const period = {
  startDate: '2026-09-01',
  endDate: '2026-09-29',
  timeZone: 'UTC',
  startInclusive: new Date('2026-09-01T00:00:00Z'),
  endExclusive: new Date('2026-09-30T00:00:00Z')
};
function facts(lastSyncAt) {
  return {
    project: {
      githubIntegration: { status: 'RECONNECT_REQUIRED', lastSyncAt, lastSyncStatus: 'FALHA' }
    },
    asOf: period.endExclusive,
    cohort: { closedCount: 0, reopenedCount: 0, mergedCount: 0 },
    commits: 0,
    openPrs: 0,
    openIssues: 0,
    mergedPrs: [{ createdAtGithub: null, mergedAtGithub: period.startInclusive }],
    closedIssues: [],
    oldestPrs: [],
    age: { total: 1, eligible: 0, totalDays: 0 }
  };
}

describe('GitHub analytics limitations', () => {
  it.each([null, period.startInclusive])(
    'combines source and metric limitations (sync %s)',
    async (lastSyncAt) => {
      githubAnalyticsRepository.read.mockResolvedValue(facts(lastSyncAt));
      const response = await githubAnalyticsService.read(42, {}, period);
      const sourceReasons = lastSyncAt
        ? ['GITHUB_INTEGRATION_NOT_ACTIVE', 'GITHUB_SYNC_FAILED']
        : ['GITHUB_SNAPSHOT_NOT_AVAILABLE'];
      for (const id of ['I14', 'I15', 'I16', 'I17', 'I18', 'I73', 'I74']) {
        const metric = response.indicators.find((row) => row.metricId === id);
        expect(metric.limitations).toEqual(expect.arrayContaining(sourceReasons));
        if (!lastSyncAt) expect(metric.state).toBe('UNAVAILABLE');
      }
      expect(response.indicators.find((row) => row.metricId === 'I15').limitations).toContain(
        'INVALID_OR_MISSING_TIMESTAMPS_EXCLUDED'
      );
      expect(response.indicators.find((row) => row.metricId === 'I18').limitations).toContain(
        'ISSUE_LIFECYCLE_NOT_COLLECTED'
      );
    }
  );
});
