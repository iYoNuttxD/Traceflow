import { taskRepository } from '../task.repository.js';
import { buildTaskData, parseProjectId, parseTaskId } from '../task.schema.js';
import {
  ensureProjectExists,
  ensureTaskExists,
  formatTask,
  buildTaskHistoryChanges,
  resolveRequirementForTask,
  resolveResponsibleUser
} from '../task.service-support.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { calculateRequirementStatus } from '../../requirements/requirement.schema.js';

export const taskCrudService = {
  async createTask(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const taskData = buildTaskData(data, true);
    const requirementId = await resolveRequirementForTask(parsedProjectId, data?.requirementId);
    if (requirementId !== undefined) taskData.requirementId = requirementId;
    const responsibleUserId = await resolveResponsibleUser(
      parsedProjectId,
      data?.responsibleUserId
    );
    if (responsibleUserId !== undefined) taskData.responsibleUserId = responsibleUserId;
    const task = await taskRepository.createTaskAtomic(
      parsedProjectId,
      taskData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: parsedProjectId,
        requestId: context.requestId,
        action: 'TASK_CREATED',
        resourceType: 'Task'
      }),
      calculateRequirementStatus
    );
    return formatTask(task);
  },

  async findTasksByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return (
      await taskRepository.findTasksByProject(parsedProjectId, {
        search: query.search
      })
    ).map(formatTask);
  },

  async getTaskById(taskId) {
    return formatTask(await ensureTaskExists(parseTaskId(taskId)));
  },

  async updateTask(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const current = await ensureTaskExists(id);
    const taskData = buildTaskData(data);
    const requirementId = await resolveRequirementForTask(current.projectId, data?.requirementId);
    if (requirementId !== undefined) taskData.requirementId = requirementId;
    const responsibleUserId = await resolveResponsibleUser(
      current.projectId,
      data?.responsibleUserId
    );
    if (responsibleUserId !== undefined) taskData.responsibleUserId = responsibleUserId;
    if (Object.keys(taskData).length === 0) return formatTask(current);
    const historyEntries = buildTaskHistoryChanges(current, taskData).map((entry) => ({
      ...entry,
      actorUserId: context.actorUserId
    }));
    const task = await taskRepository.updateTaskAtomic(id, taskData, {
      historyEntries,
      previousRequirementId: current.requirementId,
      calculateRequirementStatus,
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'TASK_UPDATED',
        resourceType: 'Task',
        resourceId: id
      })
    });
    return formatTask(task);
  },

  async deleteTask(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    await taskRepository.deleteTask(id, {
      requirementId: task.requirementId,
      calculateRequirementStatus,
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: task.projectId,
        requestId: context.requestId,
        action: 'TASK_DELETED',
        resourceType: 'Task',
        resourceId: id
      })
    });
    return { id };
  }
};
