import { createIndicatorLocalDateKey } from './indicator-period.policy.js';

// A confirmed sync establishes an observation cutoff, independently of freshness.
export function lifecycleCohort(period, integration) {
  const from = integration?.pullRequestLifecycleCoverageFrom;
  const through = integration?.pullRequestLifecycleSyncedAt;
  const endExclusive = new Date(
    Math.min(period.endExclusive.getTime(), through?.getTime() ?? period.endExclusive.getTime())
  );
  const startInclusive = new Date(
    Math.max(period.startInclusive.getTime(), from?.getTime() ?? period.startInclusive.getTime())
  );
  const complete = Boolean(
    from && through && from <= period.startInclusive && endExclusive > startInclusive
  );
  const dateKey = createIndicatorLocalDateKey(period.timeZone ?? 'UTC');
  const effective =
    endExclusive > startInclusive
      ? {
          ...period,
          startInclusive,
          endExclusive,
          startDate: dateKey(startInclusive),
          endDate: dateKey(new Date(endExclusive.getTime() - 1))
        }
      : null;
  return {
    period: effective,
    complete,
    coverage: { from: from?.toISOString() ?? null, through: through?.toISOString() ?? null },
    limitations: [
      ...(!complete ? ['PR_LIFECYCLE_PERIOD_NOT_COVERED'] : []),
      ...(through && through < period.endExclusive ? ['PR_COHORT_CUT_AT_LAST_SYNC'] : [])
    ]
  };
}
