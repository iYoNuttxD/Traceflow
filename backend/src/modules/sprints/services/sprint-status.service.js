// Maquina de estados da sprint (RF10).
// PLANEJADA -> EM_ANDAMENTO | CANCELADA
// EM_ANDAMENTO -> CONCLUIDA | CANCELADA
// Estados terminais nao transicionam.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  ensureTransitionAllowed,
  isTerminalSprintStatus,
  parseSprintId
} from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintStatusService = {
  async updateSprintStatus(sprintId, status, context = {}) {
    const id = parseSprintId(sprintId);
    const current = await ensureSprintExists(id);
    const nextStatus = ensureTransitionAllowed(current.status, status);

    // Um unico instante para a transicao e para o congelamento: dois `new Date()`
    // dariam a uma sprint um encerramento anterior ao fechamento das suas
    // proprias participacoes.
    const occurredAt = new Date();
    // `startedAt` e a linha de base do planejamento (RF35), NAO uma trava: o
    // escopo continua alteravel depois do inicio, apenas sinalizado como
    // inclusao posterior. Quem congela e o estado terminal.
    const data = { status: nextStatus };
    if (nextStatus === 'EM_ANDAMENTO') data.startedAt = occurredAt;
    if (nextStatus === 'CONCLUIDA') data.completedAt = occurredAt;

    return sprintRepository.updateStatus(
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
      }),
      // Entrar em estado terminal congela a composicao: cada participacao ainda
      // ativa guarda o status que a tarefa tinha AQUI. Sem isso, conclui-la
      // depois — ou leva-la para a sprint seguinte — reescreveria o resultado de
      // um periodo ja encerrado (ADR-010 D04).
      { freezeAt: isTerminalSprintStatus(nextStatus) ? occurredAt : null }
    );
  }
};
