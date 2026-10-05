const known = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Unknown estimates are excluded from the subtotal, never represented as zero work.
export function summarizeSprintEstimates(values) {
  const estimates = values.filter(known);
  return {
    value: estimates.length
      ? estimates.reduce((sum, value) => sum + value, 0)
      : values.length
        ? null
        : 0,
    tasks: values.length,
    knownEstimateCount: estimates.length,
    unknownEstimateCount: values.length - estimates.length
  };
}

export function closingSprintEstimate(row) {
  const snapshot = row.closingTaskSnapshot;
  if (snapshot?.version >= 3 && Object.hasOwn(snapshot, 'estimatedEffort')) {
    return known(snapshot.estimatedEffort) ? snapshot.estimatedEffort : null;
  }
  // Legacy zero may have been produced by a missing estimate. Positive points are unambiguous.
  return known(row.pointsAtClose) && row.pointsAtClose > 0 ? row.pointsAtClose : null;
}

export function planningSprintEstimates(sprint, rows, events = []) {
  const baseline = events.filter((event) => event.type === 'BASELINE_TASK');
  const complete = Boolean(
    sprint.startedAt &&
    sprint.burnupCoverageStartedAt &&
    new Date(sprint.burnupCoverageStartedAt).getTime() === new Date(sprint.startedAt).getTime()
  );
  const planned = rows.filter((row) => row.plannedAtStart === true);
  const captured = complete && (baseline.length > 0 || planned.length === 0);
  const summary = summarizeSprintEstimates(
    captured
      ? baseline.map((event) => event.newPoints)
      : planned.map((row) =>
          known(row.pointsAtPlanning) && row.pointsAtPlanning > 0 ? row.pointsAtPlanning : null
        )
  );
  return { ...summary, legacyUnknown: !captured && summary.unknownEstimateCount > 0 };
}
