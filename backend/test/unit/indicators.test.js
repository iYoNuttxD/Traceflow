import { describe, expect, it } from 'vitest';
import { calculateProjectProgress } from '../../src/modules/indicators/calculators/project-progress.calculator.js';
import {
  calculateDistribution,
  combineActivity
} from '../../src/modules/indicators/calculators/responsibility-activity.calculator.js';
import { normalizeIndicatorPeriod } from '../../src/modules/indicators/policies/indicator-period.policy.js';
import { activityState } from '../../src/modules/indicators/policies/indicator-state.policy.js';
import { githubFreshness } from '../../src/modules/indicators/policies/indicator-freshness.policy.js';

describe('Indicator Engine puro', () => {
  it('distingue universo ausente de zero medido e arredonda percentual', () => {
    expect(calculateProjectProgress({ total: 0, completed: 0 })).toEqual({
      value: null,
      numerator: 0,
      denominator: 0,
      state: 'NO_DATA'
    });
    expect(calculateProjectProgress({ total: 10, completed: 0 }).value).toBe(0);
    expect(calculateProjectProgress({ total: 10, completed: 5 }).value).toBe(50);
    expect(calculateProjectProgress({ total: 10, completed: 10 }).value).toBe(100);
    expect(calculateProjectProgress({ total: 3, completed: 1 }).value).toBe(33.33);
  });

  it('converte dias civis com início inclusivo e fim exclusivo mesmo em DST', () => {
    const saoPaulo = normalizeIndicatorPeriod({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: 'America/Sao_Paulo'
    });
    expect(saoPaulo.startInclusive.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(saoPaulo.endExclusive.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    const spring = normalizeIndicatorPeriod({
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      timeZone: 'America/New_York'
    });
    expect(spring.startInclusive.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(spring.endExclusive.toISOString()).toBe('2026-03-09T04:00:00.000Z');
    const fall = normalizeIndicatorPeriod({
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      timeZone: 'America/New_York'
    });
    expect(fall.startInclusive.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(fall.endExclusive.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('preserva não associados sem score nem ordenação por produtividade', () => {
    const commits = calculateDistribution([
      { userId: 3, displayName: 'Ana', count: 5n },
      { userId: null, displayName: null, count: 2n }
    ]);
    const tasks = calculateDistribution([
      { userId: 4, displayName: 'Bia', count: 3n },
      { userId: null, displayName: null, count: 1n, unknownHistorical: 1n }
    ]);
    expect(commits).toMatchObject({ total: 7, associated: 5, unassociated: 2 });
    expect(tasks).toMatchObject({ total: 4, unassociated: 1, unassignedHistoricalCount: 1 });
    expect(combineActivity(commits, tasks)).toEqual([
      { userId: 3, displayName: 'Ana', completedTasks: 0, commits: 5 },
      { userId: 4, displayName: 'Bia', completedTasks: 3, commits: 0 }
    ]);
    expect(activityState({ state: 'STALE' }, { state: 'AVAILABLE' })).toBe('STALE');
    expect(activityState({ state: 'PARTIAL' }, { state: 'AVAILABLE' })).toBe('PARTIAL');
    expect(activityState({ state: 'UNAVAILABLE' }, { state: 'AVAILABLE' })).toBe('PARTIAL');
  });

  it('marca falha/reconexão/head divergente como frescor comprometido sem limiar de idade', () => {
    expect(
      githubFreshness(
        { status: 'ACTIVE', lastSyncStatus: 'FALHA', lastSyncAt: new Date() },
        { headSha: 'new', lastSyncedHeadSha: 'old' }
      )
    ).toMatchObject({
      stale: true,
      limitations: ['GITHUB_SYNC_FAILED', 'MAIN_HEAD_NOT_RECONCILED']
    });
  });
});
