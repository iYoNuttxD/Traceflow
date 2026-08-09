// Maquina de estados da sprint (RF10).
// PLANEJADA -> EM_ANDAMENTO | CANCELADA
// EM_ANDAMENTO -> CONCLUIDA | CANCELADA
// Estados terminais nao transicionam.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { ensureTransitionAllowed, parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintStatusService = {
  async updateSprintStatus(sprintId, status, context = {}) {
    const id = parseSprintId(sprintId);
    const current = await ensureSprintExists(id);
    const nextStatus = ensureTransitionAllowed(current.status, status);

    // startedAt e completedAt sao a linha de base do planejamento que o RF35
    // consumira. Aqui apenas persistimos; nenhum calculo deriva deles nesta entrega.
    const data = { status: nextStatus };
    if (nextStatus === 'EM_ANDAMENTO') data.startedAt = new Date();
    if (nextStatus === 'CONCLUIDA') data.completedAt = new Date();

    return sprintRepository.update(
      id,
      data,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'SPRINT_STATUS_CHANGED',
        resourceType: 'Sprint',
        resourceId: id,
        metadata: { sprintId: id }
      })
    );
  }
};
