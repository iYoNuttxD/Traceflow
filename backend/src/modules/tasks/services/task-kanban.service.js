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
  recalculateRelatedRequirements,
  resolveMovementResponsible
} from '../task.service-support.js';

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

  async moveTask(taskId, data) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    await ensureProjectExists(task.projectId);
    const payload = data && typeof data === 'object' ? data : {};
    validateStatus(payload.toStatus);
    const responsible = await resolveMovementResponsible(task, payload);
    if (task.status === payload.toStatus) {
      throw new TaskServiceError('A tarefa já está nesta coluna.', 400);
    }
    const result = await taskRepository.moveTask(task, {
      toStatus: payload.toStatus,
      ...responsible
    });
    await recalculateRelatedRequirements(task.requirementId);
    return { ...result, task: formatTask(result.task) };
  }
};
