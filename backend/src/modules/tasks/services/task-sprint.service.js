// Vinculo Tarefa <-> Sprint pelo lado da tarefa (RF10).
// Espelha task-requirement.service.js, que ja resolveu esse padrao para requisitos.
import { TaskServiceError, parseTaskId } from '../task.schema.js';
import { ensureTaskExists, formatTask } from '../task.service-support.js';
import { taskLinkRepository } from '../repositories/task-link.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { sprintService } from '../../sprints/index.js';
import { authorizationService } from '../../authorization/index.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';

function parseSprintId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskServiceError('ID da sprint inválido.', 400);
  }
  return parsed;
}

export const taskSprintService = {
  async linkSprint(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const sprintId = parseSprintId(data && typeof data === 'object' ? data.sprintId : undefined);

    // Atravessa a fronteira do modulo sprints pelo index.js; getSprintById ja
    // lanca SPRINT_NOT_FOUND quando a sprint nao existe.
    const sprint = await sprintService.getSprintById(sprintId);
    // Nunca confiar em IDs do frontend: comparar projectId dos dois registros persistidos.
    // exposeTechnicalDetails: o contrato do RF10 promete codigos estaveis para
    // estes dois casos, e AppError.toPublic() so emite `code` quando habilitado.
    if (sprint.projectId !== task.projectId) {
      // Sem esta guarda o par 400/404 vira oráculo: iterando o sprintId, um membro de um
      // único projeto descobriria quais sprints existem em projetos alheios. Quem não
      // enxerga o projeto da sprint recebe exatamente a resposta de uma sprint
      // inexistente — mesma mensagem, mesmo código, mesmo status que getSprintById.
      if (!(await authorizationService.actorSeesProject(sprint.projectId, context.actorUserId))) {
        throw new TaskServiceError('Sprint não encontrada.', 404, ERROR_CODES.SPRINT_NOT_FOUND, {
          exposeTechnicalDetails: true
        });
      }
      throw new TaskServiceError(
        'A sprint informada não pertence ao mesmo projeto da tarefa.',
        400,
        ERROR_CODES.TASK_SPRINT_PROJECT_MISMATCH,
        { exposeTechnicalDetails: true }
      );
    }
    if (['CONCLUIDA', 'CANCELADA'].includes(sprint.status)) {
      throw new TaskServiceError(
        'Sprint concluída ou cancelada não aceita associação de tarefas.',
        409,
        ERROR_CODES.SPRINT_ASSOCIATION_BLOCKED,
        { exposeTechnicalDetails: true }
      );
    }
    // Idempotente: tarefa ja associada a esta sprint nao gera historico nem auditoria.
    if (task.sprintId === sprintId) return formatTask(task);

    const updated = await taskLinkRepository.setSprint(task, sprintId, {
      historyEntry: {
        projectId: task.projectId,
        taskId: id,
        actorUserId: context.actorUserId,
        field: 'SPRINT',
        fromValue: task.sprintId === null ? null : String(task.sprintId),
        toValue: String(sprintId)
      },
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_SPRINT_LINKED',
        resourceType: 'Sprint',
        resourceId: sprintId,
        metadata: { taskId: id, sprintId }
      })
    });
    return formatTask(updated);
  },

  async unlinkSprint(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    // Idempotente: tarefa ja sem sprint nao gera historico nem auditoria.
    if (!task.sprintId) return formatTask(task);

    const previousSprintId = task.sprintId;
    const updated = await taskLinkRepository.setSprint(task, null, {
      historyEntry: {
        projectId: task.projectId,
        taskId: id,
        actorUserId: context.actorUserId,
        field: 'SPRINT',
        fromValue: String(previousSprintId),
        toValue: null
      },
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_SPRINT_UNLINKED',
        resourceType: 'Sprint',
        resourceId: previousSprintId,
        metadata: { taskId: id, sprintId: previousSprintId }
      })
    });
    return formatTask(updated);
  }
};
