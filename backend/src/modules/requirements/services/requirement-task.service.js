import { buildAuditEvent } from '../../audit/audit.service.js';
import { requirementRepository } from '../requirement.repository.js';
import { RequirementServiceError, parseRequirementId } from '../requirement.schema.js';
import { ensureRequirementExists } from './requirement-crud.service.js';

export const requirementTaskService = {
  async replaceTasks(requirementId, taskIds, context = {}) {
    const id = parseRequirementId(requirementId);
    const requirement = await ensureRequirementExists(id);
    const uniqueTaskIds = [...new Set(taskIds.map(Number))];
    const tasks = uniqueTaskIds.length
      ? await requirementRepository.findTasksByIds(uniqueTaskIds)
      : [];
    if (tasks.length !== uniqueTaskIds.length) {
      throw new RequirementServiceError('Uma ou mais tarefas não foram encontradas.', 404);
    }
    if (tasks.some((task) => task.projectId !== requirement.projectId)) {
      throw new RequirementServiceError(
        'Todas as tarefas devem pertencer ao mesmo projeto do requisito.',
        400
      );
    }

    const previousIds = new Set((requirement.tasks || []).map((task) => task.id));
    const nextIds = new Set(uniqueTaskIds);
    const linkedIds = uniqueTaskIds.filter((taskId) => !previousIds.has(taskId));
    const unlinkedIds = [...previousIds].filter((taskId) => !nextIds.has(taskId));
    const reassignedTasks = tasks
      .filter((task) => task.requirementId && task.requirementId !== id)
      .map((task) => ({ taskId: task.id, previousRequirementId: task.requirementId }));
    const previousRequirementIds = [
      ...new Set(reassignedTasks.map((task) => task.previousRequirementId))
    ];
    const auditEvents = [
      ...linkedIds.map((taskId) =>
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: requirement.projectId,
          requestId: context.requestId,
          action: 'REQUIREMENT_TASK_LINKED',
          resourceType: 'Task',
          resourceId: taskId
        })
      ),
      ...unlinkedIds.map((taskId) =>
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: requirement.projectId,
          requestId: context.requestId,
          action: 'REQUIREMENT_TASK_UNLINKED',
          resourceType: 'Task',
          resourceId: taskId
        })
      )
    ];
    const updatedRequirement = await requirementRepository.replaceRequirementTasks({
      requirementId: id,
      taskIds: uniqueTaskIds,
      previousRequirementIds,
      auditEvents
    });

    return {
      requirement: updatedRequirement,
      reassignedTasks,
      changes: { linked: linkedIds.length, unlinked: unlinkedIds.length }
    };
  }
};
