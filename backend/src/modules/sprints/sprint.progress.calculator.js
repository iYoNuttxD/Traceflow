import { buildMetric } from '../traceability/index.js';

const CONCLUIDO = 'CONCLUIDO';
const TERMINAL = ['CONCLUIDA', 'CANCELADA'];

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveBaseline(sprint) {
  const at = toIso(sprint?.startedAt);
  return at ? { kind: 'STARTED_AT', at } : { kind: 'OPEN', at: null };
}

export function effectiveStatus(participation) {
  return participation.exitStatus ?? participation.currentStatus;
}

function metric(participations) {
  const concluidas = participations.filter(
    (participation) => effectiveStatus(participation) === CONCLUIDO
  ).length;
  return buildMetric(concluidas, participations.length);
}

const porTarefa = (a, b) => (a.taskId ?? 0) - (b.taskId ?? 0);

export function buildSprintProgress({ sprint, participations = [], cutoff }) {
  const frozen = TERMINAL.includes(sprint.status);
  const baseline = resolveBaseline(sprint);

  const isPlanned = (participation) => {
    if (participation.plannedAtStart != null) return participation.plannedAtStart;
    // Legacy approximation only; API reports the missing immutable baseline.
    return (
      !participation.addedAfterStart &&
      (!participation.removedAt || new Date(participation.removedAt) > new Date(sprint.startedAt))
    );
  };
  const current = participations.filter((participation) => participation.removedAt === null);
  const planned = baseline.kind === 'OPEN' ? current : participations.filter(isPlanned);

  const scopeChange =
    baseline.kind === 'OPEN'
      ? { added: [], removed: [] }
      : {
          added: participations
            .filter(
              (participation) => !isPlanned(participation) && participation.removedAt === null
            )
            .map((participation) => ({
              taskId: participation.taskId,
              at: toIso(participation.addedAt),
              fromSprintId: participation.carriedFromSprintId ?? null
            }))
            .sort(porTarefa),
          removed: participations
            .filter((participation) => isPlanned(participation) && participation.removedAt !== null)
            .map((participation) => ({
              taskId: participation.taskId,
              at: toIso(participation.removedAt),
              toSprintId: participation.movedToSprintId ?? null,
              reason: participation.removalReason ?? null,
              exitStatus: participation.exitStatus ?? null
            }))
            .sort(porTarefa)
        };

  const carryOver = participations
    .filter((participation) => participation.movedToSprintId)
    .map((participation) => ({
      taskId: participation.taskId,
      toSprintId: participation.movedToSprintId,
      exitStatus: participation.exitStatus ?? null,
      at: toIso(participation.removedAt)
    }))
    .sort(porTarefa);

  return {
    sprintId: sprint.id,
    projectId: sprint.projectId,
    status: sprint.status,
    frozen,
    cutoff: frozen
      ? (toIso(sprint.closedAt) ??
        toIso(sprint.completedAt) ??
        toIso(sprint.updatedAt) ??
        toIso(cutoff))
      : toIso(cutoff),
    baseline,
    planned: metric(planned),
    current: metric(current),
    scopeChange,
    carryOver
  };
}
