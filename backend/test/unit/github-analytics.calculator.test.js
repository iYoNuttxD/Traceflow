import { describe, expect, it } from 'vitest';
import {
  ageDays,
  calculateAgeSummary,
  calculateClosedCohort,
  calculateDurations
} from '../../src/modules/indicators/calculators/github-analytics.calculator.js';
import { median } from '../../src/modules/indicators/calculators/statistics.calculator.js';

describe('GitHub analytics calculators', () => {
  it.each([
    [[1], 1],
    [[1, 3], 2],
    [[1, 2, 10], 2],
    [[1, 2, 3, 100], 2.5]
  ])('computes median for %j', (values, expected) => {
    expect(median(values)).toBe(expected);
  });

  it('distinguishes zero numerator from absent cohort', () => {
    expect(
      calculateClosedCohort({ closedCount: 10n, reopenedCount: 0n, mergedCount: 5n })
    ).toMatchObject({
      rework: { value: 0, numerator: 0, denominator: 10 },
      merged: { value: 50, numerator: 5, denominator: 10 }
    });
    expect(
      calculateClosedCohort({ closedCount: 0n, reopenedCount: 0n, mergedCount: 0n })
    ).toMatchObject({
      rework: { value: null, denominator: 0 },
      merged: { value: null, denominator: 0 }
    });
  });

  it('uses one valid duration sample for median and mean, excluding invalid timestamps', () => {
    const at = (hours) => new Date(hours * 3600000);
    expect(
      calculateDurations(
        [
          { start: at(0), end: at(1) },
          { start: at(0), end: at(3) },
          { start: at(0), end: at(8) },
          { start: null, end: at(5) },
          { start: at(10), end: at(9) }
        ],
        'start',
        'end',
        3600000
      )
    ).toEqual({ median: 3, mean: 4, eligibleCount: 3, excludedCount: 2 });
  });

  it('calculates open queue age from a controlled clock', () => {
    const asOf = new Date('2026-09-24T12:00:00Z');
    expect(ageDays(new Date('2026-09-20T12:00:00Z'), asOf)).toBe(4);
    expect(calculateAgeSummary({ total: 3n, eligible: 2n, totalDays: 5 })).toEqual({
      total: 3,
      eligibleCount: 2,
      excludedCount: 1,
      mean: 2.5
    });
  });
});
