import { buildSprintHistoricalSummary } from './sprint.summary.calculator.js';
import { isTerminalSprintStatus } from './sprint.schema.js';

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);

// Adapter facts for Indicators; the established Progress, Effort and Burndown
// calculators remain the only owners of those calculations.
export function buildSprintAnalyticsFacts({ sprint, participations, burndownData, progress }) {
  const frozen = isTerminalSprintStatus(sprint.status);
  const planningKnown = Boolean(sprint.startedAt && sprint.planningSnapshotAt);
  const planned = participations.filter((row) => row.plannedAtStart === true);
  const activePoints = burndownData.filter((row) => row.removedAt === null);
  const summary = progress.historicalSummary;
  const incoming = participations
    .filter((row) => row.removedAt === null && row.carriedFromSprintId != null)
    .map((row) => ({
      taskId: row.taskId,
      title: row.taskTitleSnapshot,
      fromSprintId: row.carriedFromSprintId
    }))
    .sort((a, b) => (a.taskId ?? 0) - (b.taskId ?? 0));
  const outgoing = progress.carryOver.map((row) => ({ ...row }));
  const plannedPoints = frozen
    ? (summary?.plannedPoints ?? null)
    : planningKnown && planned.every((row) => row.pointsAtPlanning != null)
      ? sum(planned, 'pointsAtPlanning')
      : null;
  const plannedTasks = frozen
    ? (summary?.plannedTasks ?? null)
    : planningKnown
      ? planned.length
      : null;
  const currentPoints = frozen ? (summary?.totalPoints ?? null) : sum(activePoints, 'points');
  const deliveredPoints = frozen
    ? (summary?.completedPoints ?? null)
    : sum(
        activePoints.filter((row) => row.currentStatus === 'CONCLUIDO'),
        'points'
      );
  const deliveredTasks = frozen ? (summary?.completedTasks ?? null) : progress.current.numerator;
  return {
    frozen,
    planningKnown,
    plannedPoints,
    plannedTasks,
    currentPoints,
    deliveredPoints,
    deliveredTasks,
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

export function buildSprintVelocity(sprints, closingParticipations, limit) {
  const bySprint = new Map();
  for (const row of closingParticipations) {
    const rows = bySprint.get(row.sprintId) ?? [];
    rows.push(row);
    bySprint.set(row.sprintId, rows);
  }
  const eligible = [];
  let excludedCount = 0;
  for (const sprint of sprints) {
    if (sprint.status !== 'CONCLUIDA') continue;
    const summary = buildSprintHistoricalSummary(sprint, bySprint.get(sprint.id) ?? []);
    if (summary.historicalLimitations.length || summary.completedPoints === null) {
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
