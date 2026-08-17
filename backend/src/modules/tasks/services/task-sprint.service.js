// Vinculo Tarefa <-> Sprint pelo lado da tarefa (RF10).
// Espelha task-requirement.service.js, que ja resolveu esse padrao para requisitos.
import { TaskServiceError, parseTaskId } from '../task.schema.js';
import { ensureTaskExists, formatTask } from '../task.service-support.js';
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
    // Idempotente: tarefa ja associada a esta sprint nao gera historico nem auditoria.
    if (task.sprintId === sprintId) return formatTask(task);

    // A escrita passa pelo mesmo plano de escopo usado por PUT /sprints/:id/tasks:
    // dois caminhos com regras proprias divergiriam no historico, e e justamente
    // o historico que sustenta o RF35. As validacoes de estado terminal, limite e
    // participacao anterior moram la, sob o lock da sprint.
    await sprintService.attachTaskToSprint(sprintId, id, context);
    return formatTask(await ensureTaskExists(id));
  },

  async unlinkSprint(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    // Idempotente: tarefa ja sem sprint nao gera historico nem auditoria.
    if (!task.sprintId) return formatTask(task);

    await sprintService.detachTaskFromSprint(task.sprintId, id, context);
    return formatTask(await ensureTaskExists(id));
  }
};
