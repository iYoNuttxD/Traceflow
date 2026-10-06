import { beforeEach, describe, expect, it, vi } from 'vitest';
import { githubFreshness } from '../../src/modules/indicators/policies/indicator-freshness.policy.js';
import {
  createIndicatorLocalDateKey,
  normalizeIndicatorPeriod
} from '../../src/modules/indicators/policies/indicator-period.policy.js';
import {
  isTaskOverdue,
  taskDeadlineCutoff
} from '../../src/modules/indicators/policies/task-deadline.policy.js';
import { lifecycleCohort } from '../../src/modules/indicators/policies/pr-cohort.policy.js';
import {
  assessSignal,
  buildProjectHealth,
  healthWindow
} from '../../src/modules/indicators/health/health.policy.js';
import { githubHealthIndicators } from '../../src/modules/indicators/health/health.data.js';
import { traceabilityAnalyticsService } from '../../src/modules/indicators/traceability-analytics.service.js';
import { projectRequirementSummary } from '../../src/modules/traceability/requirement-traceability.policy.js';

const readSummary = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/traceability/requirement-projection.repository.js', () => ({
  requirementProjectionRepository: { readIndicatorSummary: readSummary }
}));
const asOf = new Date('2026-10-05T20:00:00Z');
const integration = {
  status: 'ACTIVE',
  lastSyncStatus: 'SINCRONIZADO',
  lastSyncAt: new Date('2026-10-05T19:55:00Z'),
  pullRequestLifecycleCoverageFrom: new Date('2026-08-01T00:00:00Z'),
  pullRequestLifecycleSyncedAt: new Date('2026-10-05T19:55:00Z')
};
beforeEach(() => vi.clearAllMocks());

describe('GitHub applicability and freshness', () => {
  it('does not call an absent integration stale or invent a source clock', () => {
    expect(githubFreshness(null)).toEqual({
      stale: false,
      sourceUpdatedAt: null,
      sourceSyncStatus: null,
      limitations: ['GITHUB_NOT_CONFIGURED']
    });
    expect(githubFreshness({ ...integration, lastSyncAt: new Date('2020-01-01') }).stale).toBe(
      false
    );
    expect(githubFreshness({ ...integration, lastSyncStatus: 'FALHA' }).stale).toBe(true);
  });

  it('keeps local traceability available and marks technical dependencies not configured', async () => {
    readSummary.mockResolvedValue({
      project: { githubIntegration: null },
      branch: null,
      rows: [
        projectRequirementSummary(
          { id: 1, title: 'Local' },
          { tasksTotal: 1, tasksDone: 1, testCasesTotal: 1, passed: 1 }
        )
      ]
    });
    const response = await traceabilityAnalyticsService.read(1, () => asOf);
    const byId = Object.fromEntries(response.indicators.map((row) => [row.metricId, row]));
    for (const id of ['I61', 'I63', 'I64', 'I67']) expect(byId[id].state).toBe('AVAILABLE');
    expect(byId.I63.value).toBe(100);
    for (const id of ['I62', 'I65', 'I66'])
      expect(byId[id]).toMatchObject({
        value: null,
        numerator: null,
        state: 'UNAVAILABLE',
        sourceUpdatedAt: null,
        limitations: ['GITHUB_NOT_CONFIGURED']
      });
  });

  it('excludes inapplicable Health signals and their reference dependency from coverage', () => {
    const rows = [
      ['I26', 10],
      ['I28', 0],
      ['I29', 0],
      ['I30', 0],
      ['I61', 100],
      ['I64', 0],
      ['I49', 100],
      ['I58', 100]
    ].map(([metricId, value]) => ({ metricId, value, state: 'AVAILABLE' }));
    rows.push({ metricId: 'I52', value: { PASS: 1, total: 1 }, state: 'AVAILABLE' });
    const health = buildProjectHealth(new Map(rows.map((row) => [row.metricId, row])), new Map(), {
      githubApplicable: false,
      sprintApplicable: false
    });
    for (const id of ['I04', 'I15', 'I73', 'I62', 'I63', 'I65', 'I66'])
      expect(health.assessments[id]).toMatchObject({
        score: null,
        status: 'UNASSESSED',
        reasonCode: 'GITHUB_NOT_CONFIGURED'
      });
    expect(health.dimensions.find((row) => row.id === 'TRACEABILITY')).toMatchObject({
      score: 100,
      coverage: 100,
      assessedSignals: ['I61'],
      unassessedSignals: []
    });
    expect(health.dimensions.find((row) => row.id === 'QUALITY')).toMatchObject({
      score: 100,
      coverage: 100
    });
    expect(health.dimensions.find((row) => row.id === 'TECHNICAL_INTEGRATION')).toMatchObject({
      score: null,
      coverage: null,
      status: 'NOT_APPLICABLE'
    });
    expect(health.score).toBeNull(); // Three assessed dimensions still cannot manufacture a project score.
    expect(health.drivers.negative).toEqual([]);
  });
});

describe('Civil deadline and timezone boundaries', () => {
  it.each([
    ['2026-10-05T02:59:59Z', false],
    ['2026-10-05T03:00:00Z', false],
    ['2026-10-06T02:59:59Z', false],
    ['2026-10-06T03:00:00Z', true]
  ])('keeps the whole deadline day eligible at %s', (instant, overdue) => {
    const input = {
      deadline: '2026-10-05',
      status: 'A_FAZER',
      referenceDate: new Date(instant),
      timeZone: 'America/Sao_Paulo'
    };
    expect(isTaskOverdue(input)).toBe(overdue);
    expect(isTaskOverdue({ ...input, status: 'CONCLUIDO' })).toBe(false);
  });
  it('compares yesterday/today/tomorrow using the request day, not the UTC/server day', () => {
    const referenceDate = new Date('2026-10-06T01:00:00Z'); // Oct 5 in São Paulo.
    expect(taskDeadlineCutoff(referenceDate, 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-05T00:00:00.000Z'
    );
    expect(
      ['2026-10-04', '2026-10-05', '2026-10-06'].map((deadline) =>
        isTaskOverdue({
          deadline,
          status: 'EM_ANDAMENTO',
          referenceDate,
          timeZone: 'America/Sao_Paulo'
        })
      )
    ).toEqual([true, false, false]);
    expect(isTaskOverdue({ deadline: null, referenceDate })).toBe(false);
  });
  it.each([
    ['America/Sao_Paulo', '2026-10-06T02:59:59Z', '2026-10-05'],
    ['America/Sao_Paulo', '2026-10-06T03:00:00Z', '2026-10-06'],
    ['America/New_York', '2026-03-08T04:59:59Z', '2026-03-07'],
    ['America/New_York', '2026-03-08T07:00:00Z', '2026-03-08'],
    ['America/New_York', '2026-11-01T05:30:00Z', '2026-11-01'],
    ['America/New_York', '2026-11-01T06:30:00Z', '2026-11-01']
  ])('builds civil keys in %s across local/DST boundaries', (zone, instant, day) => {
    expect(createIndicatorLocalDateKey(zone)(new Date(instant))).toBe(day);
  });
});

describe('I04 known cohort and separate freshness', () => {
  const window = healthWindow(null, asOf);
  const facts = (overrides = {}, count = 4) => ({
    project: { githubIntegration: { ...integration, ...overrides } },
    currentMerged: [],
    previousMerged: [],
    age: { total: 0, eligible: 0, totalDays: 0 },
    cohort: { closedCount: count, reopenedCount: count ? 1 : 0, mergedCount: 0 }
  });
  it('scores a recent confirmed cohort and publishes its real cutoff', () => {
    const raw = githubHealthIndicators(facts(), window, true).current[0];
    expect(raw).toMatchObject({
      metricId: 'I04',
      state: 'AVAILABLE',
      value: 25,
      numerator: 1,
      denominator: 4,
      period: { endExclusive: '2026-10-05T19:55:00.000Z' },
      limitations: ['PR_COHORT_CUT_AT_LAST_SYNC']
    });
    expect(assessSignal('I04', new Map([['I04', raw]]))).toMatchObject({
      score: 75,
      basis: { cohortEndExclusive: '2026-10-05T19:55:00.000Z', closedPullRequests: 4 }
    });
  });
  it('does not assess a missing start of coverage or fabricate a zero denominator', () => {
    const raw = githubHealthIndicators(
      facts({ pullRequestLifecycleCoverageFrom: new Date('2026-10-01') }),
      window,
      true
    ).current[0];
    expect(raw).toMatchObject({ state: 'PARTIAL', value: null });
    expect(assessSignal('I04', new Map([['I04', raw]])).score).toBeNull();
    expect(githubHealthIndicators(facts({}, 0), window, true).current[0]).toMatchObject({
      state: 'NO_DATA',
      value: null
    });
  });
  it('keeps stale source separate from the numerically known cohort', () => {
    const raw = githubHealthIndicators(
      facts({ lastSyncStatus: 'FALHA', lastSyncAt: new Date('2026-10-01') }),
      window,
      true
    ).current[0];
    expect(raw).toMatchObject({ state: 'STALE', value: 25 });
    expect(assessSignal('I04', new Map([['I04', raw]])).score).toBeNull();
  });
  it('clips both civil labels and bounds without manufacturing an unknown starting interval', () => {
    const period = normalizeIndicatorPeriod({
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      timeZone: 'America/Sao_Paulo'
    });
    const result = lifecycleCohort(period, integration);
    expect(result.complete).toBe(true);
    expect(result.period.endExclusive).toEqual(integration.pullRequestLifecycleSyncedAt);
    expect(result.period.endDate).toBe('2026-10-05');
    expect(
      lifecycleCohort(period, {
        ...integration,
        pullRequestLifecycleSyncedAt: new Date('2026-09-01')
      }).period
    ).toBeNull();
  });
});
