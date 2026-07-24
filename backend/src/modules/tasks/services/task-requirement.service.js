import { taskRepository } from '../task.repository.js';
import { TaskServiceError, parseRequirementId, parseTaskId } from '../task.schema.js';
import {
  ensureRequirementExists,
  ensureTaskExists,
  formatTask,
  recalculateRelatedRequirements
} from '../task.service-support.js';

export const taskRequirementService = {
  async linkRequirement(taskId, data) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const requirementId = parseRequirementId(
      data && typeof data === 'object' ? data.requirementId : undefined
    );
    const requirement = await ensureRequirementExists(requirementId);
    if (requirement.projectId !== task.projectId) {
      throw new TaskServiceError(
        'O requisito informado não pertence ao mesmo projeto da tarefa.',
        400
      );
    }
    const updated = await taskRepository.updateTaskRequirement(id, requirementId);
    await recalculateRelatedRequirements(task.requirementId, requirementId);
    return formatTask(updated);
  },

  async unlinkRequirement(taskId) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    if (!task.requirementId) return formatTask(task);
    const updated = await taskRepository.updateTaskRequirement(id, null);
    await recalculateRelatedRequirements(task.requirementId);
    return formatTask(updated);
  }
};
