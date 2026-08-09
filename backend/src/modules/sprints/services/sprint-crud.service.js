// Casos de uso de CRUD de sprint. Regras de negocio vivem aqui, nunca no controller.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { authorizationService } from '../../authorization/index.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';
import {
  SprintServiceError,
  buildSprintData,
  ensureAtLeastOneField,
  ensureDateRange,
  ensureSprintAcceptsTasks,
  ensureSprintEditable,
  isUniqueNameViolation,
  parseProjectId,
  parseSprintId,
  parseTaskId,
  sprintNameConflictError,
  sprintNotFoundError
} from '../sprint.schema.js';

export async function ensureProjectExists(projectId) {
  const project = await sprintRepository.findProjectById(projectId);
  if (!project) {
    throw new SprintServiceError('Projeto não encontrado.', 404, ERROR_CODES.PROJECT_NOT_FOUND);
  }
  return project;
}

export async function ensureSprintExists(sprintId) {
  const sprint = await sprintRepository.findById(sprintId);
  if (!sprint) throw sprintNotFoundError();
  return sprint;
}

export const sprintCrudService = {
  async createSprint(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const sprintData = buildSprintData(data, true);
    ensureDateRange(sprintData.startDate, sprintData.endDate);
    try {
      return await sprintRepository.create(
        parsedProjectId,
        sprintData,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: parsedProjectId,
          requestId: context.requestId,
          action: 'SPRINT_CREATED',
          resourceType: 'Sprint'
        })
      );
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  async findSprintsByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return sprintRepository.findByProject(parsedProjectId, {
      status: query.status,
      search: query.search
    });
  },

  async getSprintById(sprintId) {
    return ensureSprintExists(parseSprintId(sprintId));
  },

  async updateSprint(sprintId, data, context = {}) {
    const id = parseSprintId(sprintId);
    const current = await ensureSprintExists(id);
    ensureSprintEditable(current);
    const sprintData = ensureAtLeastOneField(
      buildSprintData(data),
      'Informe ao menos um campo para atualizar a sprint.'
    );
    ensureDateRange(
      sprintData.startDate ?? current.startDate,
      sprintData.endDate ?? current.endDate
    );
    try {
      return await sprintRepository.update(
        id,
        sprintData,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: current.projectId,
          requestId: context.requestId,
          action: 'SPRINT_UPDATED',
          resourceType: 'Sprint',
          resourceId: id,
          metadata: { sprintId: id }
        })
      );
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  async deleteSprint(sprintId, context = {}) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);
    const taskCount = await sprintRepository.countTasks(id);
    if (taskCount > 0) {
      throw new SprintServiceError(
        'Não é possível excluir uma sprint com tarefas associadas. Desassocie as tarefas primeiro.',
        409,
        ERROR_CODES.SPRINT_HAS_TASKS
      );
    }
    await sprintRepository.delete(
      id,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: sprint.projectId,
        requestId: context.requestId,
        action: 'SPRINT_DELETED',
        resourceType: 'Sprint',
        resourceId: id,
        metadata: { sprintId: id }
      })
    );
    return { id };
  },

  async findTasksBySprint(sprintId) {
    const id = parseSprintId(sprintId);
    await ensureSprintExists(id);
    return sprintRepository.findTasksBySprint(id);
  },

  // Substituicao atomica do conjunto de tarefas da sprint.
  // Espelha PUT /requirements/:id/tasks: falha em qualquer item nao persiste nada.
  async replaceTasks(sprintId, taskIds = [], context = {}) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    const requestedIds = [...new Set(taskIds.map((value) => parseTaskId(value)))];
    const tasks = requestedIds.length ? await sprintRepository.findTasksByIds(requestedIds) : [];

    if (tasks.length !== requestedIds.length) {
      throw new SprintServiceError('Tarefa não encontrada.', 404, ERROR_CODES.TASK_NOT_FOUND);
    }
    // Nunca confiar no projectId do frontend: comparar com o registro persistido.
    const foreign = tasks.find((task) => task.projectId !== sprint.projectId);
    if (foreign) {
      // Responder 400 para "existe em outro projeto" e 404 para "não existe" faria deste
      // endpoint um oráculo: iterando o ID, um membro mapearia tarefas de projetos a que
      // não tem acesso. O erro informativo fica só para quem já enxerga o outro projeto;
      // para os demais a resposta é idêntica à de um ID inexistente.
      if (!(await authorizationService.actorSeesProject(foreign.projectId, context.actorUserId))) {
        throw new SprintServiceError('Tarefa não encontrada.', 404, ERROR_CODES.TASK_NOT_FOUND);
      }
      throw new SprintServiceError(
        'A tarefa informada não pertence ao mesmo projeto da sprint.',
        400,
        ERROR_CODES.TASK_SPRINT_PROJECT_MISMATCH
      );
    }

    // Sprint de origem de cada tarefa pedida. Uma tarefa pode chegar vinda de
    // outra sprint: gravar null como origem apagaria a saida da sprint anterior,
    // que e justamente o que torna a troca identificavel no historico (RF10).
    const previousSprintByTask = new Map(tasks.map((task) => [task.id, task.sprintId ?? null]));

    const current = await sprintRepository.findTasksBySprint(id);
    const currentIds = current.map((task) => task.id);
    const toAttach = requestedIds.filter((taskId) => !currentIds.includes(taskId));
    const toDetach = currentIds.filter((taskId) => !requestedIds.includes(taskId));

    // A regra proibe ASSOCIAR tarefa a sprint terminal, nao desassociar.
    // Bloquear a remocao criaria um impasse: DELETE exige sprint sem tarefas,
    // e estados terminais nao transicionam de volta — a sprint ficaria presa.
    if (toAttach.length) ensureSprintAcceptsTasks(sprint);

    const historyEntries = [
      // Mesma convencao de task-sprint.service.js: a troca A -> B e uma unica
      // entrada, nao uma saida seguida de uma entrada.
      ...toAttach.map((taskId) => {
        const previousSprintId = previousSprintByTask.get(taskId) ?? null;
        return {
          projectId: sprint.projectId,
          taskId,
          actorUserId: context.actorUserId,
          field: 'SPRINT',
          fromValue: previousSprintId === null ? null : String(previousSprintId),
          toValue: String(id)
        };
      }),
      ...toDetach.map((taskId) => ({
        projectId: sprint.projectId,
        taskId,
        actorUserId: context.actorUserId,
        field: 'SPRINT',
        fromValue: String(id),
        toValue: null
      }))
    ];

    const updated = await sprintRepository.replaceTasks(id, {
      toAttach,
      toDetach,
      historyEntries,
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: sprint.projectId,
        requestId: context.requestId,
        action: 'SPRINT_TASKS_REPLACED',
        resourceType: 'Sprint',
        resourceId: id,
        metadata: { sprintId: id, count: historyEntries.length }
      })
    });

    return { sprintId: id, tasks: updated };
  }
};
