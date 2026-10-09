import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readHealth } from '../../src/modules/indicators/health/health.service.js';

const repository = vi.hoisted(() => ({
  planning: vi.fn(),
  flow: vi.fn(),
  quality: vi.fn(),
  github: vi.fn()
}));
vi.mock('../../src/modules/indicators/health/health.repository.js', () => ({
  healthRepository: repository
}));
vi.mock('../../src/modules/indicators/indicators.service.js', () => ({
  indicatorsService: { progress: vi.fn() }
}));
vi.mock('../../src/modules/indicators/traceability-analytics.service.js', () => ({
  traceabilityAnalyticsService: { read: vi.fn() }
}));

const generatedAt = '2026-09-30T12:00:00.000Z';
const options = { sprintApplicable: false, sprintActive: false, githubApplicable: false };
const row = (metricId, value) => ({ metricId, value, state: 'AVAILABLE' });

beforeEach(() => {
  vi.clearAllMocks();
  repository.planning.mockResolvedValue({
    total: 1,
    overdue: 0,
    unassigned: 0,
    withoutEstimate: 0
  });
  repository.quality.mockResolvedValue({
    executionResults: [],
    caseHealth: [{ result: 'PASS', total: 1 }],
    retests: []
  });
});

describe('Health sources with no elapsed evaluation window', () => {
  it.each(['2026-10-01T00:00:00Z', generatedAt])(
    'reads canonical current quality and isolates event sources when the period starts at %s',
    async (start) => {
      const period = {
        startInclusive: new Date(start),
        endExclusive: new Date('2026-10-02T00:00:00Z'),
        timeZone: 'UTC'
      };
      const general = await readHealth(
        42,
        'GENERAL',
        period,
        generatedAt,
        [row('I01', 0)],
        [],
        options
      );
      const widgetSources = [
        row('I01', 0),
        row('I52', { PASS: 0, total: 1 }),
        row('I10', 0),
        { ...row('I73', null), state: 'UNAVAILABLE' },
        ...['I04', 'I15', 'I20', 'I21', 'I49', 'I58'].map((metricId) => row(metricId, 100))
      ];
      const selected = await readHealth(
        42,
        'GENERAL',
        period,
        generatedAt,
        widgetSources,
        widgetSources,
        options
      );
      expect(selected.projectHealth).toEqual(general.projectHealth);
      expect(general.projectHealth.assessments.I52).toMatchObject({
        score: 100,
        basis: { pass: 1, total: 1 }
      });
      for (const metricId of ['I04', 'I15', 'I20', 'I21', 'I49', 'I58'])
        expect(selected.assessments[metricId]).toMatchObject({
          score: null,
          status: 'UNASSESSED'
        });
      expect(repository.quality).toHaveBeenCalledTimes(2);
      expect(repository.quality).toHaveBeenCalledWith(42, null);
      expect(repository.flow).not.toHaveBeenCalled();
      expect(general.projectHealth.window).toBeNull();
    }
  );
});
