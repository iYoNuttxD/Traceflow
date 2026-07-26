import { TaskServiceError, parseRequirementId, parseTaskId } from '../task.schema.js';
import {
  ensureRequirementExists,
  ensureTaskExists,
  formatTask
} from '../task.service-support.js';
import { taskLinkRepository } from '../repositories/task-link.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { calculateRequirementStatus } from '../../requirements/requirement.schema.js';

export const taskRequirementService = {
  async linkRequirement(taskId, data, context = {}) {
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
    if (task.requirementId === requirementId) return formatTask(task);
    const updated = await taskLinkRepository.setRequirement(task, requirementId, buildAuditEvent({
      actorUserId: context.actorUserId,
      projectId: task.projectId,
      requestId: context.requestId,
      action: 'REQUIREMENT_TASK_LINKED',
      resourceType: 'Requirement',
      resourceId: requirementId,
      metadata: { taskId: id }
    }), calculateRequirementStatus);
    return formatTask(updated);
  },

  async unlinkRequirement(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    if (!task.requirementId) return formatTask(task);
    const updated = await taskLinkRepository.setRequirement(task, null, buildAuditEvent({
      actorUserId: context.actorUserId,
      projectId: task.projectId,
      requestId: context.requestId,
      action: 'REQUIREMENT_TASK_UNLINKED',
      resourceType: 'Requirement',
      resourceId: task.requirementId,
      metadata: { taskId: id }
    }), calculateRequirementStatus);
    return formatTask(updated);
  }
};
