import { beforeEach, describe, expect, it, vi } from 'vitest';
import { traceabilityAnalyticsService } from '../../src/modules/indicators/traceability-analytics.service.js';
import { projectRequirementSummary } from '../../src/modules/traceability/requirement-traceability.policy.js';
import {
  assessSignal,
  buildProjectHealth
} from '../../src/modules/indicators/health/health.policy.js';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/traceability/requirement-projection.repository.js', () => ({
  requirementProjectionRepository: { readIndicatorSummary: read }
}));
const at = new Date('2026-10-13T12:00:00Z');
const integration = { status: 'ACTIVE', lastSyncAt: at, lastSyncStatus: 'SINCRONIZADO' };
const row = (id, lifecycleBasis, counts = {}) =>
  projectRequirementSummary(
    { id, title: 'Requirement', lifecycleBasis },
    {
      tasksTotal: 1,
      tasksDone: 1,
      testCasesTotal: 1,
      passed: 1,
      ...counts
    }
  );
async function indicators(rows, githubIntegration = null) {
  read.mockResolvedValue({ project: { githubIntegration }, branch: null, rows });
  const result = await traceabilityAnalyticsService.read(1, () => at);
  return new Map(result.indicators.map((metric) => [metric.metricId, metric]));
}
beforeEach(() => vi.clearAllMocks());

describe('local and mixed-basis indicator contracts', () => {
  it('reports local validation without technical metrics, source timestamps or fabricated evidence', async () => {
    const map = await indicators([row(1, 'LOCAL')]);
    expect(map.get('I65')).toMatchObject({
      value: 100,
      state: 'AVAILABLE',
      numerator: 1,
      denominator: 1,
      sourceScope: 'LOCAL',
      sourceUpdatedAt: null,
      sourceSyncStatus: null,
      limitations: []
    });
    for (const id of ['I62', 'I66'])
      expect(map.get(id)).toMatchObject({ value: null, numerator: null, state: 'UNAVAILABLE' });
    expect(map.get('I67')).toMatchObject({ value: 100, state: 'AVAILABLE' });
  });
  it('preserves local validation after linking, without adding a technical Health penalty', async () => {
    for (const status of ['SINCRONIZADO', 'FALHA']) {
      const map = await indicators([row(1, 'LOCAL')], { ...integration, lastSyncStatus: status });
      map.set('I01', { value: 100, state: 'AVAILABLE' });
      expect(map.get('I65')).toMatchObject({
        value: 100,
        state: 'AVAILABLE',
        sourceScope: 'LOCAL',
        sourceUpdatedAt: null
      });
      for (const id of ['I62', 'I63', 'I65', 'I66'])
        expect(assessSignal(id, map, new Map(), { githubApplicable: true })).toMatchObject({
          score: null,
          status: 'UNASSESSED',
          reasonCode: 'GITHUB_LIFECYCLE_NOT_APPLICABLE'
        });
      const health = buildProjectHealth(map, new Map(), {
        githubApplicable: true,
        sprintApplicable: false
      });
      expect(health.dimensions.find((dimension) => dimension.id === 'TRACEABILITY')).toMatchObject({
        score: 100,
        coverage: 100,
        assessedSignals: ['I61'],
        unassessedSignals: []
      });
      expect(
        health.drivers.negative.filter((driver) => driver.dimension === 'TRACEABILITY')
      ).toEqual([]);
    }
  });
  it('keeps public technical denominators global while Health uses a matched GitHub cohort', async () => {
    const map = await indicators(
      [row(1, 'LOCAL'), row(2, 'GITHUB'), row(3, 'GITHUB', { technicalEvidence: 1 })],
      integration
    );
    map.set('I01', { value: 100, state: 'AVAILABLE' });
    expect(map.get('I65')).toMatchObject({
      value: 66.67,
      numerator: 2,
      denominator: 3,
      sourceScope: 'MIXED'
    });
    for (const id of ['I62', 'I66']) {
      expect(map.get(id)).toMatchObject({ value: 33.33, numerator: 1, denominator: 3 });
      expect(assessSignal(id, map, new Map(), { githubApplicable: true })).toMatchObject({
        score: 50,
        basis: {
          scope: 'GITHUB_REQUIREMENTS',
          current: 50,
          expected: 100,
          numerator: 1,
          denominator: 2,
          expectedNumerator: 2,
          expectedDenominator: 2
        }
      });
    }
    expect(assessSignal('I65', map, new Map(), { githubApplicable: true })).toMatchObject({
      score: 100,
      basis: { scope: 'GITHUB_REQUIREMENTS', current: 50, expected: 50, denominator: 2 }
    });
  });
  it('does not score local coverage against stale technical cohort data', async () => {
    const map = await indicators([row(1, 'LOCAL'), row(2, 'GITHUB', { technicalEvidence: 1 })], {
      ...integration,
      lastSyncStatus: 'FALHA'
    });
    map.set('I01', { value: 100, state: 'AVAILABLE' });
    expect(map.get('I65')).toMatchObject({ state: 'STALE', sourceScope: 'MIXED' });
    expect(map.get('I63').state).toBe('AVAILABLE');
    expect(assessSignal('I63', map, new Map(), { githubApplicable: true }).score).toBeNull();
  });
  it('preserves the original integrated formula and does not invent empty-universe progress', async () => {
    const map = await indicators([row(1, 'GITHUB', { technicalEvidence: 1 })], integration);
    map.set('I01', { value: 100, state: 'AVAILABLE' });
    expect(map.get('I66')).toMatchObject({ value: 100, state: 'AVAILABLE' });
    expect(map.get('I66')).not.toHaveProperty('components');
    expect(assessSignal('I66', map, new Map(), { githubApplicable: true })).toMatchObject({
      score: 100,
      basis: { current: 100, expected: 100, expectedMetricId: 'I01' }
    });
    const empty = await indicators([]);
    expect(empty.get('I65')).toMatchObject({ value: null, state: 'NO_DATA', denominator: 0 });
    expect(empty.get('I67')).toMatchObject({ value: null, state: 'NO_DATA' });
  });
});
