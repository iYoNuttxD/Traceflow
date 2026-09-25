import { durationSample, mean, median, percentage, roundMetric } from './statistics.calculator.js';

export function calculateClosedCohort({ closedCount, reopenedCount, mergedCount }) {
  const denominator = Number(closedCount);
  const reopened = Number(reopenedCount);
  const merged = Number(mergedCount);
  return {
    rework: { value: percentage(reopened, denominator), numerator: reopened, denominator },
    merged: { value: percentage(merged, denominator), numerator: merged, denominator }
  };
}

export function calculateDurations(rows, startField, endField, unitMilliseconds) {
  const sample = durationSample(rows, startField, endField, unitMilliseconds);
  return {
    median: sample.eligibleCount ? roundMetric(median(sample.durations)) : null,
    mean: sample.eligibleCount ? roundMetric(mean(sample.durations)) : null,
    eligibleCount: sample.eligibleCount,
    excludedCount: sample.excludedCount
  };
}

export function calculateAgeSummary({ total, eligible, totalDays }) {
  const totalCount = Number(total);
  const eligibleCount = Number(eligible);
  return {
    total: totalCount,
    eligibleCount,
    excludedCount: totalCount - eligibleCount,
    mean: eligibleCount === 0 ? null : roundMetric(Number(totalDays) / eligibleCount)
  };
}

export function ageDays(createdAt, asOf) {
  return roundMetric((asOf.getTime() - createdAt.getTime()) / 86400000);
}
