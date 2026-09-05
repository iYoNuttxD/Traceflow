import { toIsoString } from './sprint.calculator.js';

// Terminal display projection: no Task fields are accepted as historical authority.
export function buildSprintHistoricalSummary(sprint, participations = []) {
  if (!['CONCLUIDA', 'CANCELADA'].includes(sprint.status)) return null;
  const closing = participations.filter((item) => item.removedAt === null);
  const planned = participations.filter((item) => item.plannedAtStart === true);
  const historicalLimitations = [];
  const planningKnown = Boolean(sprint.planningSnapshotAt);
  const pointsKnown = closing.every((item) => item.pointsAtClose != null);
  const statusKnown = closing.every((item) => item.exitStatus != null);
  if (sprint.startedAt && !planningKnown)
    historicalLimitations.push('LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE');
  if (!pointsKnown) historicalLimitations.push('LEGACY_CLOSING_POINTS_UNAVAILABLE');
  if (!statusKnown) historicalLimitations.push('LEGACY_CLOSING_STATUS_UNAVAILABLE');
  if (!sprint.closedAt && !sprint.completedAt)
    historicalLimitations.push('LEGACY_CLOSING_CUTOFF_UNAVAILABLE');
  const completed = closing.filter((item) => item.exitStatus === 'CONCLUIDO');
  const totalPoints = pointsKnown
    ? closing.reduce((total, item) => total + item.pointsAtClose, 0)
    : null;
  const completedPoints =
    pointsKnown && statusKnown
      ? completed.reduce((total, item) => total + item.pointsAtClose, 0)
      : null;
  return {
    totalTasks: closing.length,
    completedTasks: statusKnown ? completed.length : null,
    totalPoints,
    completedPoints,
    percentage:
      totalPoints > 0 && completedPoints !== null
        ? Math.round((completedPoints / totalPoints) * 100)
        : null,
    plannedTasks: planningKnown ? planned.length : null,
    plannedPoints:
      planningKnown && planned.every((item) => item.pointsAtPlanning != null)
        ? planned.reduce((total, item) => total + item.pointsAtPlanning, 0)
        : null,
    cutoff: toIsoString(sprint.closedAt ?? sprint.completedAt ?? sprint.updatedAt),
    historicalLimitations
  };
}
