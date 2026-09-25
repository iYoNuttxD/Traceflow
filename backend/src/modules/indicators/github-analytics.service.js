import { resourceNotFoundError } from '../../shared/errors/index.js';
import {
  ageDays,
  calculateAgeSummary,
  calculateClosedCohort,
  calculateDurations
} from './calculators/github-analytics.calculator.js';
import { githubAnalyticsRepository } from './github-analytics.repository.js';
import { indicatorResult } from './indicators.mapper.js';
import { githubFreshness } from './policies/indicator-freshness.policy.js';
import { normalizeIndicatorPeriod } from './policies/indicator-period.policy.js';
import { activityState } from './policies/indicator-state.policy.js';

const DAY = 86400000;
const HOUR = 3600000;

function publicPeriod(period) {
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    timeZone: period.timeZone,
    startInclusive: period.startInclusive.toISOString(),
    endExclusive: period.endExclusive.toISOString()
  };
}

function state(ready, freshness, value, partial = false) {
  if (!ready) return 'UNAVAILABLE';
  if (partial) return 'PARTIAL';
  if (freshness.stale) return 'STALE';
  return value === null ? 'NO_DATA' : 'AVAILABLE';
}

export const githubAnalyticsService = {
  async read(projectId, query) {
    const id = Number(projectId);
    const period = normalizeIndicatorPeriod(query);
    const facts = await githubAnalyticsRepository.read(id, period);
    if (!facts) throw resourceNotFoundError('Project');
    const integration = facts.project.githubIntegration;
    const ready = Boolean(integration?.lastSyncAt);
    const freshness = githubFreshness(integration);
    const asOf = facts.asOf.toISOString();
    const periodDto = publicPeriod(period);
    const coverageFrom = integration?.pullRequestLifecycleCoverageFrom ?? null;
    const coverageThrough = integration?.pullRequestLifecycleSyncedAt ?? null;
    const covered = Boolean(
      coverageFrom &&
      coverageThrough &&
      coverageFrom <= period.startInclusive &&
      coverageThrough >= period.endExclusive
    );
    const coverage = {
      from: coverageFrom?.toISOString() ?? null,
      through: coverageThrough?.toISOString() ?? null
    };
    const lifecycleLimitations = covered ? [] : ['PR_LIFECYCLE_PERIOD_NOT_COVERED'];
    const source = {
      sourceUpdatedAt: freshness.sourceUpdatedAt?.toISOString() ?? null,
      sourceSyncStatus: freshness.sourceSyncStatus
    };
    const baseLimitations = ready ? freshness.limitations : ['GITHUB_SNAPSHOT_NOT_AVAILABLE'];
    const result = (metricId, value, extras = {}) => {
      const { partial = false, ...publicExtras } = extras;
      return indicatorResult(
        metricId,
        id,
        {
          value: ready ? value : null,
          state: state(ready, freshness, value, partial),
          period: ['I10', 'I13', 'I17', 'I73'].includes(metricId) ? null : periodDto,
          ...source,
          limitations: [...baseLimitations, ...(extras.limitations ?? [])],
          ...publicExtras
        },
        asOf
      );
    };
    const cohort = calculateClosedCohort(facts.cohort);
    const lifecycleState =
      !ready || !coverageFrom || !coverageThrough
        ? 'UNAVAILABLE'
        : covered
          ? state(ready, freshness, Number(facts.cohort.closedCount))
          : 'PARTIAL';
    const lifecycleResult = (metricId, value, extras = {}) =>
      indicatorResult(
        metricId,
        id,
        {
          value: covered && ready ? value : null,
          state: lifecycleState === 'AVAILABLE' && value === null ? 'NO_DATA' : lifecycleState,
          period: periodDto,
          ...source,
          coverage,
          limitations: [...baseLimitations, ...lifecycleLimitations],
          ...extras
        },
        asOf
      );
    const rework = lifecycleResult('I04', cohort.rework.value, {
      numerator: covered ? cohort.rework.numerator : null,
      denominator: covered ? cohort.rework.denominator : null
    });
    const mergeRate = {
      value: covered && ready ? cohort.merged.value : null,
      numerator: covered ? cohort.merged.numerator : null,
      denominator: covered ? cohort.merged.denominator : null,
      state:
        lifecycleState === 'AVAILABLE' && cohort.merged.value === null ? 'NO_DATA' : lifecycleState
    };
    const quality = lifecycleResult(
      'I06',
      {
        reworkRate: rework.value,
        mergedRate: mergeRate.value
      },
      {
        components: { rework: rework.state, merged: mergeRate.state },
        numerator: mergeRate.numerator,
        denominator: mergeRate.denominator,
        state: activityState(rework, mergeRate)
      }
    );
    const mergeDurations = calculateDurations(
      facts.mergedPrs,
      'createdAtGithub',
      'mergedAtGithub',
      HOUR
    );
    const issueDurations = calculateDurations(
      facts.closedIssues,
      'createdAtGithub',
      'closedAtGithub',
      DAY
    );
    const age = calculateAgeSummary(facts.age);
    const duration = (metricId, sample, statistic, limitations = []) =>
      result(metricId, sample[statistic], {
        eligibleCount: sample.eligibleCount,
        excludedCount: sample.excludedCount,
        partial: sample.excludedCount > 0 && sample.eligibleCount > 0,
        limitations: [
          ...(sample.excludedCount ? ['INVALID_OR_MISSING_TIMESTAMPS_EXCLUDED'] : []),
          ...limitations
        ]
      });
    const issueLimitations = ['ISSUE_LIFECYCLE_NOT_COLLECTED'];
    const indicators = [
      rework,
      quality,
      result('I09', facts.commits),
      result('I10', facts.openPrs),
      lifecycleResult('I11', Number(facts.cohort.closedCount)),
      result('I12', facts.mergedPrs.length),
      result('I13', facts.openIssues),
      result('I14', facts.closedIssues.length, { limitations: issueLimitations, partial: true }),
      duration('I15', mergeDurations, 'median'),
      duration('I16', mergeDurations, 'mean'),
      result('I17', age.eligibleCount ? age.eligibleCount : null, {
        kind: 'LIST',
        items: ready
          ? facts.oldestPrs.map((pr) => ({
              pullRequestId: pr.id,
              number: pr.number,
              title: pr.title,
              age: ageDays(pr.createdAtGithub, facts.asOf),
              githubUrl: pr.githubUrl,
              createdAtGithub: pr.createdAtGithub.toISOString()
            }))
          : [],
        eligibleCount: age.eligibleCount,
        excludedCount: age.excludedCount,
        partial: age.excludedCount > 0 && age.eligibleCount > 0,
        limitations: age.excludedCount ? ['INVALID_OR_MISSING_TIMESTAMPS_EXCLUDED'] : []
      }),
      duration('I18', issueDurations, 'median', issueLimitations),
      result('I73', age.mean, {
        eligibleCount: age.eligibleCount,
        excludedCount: age.excludedCount,
        partial: age.excludedCount > 0 && age.eligibleCount > 0,
        limitations: age.excludedCount ? ['INVALID_OR_MISSING_TIMESTAMPS_EXCLUDED'] : []
      }),
      duration('I74', issueDurations, 'mean', issueLimitations)
    ];
    return { projectId: id, period: periodDto, indicators };
  }
};
