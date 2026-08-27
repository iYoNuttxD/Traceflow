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

    const sprint = await sprintService.getSprintById(sprintId);
    if (sprint.projectId !== task.projectId) {
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
    if (task.sprintId === sprintId) return formatTask(task);

    await sprintService.attachTaskToSprint(sprintId, id, context);
    return formatTask(await ensureTaskExists(id));
  },

  async unlinkSprint(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    if (!task.sprintId) return formatTask(task);

    await sprintService.detachTaskFromSprint(task.sprintId, id, context);
    return formatTask(await ensureTaskExists(id));
  }
};
