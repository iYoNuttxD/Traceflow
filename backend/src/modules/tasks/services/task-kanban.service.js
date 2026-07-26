import { taskRepository } from '../task.repository.js';
import {
  TaskServiceError,
  kanbanStatuses,
  parseProjectId,
  parseTaskId,
  validateStatus
} from '../task.schema.js';
import {
  ensureProjectExists,
  ensureTaskExists,
  formatTask,
  formatMovement
} from '../task.service-support.js';
import { taskMovementRepository } from '../repositories/task-movement.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { calculateRequirementStatus } from '../../requirements/requirement.schema.js';

export const taskKanbanService = {
  async getKanbanBoard(projectId) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const tasks = (await taskRepository.findTasksByProject(id)).map(formatTask);
    const columns = kanbanStatuses.reduce((result, status) => {
      result[status] = tasks.filter((task) => task.status === status);
      return result;
    }, {});
    return {
      projectId: id,
      columns,
      totals: {
        A_FAZER: columns.A_FAZER.length,
        EM_ANDAMENTO: columns.EM_ANDAMENTO.length,
        CONCLUIDO: columns.CONCLUIDO.length,
        total: tasks.length
      }
    };
  },

  async moveTask(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    await ensureProjectExists(task.projectId);
    const payload = data && typeof data === 'object' ? data : {};
    validateStatus(payload.toStatus);
    const actor = context.actor;
    if (task.status === payload.toStatus) {
      throw new TaskServiceError('A tarefa já está nesta coluna.', 400);
    }
    const result = await taskMovementRepository.transitionStatus({
      task,
      toStatus: payload.toStatus,
      actor,
      calculateRequirementStatus,
      auditEvent: buildAuditEvent({
        actorUserId: actor.id,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_MOVED',
        resourceType: 'Task',
        resourceId: task.id
      })
    });
    if (result.conflict) {
      throw new TaskServiceError(
        'A tarefa foi alterada por outra operação. Atualize o quadro e tente novamente.',
        409
      );
    }
    return { task: formatTask(result.task), movement: formatMovement(result.movement) };
  },

  async updateTaskStatus(taskId, status, context = {}) {
    const result = await taskKanbanService.moveTask(taskId, { toStatus: status }, context);
    return result.task;
  }
};
