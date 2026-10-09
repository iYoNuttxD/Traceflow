import {
  calculateAgeSummary,
  calculateClosedCohort,
  calculateDurations
} from '../calculators/github-analytics.calculator.js';
import { calculateFlowTaskHistory } from '../calculators/flow-task.calculator.js';
import { calculateHealthQualityFacts } from '../calculators/quality-analytics.calculator.js';
import { percentage } from '../calculators/statistics.calculator.js';
import { githubFreshness } from '../policies/indicator-freshness.policy.js';
import { lifecycleCohort } from '../policies/pr-cohort.policy.js';

function durationState(sample) {
  if (!sample.eligibleCount) return sample.excludedCount ? 'UNAVAILABLE' : 'NO_DATA';
  return sample.excludedCount ? 'PARTIAL' : 'AVAILABLE';
}

export function flowHealthIndicators(facts, window, asOf, context = null) {
  const rows = Object.fromEntries(
    ['current', 'previous'].map((kind) => {
      const period = window[kind];
      const calculate = () =>
        calculateFlowTaskHistory({
          tasks: facts.tasks,
          movements: facts.movements,
          period,
          asOf,
          durationsOnly: true
        });
      const result = context
        ? context.calculate(
            `flow:${period.startInclusive.toISOString()}:${period.endExclusive.toISOString()}`,
            calculate
          )
        : calculate();
      return [
        kind,
        ['lead', 'cycle'].map((name, index) => ({
          metricId: index ? 'I21' : 'I20',
          value: result[name].value,
          state: durationState(result[name]),
          eligibleCount: result[name].eligibleCount,
          excludedCount: result[name].excludedCount
        }))
      ];
    })
  );
  if (facts.planning) {
    rows.planning = [
      ['I26', 'total'],
      ['I28', 'overdue'],
      ['I29', 'unassigned'],
      ['I30', 'withoutEstimate']
    ].map(([metricId, field]) => ({
      metricId,
      value: Number(facts.planning[field]),
      state: 'AVAILABLE'
    }));
  }
  return rows;
}

export function qualityHealthIndicators(facts) {
  const values = calculateHealthQualityFacts(facts);
  const passRate = percentage(values.executions.PASS, values.executions.total);
  return [
    {
      metricId: 'I49',
      value: passRate,
      state: values.executions.total ? 'AVAILABLE' : 'NO_DATA'
    },
    {
      metricId: 'I52',
      value: values.health,
      distribution: values.health,
      state: values.health.total ? 'AVAILABLE' : 'NO_DATA'
    },
    {
      metricId: 'I58',
      value: values.retests.value,
      state: values.retests.distribution.total
        ? values.retests.excludedCount
          ? 'PARTIAL'
          : 'AVAILABLE'
        : values.retests.excludedCount
          ? 'UNAVAILABLE'
          : 'NO_DATA'
    }
  ];
}

function durationIndicator(rows, metricId, ready, stale) {
  const sample = calculateDurations(rows, 'createdAtGithub', 'mergedAtGithub', 3600000);
  return {
    metricId,
    value: ready ? sample.median : null,
    state: !ready
      ? 'UNAVAILABLE'
      : sample.excludedCount && sample.eligibleCount
        ? 'PARTIAL'
        : stale
          ? 'STALE'
          : sample.median === null
            ? 'NO_DATA'
            : 'AVAILABLE',
    eligibleCount: sample.eligibleCount,
    excludedCount: sample.excludedCount
  };
}

export function githubHealthIndicators(facts, window, includeCurrent) {
  const integration = facts.project?.githubIntegration;
  const ready = Boolean(integration?.lastSyncAt);
  const stale = githubFreshness(integration).stale;
  const previous = window ? [durationIndicator(facts.previousMerged, 'I15', ready, stale)] : [];
  if (!includeCurrent) return { current: [], previous };
  const age = calculateAgeSummary(facts.age);
  const queueState = !ready ? 'UNAVAILABLE' : stale ? 'STALE' : 'AVAILABLE';
  const ageState = !ready
    ? 'UNAVAILABLE'
    : age.excludedCount && age.eligibleCount
      ? 'PARTIAL'
      : stale
        ? 'STALE'
        : age.mean === null
          ? 'NO_DATA'
          : 'AVAILABLE';
  const queue = { metricId: 'I10', value: ready ? age.total : null, state: queueState };
  const queueAge = { metricId: 'I73', value: ready ? age.mean : null, state: ageState };
  if (!window) return { current: [queue, queueAge], previous };
  const currentDuration = durationIndicator(facts.currentMerged, 'I15', ready, stale);
  const cohortWindow = lifecycleCohort(window.current, integration);
  const covered = cohortWindow.complete;
  const rework = calculateClosedCohort(facts.cohort).rework;
  const lifecycleState =
    !ready ||
    !integration?.pullRequestLifecycleCoverageFrom ||
    !integration?.pullRequestLifecycleSyncedAt
      ? 'UNAVAILABLE'
      : !covered
        ? 'PARTIAL'
        : stale
          ? 'STALE'
          : rework.value === null
            ? 'NO_DATA'
            : 'AVAILABLE';
  return {
    current: [
      {
        metricId: 'I04',
        value: covered && ready ? rework.value : null,
        state: lifecycleState,
        numerator: covered && ready ? rework.numerator : null,
        denominator: covered && ready ? rework.denominator : null,
        period: cohortWindow.period
          ? {
              startInclusive: cohortWindow.period.startInclusive.toISOString(),
              endExclusive: cohortWindow.period.endExclusive.toISOString(),
              timeZone: cohortWindow.period.timeZone
            }
          : null,
        sourceUpdatedAt: integration?.lastSyncAt?.toISOString() ?? null,
        coverage: cohortWindow.coverage,
        limitations: !integration
          ? ['GITHUB_NOT_CONFIGURED']
          : [...githubFreshness(integration).limitations, ...cohortWindow.limitations]
      },
      queue,
      currentDuration,
      queueAge
    ],
    previous
  };
}
