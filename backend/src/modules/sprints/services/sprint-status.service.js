import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  allMilestoneSprintsConcluded,
  ensureSingleActiveSprint,
  ensureTransitionAllowed,
  isTerminalSprintStatus,
  parseSprintId,
  sprintNotFoundError
} from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

const CONCLUIDO = 'CONCLUIDO';

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
        const backlog = terminal
          ? planBacklogReturn({ sprint: atual, tasks, actorUserId: context.actorUserId })
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
