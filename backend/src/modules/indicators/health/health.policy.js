import { HEALTH_DIMENSIONS, HEALTH_MODEL_VERSION, HEALTH_REGISTRY } from './health.registry.js';
import { createIndicatorLocalDateKey } from '../policies/indicator-period.policy.js';

const DAY = 86400000;
const round = (value) => Math.round(value * 100) / 100;
const clamp = (value) => Math.max(0, Math.min(100, value));
const valid = (value) => typeof value === 'number' && Number.isFinite(value);

export function healthStatus(score) {
  if (score == null) return 'UNASSESSED';
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'ATTENTION';
  return 'CRITICAL';
}

export function healthWindow(requested, asOf) {
  const end = new Date(
    Math.min(requested?.endExclusive?.getTime() ?? asOf.getTime(), asOf.getTime())
  );
  const start = requested?.startInclusive ?? new Date(end.getTime() - 30 * DAY);
  if (end <= start) return null;
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const localDate = createIndicatorLocalDateKey(requested?.timeZone ?? 'UTC');
  const make = (from, until) => ({
    startDate: localDate(from),
    endDate: localDate(new Date(until.getTime() - 1)),
    timeZone: requested?.timeZone ?? 'UTC',
    startInclusive: from,
    endExclusive: until
  });
  return { current: make(start, end), previous: make(previousStart, start) };
}

function value(map, id) {
  return map.get(id);
}

function available(map, id) {
  const indicator = value(map, id);
  return indicator?.state === 'AVAILABLE' ? indicator : null;
}

function scored(score, reasonCode, basis) {
  return valid(score) ? { score: round(clamp(score)), reasonCode, basis } : null;
}

function inversePercent(map, id) {
  const indicator = available(map, id);
  return indicator && valid(indicator.value)
    ? scored(100 - indicator.value, 'INVERSE_PERCENT', { value: indicator.value })
    : null;
}

function directPercent(map, id) {
  const indicator = available(map, id);
  return indicator && valid(indicator.value)
    ? scored(indicator.value, 'DIRECT_PERCENT', { value: indicator.value })
    : null;
}

function comparison(map, previous, id) {
  const current = available(map, id);
  const baseline = available(previous, id);
  if (
    !current ||
    !baseline ||
    !valid(current.value) ||
    !valid(baseline.value) ||
    baseline.value <= 0 ||
    current.eligibleCount < 3 ||
    baseline.eligibleCount < 3
  )
    return null;
  const regression = Math.max(0, ((current.value - baseline.value) / baseline.value) * 100);
  return scored(100 - regression, 'BASELINE_REGRESSION', {
    current: current.value,
    previous: baseline.value,
    regressionPercent: round(regression),
    currentSample: current.eligibleCount,
    previousSample: baseline.eligibleCount
  });
}

function gap(map, id, expectedId) {
  const current = available(map, id);
  const expected = available(map, expectedId);
  if (!valid(current?.value) || !valid(expected?.value)) return null;
  const gapPoints = Math.max(0, expected.value - current.value);
  return scored(100 - gapPoints, 'STAGE_GAP', {
    current: current.value,
    expected: expected.value,
    gapPoints,
    expectedMetricId: expectedId
  });
}

export function assessSignal(metricId, current, previous = new Map()) {
  const entry = HEALTH_REGISTRY[metricId];
  if (!entry) throw new Error(`Unclassified health metric: ${metricId}`);
  if (entry.healthRole !== 'SCORING_SIGNAL')
    return {
      healthModelVersion: HEALTH_MODEL_VERSION,
      healthRole: entry.healthRole,
      dimension: null,
      status: 'NEUTRAL',
      score: null,
      reasonCode: entry.healthRole,
      basis: null
    };

  const raw = value(current, metricId);
  let result = null;
  if (['I28', 'I29', 'I30'].includes(metricId)) {
    const total = available(current, 'I26');
    if (raw?.state === 'AVAILABLE' && valid(raw.value) && valid(total?.value) && total.value > 0)
      result = scored(100 - (raw.value / total.value) * 100, 'TASK_SHARE', {
        count: raw.value,
        totalTasks: total.value
      });
  } else if (['I20', 'I21', 'I15'].includes(metricId))
    result = comparison(current, previous, metricId);
  else if (metricId === 'I44') {
    const estimate = raw?.value?.estimatedHours;
    const actual = raw?.value?.actualHours;
    if (
      raw?.state === 'AVAILABLE' &&
      raw.components?.incomplete !== true &&
      valid(estimate) &&
      valid(actual) &&
      estimate > 0
    )
      result = scored(100 - (Math.abs(actual - estimate) / estimate) * 100, 'EFFORT_DEVIATION', {
        estimatedHours: estimate,
        actualHours: actual
      });
  } else if (metricId === 'I45') {
    const points = raw?.points ?? [];
    const last = [...points]
      .reverse()
      .find((point) => valid(point.remaining) && valid(point.ideal));
    const scope = raw?.coverage?.totalPoints;
    if (raw?.state === 'AVAILABLE' && points.length >= 2 && last && valid(scope) && scope > 0)
      result = scored(
        100 - (Math.max(0, last.remaining - last.ideal) / scope) * 100,
        'BURNDOWN_GAP',
        { actualRemaining: last.remaining, idealRemaining: last.ideal, baselineScope: scope }
      );
  } else if (metricId === 'I71') {
    const planned = available(current, 'I39');
    const added = raw?.value?.addedCount;
    const removed = raw?.value?.removedCount;
    if (
      raw?.state === 'AVAILABLE' &&
      valid(planned?.value) &&
      planned.value > 0 &&
      valid(added) &&
      valid(removed)
    )
      result = scored(100 - ((added + removed) / planned.value) * 100, 'SCOPE_CHANGE', {
        addedCount: added,
        removedCount: removed,
        plannedTasks: planned.value
      });
  } else if (['I04', 'I64'].includes(metricId)) result = inversePercent(current, metricId);
  else if (['I49', 'I58', 'I61'].includes(metricId)) result = directPercent(current, metricId);
  else if (metricId === 'I52') {
    const distribution = raw?.distribution ?? raw?.value;
    if (
      raw?.state === 'AVAILABLE' &&
      valid(distribution?.PASS) &&
      valid(distribution?.total) &&
      distribution.total > 0
    )
      result = scored((distribution.PASS / distribution.total) * 100, 'CURRENT_TEST_PASS', {
        pass: distribution.PASS,
        total: distribution.total
      });
  } else if (metricId === 'I66' || metricId === 'I62') result = gap(current, metricId, 'I01');
  else if (metricId === 'I63' || metricId === 'I65') result = gap(current, metricId, 'I66');
  else if (metricId === 'I73') {
    const open = available(current, 'I10');
    const merge = available(current, 'I15');
    if (open?.value === 0) result = scored(100, 'NO_OPEN_PRS', { openPullRequests: 0 });
    else if (
      valid(open?.value) &&
      open.value > 0 &&
      raw?.state === 'AVAILABLE' &&
      valid(raw.value) &&
      valid(merge?.value) &&
      merge.value > 0 &&
      merge.eligibleCount >= 3
    )
      result = scored(
        100 - Math.max(0, (raw.value * 24 - merge.value) / merge.value) * 100,
        'OPEN_PR_AGE',
        {
          averageOpenAgeDays: raw.value,
          medianMergeHours: merge.value,
          openPullRequests: open.value
        }
      );
  }
  return {
    healthModelVersion: HEALTH_MODEL_VERSION,
    healthRole: entry.healthRole,
    dimension: entry.healthDimension,
    weight: entry.weight,
    status: healthStatus(result?.score),
    score: result?.score ?? null,
    reasonCode:
      result?.reasonCode ??
      (raw?.state && raw.state !== 'AVAILABLE' ? `DATA_${raw.state}` : 'INSUFFICIENT_BASIS'),
    basis: result?.basis ?? null
  };
}

export function buildProjectHealth(current, previous = new Map(), options = {}) {
  const assessments = Object.fromEntries(
    Object.keys(HEALTH_REGISTRY).map((id) => [id, assessSignal(id, current, previous)])
  );
  const dimensions = Object.entries(HEALTH_DIMENSIONS).map(([id, definition]) => {
    const applicable = !(
      (id === 'SPRINT' && options.sprintApplicable === false) ||
      (id === 'TECHNICAL_INTEGRATION' && options.githubApplicable === false)
    );
    const signals = Object.keys(definition.signals);
    const assessedWeight = applicable
      ? signals.reduce(
          (sum, metricId) =>
            sum + (assessments[metricId].score == null ? 0 : definition.signals[metricId]),
          0
        )
      : 0;
    const coverage = applicable ? round(assessedWeight) : null;
    const score =
      applicable && assessedWeight >= 50
        ? round(
            signals.reduce(
              (sum, metricId) =>
                sum +
                (assessments[metricId].score ?? 0) *
                  (assessments[metricId].score == null ? 0 : definition.signals[metricId]),
              0
            ) / assessedWeight
          )
        : null;
    return {
      id,
      weight: definition.weight,
      applicable,
      coverage,
      score,
      status: applicable ? healthStatus(score) : 'NOT_APPLICABLE',
      assessedSignals: applicable
        ? signals.filter((metricId) => assessments[metricId].score != null)
        : [],
      unassessedSignals: applicable
        ? signals.filter((metricId) => assessments[metricId].score == null)
        : []
    };
  });
  const applicableWeight = dimensions.reduce(
    (sum, dimension) => sum + (dimension.applicable ? dimension.weight : 0),
    0
  );
  const projectCoverage = applicableWeight
    ? round(
        (dimensions.reduce(
          (sum, dimension) =>
            sum + (dimension.applicable ? (dimension.weight * dimension.coverage) / 100 : 0),
          0
        ) /
          applicableWeight) *
          100
      )
    : 0;
  const included = dimensions.filter((dimension) => dimension.score != null);
  const applicableSignals = dimensions.reduce(
    (sum, dimension) =>
      sum +
      (dimension.applicable ? Object.keys(HEALTH_DIMENSIONS[dimension.id].signals).length : 0),
    0
  );
  const assessedSignals = dimensions.reduce(
    (sum, dimension) => sum + dimension.assessedSignals.length,
    0
  );
  const effectiveWeight = included.reduce(
    (sum, dimension) => sum + (dimension.weight * dimension.coverage) / 100,
    0
  );
  const score =
    projectCoverage >= 60 && included.length >= 4 && effectiveWeight > 0
      ? round(
          included.reduce(
            (sum, dimension) =>
              sum + (dimension.score * dimension.weight * dimension.coverage) / 100,
            0
          ) / effectiveWeight
        )
      : null;
  const drivers = Object.entries(assessments)
    .filter(([, assessment]) => assessment.score != null)
    .flatMap(([metricId, assessment]) => {
      const dimension = dimensions.find((item) => item.id === assessment.dimension);
      if (!dimension?.applicable || dimension.score == null) return [];
      return [
        {
          metricId,
          dimension: assessment.dimension,
          status: assessment.status,
          score: assessment.score,
          impact: round(
            (((dimension.weight * assessment.weight) / 100) * (100 - assessment.score)) / 100
          ),
          reasonCode: assessment.reasonCode,
          basis: assessment.basis
        }
      ];
    });
  return {
    healthModelVersion: HEALTH_MODEL_VERSION,
    status: healthStatus(score),
    score,
    coverage: projectCoverage,
    assessedDimensions: included.length,
    applicableDimensions: dimensions.filter((dimension) => dimension.applicable).length,
    assessedSignals,
    applicableSignals,
    dimensions,
    drivers: {
      negative: drivers
        .filter((driver) => driver.score < 80)
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 3),
      positive: drivers
        .filter((driver) => driver.score >= 80)
        .sort((a, b) => a.impact - b.impact)
        .slice(0, 3)
    },
    assessments
  };
}
