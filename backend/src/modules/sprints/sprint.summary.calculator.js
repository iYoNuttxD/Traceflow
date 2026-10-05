import { toIsoString } from './sprint.calculator.js';
import {
  closingSprintEstimate,
  planningSprintEstimates,
  summarizeSprintEstimates
} from './sprint.estimate.calculator.js';

// Terminal display projection: no Task fields are accepted as historical authority.
export function buildSprintHistoricalSummary(sprint, participations = [], events = []) {
  if (!['CONCLUIDA', 'CANCELADA'].includes(sprint.status)) return null;
  const closing = participations.filter((item) => item.removedAt === null);
  const planned = participations.filter((item) => item.plannedAtStart === true);
  const historicalLimitations = [];
  const planningKnown = Boolean(sprint.planningSnapshotAt);
  const currentEstimates = summarizeSprintEstimates(closing.map(closingSprintEstimate));
  const plannedEstimates = planningSprintEstimates(sprint, participations, events);
  const pointsKnown = currentEstimates.unknownEstimateCount === 0;
  const statusKnown = closing.every((item) => item.exitStatus != null);
  if (sprint.startedAt && !planningKnown)
    historicalLimitations.push('LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE');
  if (!pointsKnown) {
    historicalLimitations.push('TASK_ESTIMATE_MISSING');
    if (
      closing.some(
        (item) =>
          (closingSprintEstimate(item) === null && item.closingTaskSnapshot?.version < 3) ||
          (closingSprintEstimate(item) === null && !item.closingTaskSnapshot)
      )
    )
      historicalLimitations.push('LEGACY_CLOSING_POINTS_UNAVAILABLE');
  }
  if (planningKnown && plannedEstimates.unknownEstimateCount)
    historicalLimitations.push('TASK_ESTIMATE_MISSING');
  if (planningKnown && plannedEstimates.legacyUnknown)
    historicalLimitations.push('LEGACY_PLANNING_ESTIMATE_UNKNOWN');
  if (!statusKnown) historicalLimitations.push('LEGACY_CLOSING_STATUS_UNAVAILABLE');
  if (!sprint.closedAt && !sprint.completedAt)
    historicalLimitations.push('LEGACY_CLOSING_CUTOFF_UNAVAILABLE');
  const completed = closing.filter((item) => item.exitStatus === 'CONCLUIDO');
  const deliveredEstimates = summarizeSprintEstimates(completed.map(closingSprintEstimate));
  const totalPoints = currentEstimates.value;
  const completedPoints = statusKnown ? deliveredEstimates.value : null;
  return {
    totalTasks: closing.length,
    completedTasks: statusKnown ? completed.length : null,
    totalPoints,
    completedPoints,
    percentage:
      pointsKnown && statusKnown && totalPoints > 0 && completedPoints !== null
        ? Math.round((completedPoints / totalPoints) * 100)
        : null,
    plannedTasks: planningKnown ? planned.length : null,
    plannedPoints: planningKnown ? plannedEstimates.value : null,
    estimateCoverage: {
      planned: plannedEstimates,
      current: currentEstimates,
      delivered: deliveredEstimates
    },
    cutoff: toIsoString(sprint.closedAt ?? sprint.completedAt ?? sprint.updatedAt),
    historicalLimitations: [...new Set(historicalLimitations)]
  };
}
