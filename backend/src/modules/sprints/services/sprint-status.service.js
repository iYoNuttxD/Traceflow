import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  allMilestoneSprintsConcluded,
  ensureSingleActiveSprint,
  ensureTransitionAllowed,
  isTerminalSprintStatus,
  sprintsOverlap,
  parseSprintId,
  sprintNotFoundError
} from '../sprint.schema.js';
import { buildScopePlan, ensureSprintExists } from './sprint-crud.service.js';

const CONCLUIDO = 'CONCLUIDO';

export function nextPlannedSprint(sprint, sprints) {
  return (
    sprints
      .filter(
        (candidate) =>
          !candidate.deletedAt &&
          candidate.id !== sprint.id &&
          candidate.projectId === sprint.projectId &&
          candidate.status === 'PLANEJADA' &&
          candidate.startDate >= sprint.endDate &&
          candidate.startDate < candidate.endDate &&
          !sprintsOverlap(sprint, candidate)
      )
      .sort((a, b) => a.startDate - b.startDate || a.id - b.id)[0] ?? null
  );
}

function planBacklogReturn({ sprint, tasks, actorUserId }) {
  const pendentes = tasks.filter(
    (task) => task.sprintId === sprint.id && task.status !== CONCLUIDO
  );
  return {
    taskIds: pendentes.map((task) => task.id),
    historyEntries: pendentes.map((task) => ({
      projectId: sprint.projectId,
      taskId: task.id,
      actorUserId,
      field: 'SPRINT',
      fromValue: String(sprint.id),
      toValue: null
    }))
  };
}

export const sprintStatusService = {
  async getSprintImpact(sprintId) {
    const snapshot = await sprintRepository.readImpactSnapshot(parseSprintId(sprintId));
    if (!snapshot) throw sprintNotFoundError();
    const { sprint, sprints, tasks } = snapshot;
    const destination = nextPlannedSprint(sprint, sprints);
    const pendingTasks = tasks.filter((task) => task.status !== CONCLUIDO).length;
    return {
      sprintId: sprint.id,
      status: sprint.status,
      currentTasks: tasks.length,
      completion: {
        pendingTasks,
        completedTasks: tasks.length - pendingTasks,
        destination: destination ? { id: destination.id, name: destination.name } : null,
        returnedToBacklog: destination ? 0 : pendingTasks
      }
    };
  },

  async updateSprintStatus(sprintId, status, context = {}) {
    const id = parseSprintId(sprintId);
    const current = await ensureSprintExists(id);

    const resultado = await sprintRepository.transitionWithinSprintLock(
      id,
      current.projectId,
      ({ sprint: atual, sprints, tasks, milestoneSprints }) => {
        const nextStatus = ensureTransitionAllowed(atual.status, status);

        if (nextStatus === 'EM_ANDAMENTO') ensureSingleActiveSprint(sprints, id);

        const occurredAt = new Date();
        const data = { status: nextStatus };
        if (nextStatus === 'EM_ANDAMENTO') data.startedAt = occurredAt;
        if (nextStatus === 'CONCLUIDA') data.completedAt = occurredAt;

        const terminal = isTerminalSprintStatus(nextStatus);
        const destination = nextStatus === 'CONCLUIDA' ? nextPlannedSprint(atual, sprints) : null;
        const backlog =
          terminal && !destination
            ? planBacklogReturn({ sprint: atual, tasks, actorUserId: context.actorUserId })
            : null;
        const pendingIds = tasks
          .filter((task) => task.sprintId === id && task.status !== CONCLUIDO)
          .map((task) => task.id);
        const carryOver = destination
          ? {
              destination,
              buildPlan: (snapshot) =>
                buildScopePlan({
                  mode: 'attach',
                  audit: null,
                  sprintId: destination.id,
                  requestedIds: pendingIds,
                  occurredAt,
                  context,
                  ...snapshot
                })
            }
          : null;

        const irmas = milestoneSprints.map((sprint) =>
          sprint.id === id ? { ...sprint, status: nextStatus } : sprint
        );
        const milestone =
          nextStatus === 'CONCLUIDA' && atual.milestoneId && allMilestoneSprintsConcluded(irmas)
            ? { id: atual.milestoneId, status: 'CONCLUIDO' }
            : null;

        return {
          data,
          freezeAt: terminal ? occurredAt : null,
          backlog,
          carryOver,
          milestone,
          auditEvent: buildAuditEvent({
            actorUserId: context.actorUserId,
            projectId: atual.projectId,
            requestId: context.requestId,
            action: 'SPRINT_STATUS_CHANGED',
            resourceType: 'Sprint',
            resourceId: id,
            metadata: { sprintId: id }
          })
        };
      }
    );

    if (resultado === null) throw sprintNotFoundError();
    return resultado;
  }
};
