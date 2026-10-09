import { buildSprintHistoricalSummary } from './sprint.summary.calculator.js';
import { isTerminalSprintStatus } from './sprint.schema.js';

import { planningSprintEstimates, summarizeSprintEstimates } from './sprint.estimate.calculator.js';

// Adapter facts for Indicators; the established Progress, Effort and Burndown
// calculators remain the only owners of those calculations.
export function buildSprintAnalyticsFacts({
  sprint,
  participations,
  burndownData,
  progress,
  historicalEvents = []
}) {
  const frozen = isTerminalSprintStatus(sprint.status);
  const planningKnown = Boolean(sprint.startedAt && sprint.planningSnapshotAt);
  const planned = participations.filter((row) => row.plannedAtStart === true);
  const activePoints = burndownData.filter((row) => row.removedAt === null);
  const summary = progress.historicalSummary;
  const incoming = participations
    .filter((row) => row.removedAt === null && row.carriedFromSprintId != null)
    .map((row) => ({
      taskId: frozen ? (row.closingTaskSnapshot?.id ?? row.taskId) : row.taskId,
      title: row.taskTitleSnapshot,
      fromSprintId: row.carriedFromSprintId
    }))
    .sort((a, b) => (a.taskId ?? 0) - (b.taskId ?? 0));
  const outgoing = progress.carryOver.map((row) => ({ ...row }));
  const planningEstimates = frozen
    ? summary?.estimateCoverage?.planned
    : planningSprintEstimates(sprint, participations, historicalEvents);
  const currentEstimates = frozen
    ? summary?.estimateCoverage?.current
    : summarizeSprintEstimates(activePoints.map((row) => row.points));
  const deliveredEstimates = frozen
    ? summary?.estimateCoverage?.delivered
    : summarizeSprintEstimates(
        activePoints.filter((row) => row.currentStatus === 'CONCLUIDO').map((row) => row.points)
      );
  const plannedPoints = frozen
    ? (summary?.plannedPoints ?? null)
    : planningKnown
      ? planningEstimates.value
      : null;
  const plannedTasks = frozen
    ? (summary?.plannedTasks ?? null)
    : planningKnown
      ? planned.length
      : null;
  const currentPoints = frozen ? (summary?.totalPoints ?? null) : currentEstimates.value;
  const deliveredPoints = frozen ? (summary?.completedPoints ?? null) : deliveredEstimates.value;
  const deliveredTasks = frozen ? (summary?.completedTasks ?? null) : progress.current.numerator;
  return {
    frozen,
    planningKnown,
    plannedPoints,
    plannedTasks,
    currentPoints,
    deliveredPoints,
    deliveredTasks,
    estimateCoverage: {
      planned: planningEstimates,
      current: currentEstimates,
      delivered: deliveredEstimates
    },
    carryOverKnown: !progress.historicalLimitations.includes('UNKNOWN_LEGACY_CARRY_OVER'),
    added: progress.scopeChange.added,
    removed: progress.scopeChange.removed,
    incoming,
    outgoing,
    effort: progress.effort,
    burndown: progress.burndown,
    historicalLimitations: [
      ...new Set([...progress.historicalLimitations, ...(summary?.historicalLimitations ?? [])])
    ]
  };
}

export function buildSprintVelocity(sprints, closingParticipations, limit, baselineEvents = []) {
  const bySprint = new Map();
  for (const row of closingParticipations) {
    const rows = bySprint.get(row.sprintId) ?? [];
    rows.push(row);
    bySprint.set(row.sprintId, rows);
  }
  const eventsBySprint = new Map();
  for (const event of baselineEvents) {
    if (!eventsBySprint.has(event.sprintId)) eventsBySprint.set(event.sprintId, []);
    eventsBySprint.get(event.sprintId).push(event);
  }
  const eligible = [];
  let excludedCount = 0;
  for (const sprint of sprints) {
    if (sprint.status !== 'CONCLUIDA') continue;
    const summary = buildSprintHistoricalSummary(
      sprint,
      bySprint.get(sprint.id) ?? [],
      eventsBySprint.get(sprint.id)
    );
    if (
      !(sprint.closedAt || sprint.completedAt) ||
      summary.completedTasks === null ||
      summary.estimateCoverage.current.unknownEstimateCount > 0 ||
      !Number.isFinite(summary.completedPoints)
    ) {
      excludedCount++;
      continue;
    }
    eligible.push({
      sprintId: sprint.id,
      sprintName: sprint.name,
      closedAt: summary.cutoff,
      completedPoints: summary.completedPoints
    });
  }
  eligible.sort((a, b) => a.closedAt.localeCompare(b.closedAt) || a.sprintId - b.sprintId);
  return {
    points: eligible.slice(-limit),
    eligibleCount: eligible.length,
    excludedCount,
    truncatedCount: Math.max(0, eligible.length - limit)
  };
}
