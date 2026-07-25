import { taskRepository } from '../task.repository.js';
import { buildTaskData, parseProjectId, parseTaskId, validateStatus } from '../task.schema.js';
import {
  ensureProjectExists,
  ensureTaskExists,
  formatTask,
  recalculateRelatedRequirements,
  resolveRequirementForTask,
  resolveResponsibleUser
} from '../task.service-support.js';

export const taskCrudService = {
  async createTask(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const taskData = buildTaskData(data, true);
    const requirementId = await resolveRequirementForTask(parsedProjectId, data?.requirementId);
    if (requirementId !== undefined) taskData.requirementId = requirementId;
    const responsibleUserId = await resolveResponsibleUser(parsedProjectId, data?.responsibleUserId);
    if (responsibleUserId !== undefined) taskData.responsibleUserId = responsibleUserId;
    const task = await taskRepository.createTask(parsedProjectId, taskData);
    await recalculateRelatedRequirements(task.requirementId);
    return formatTask(task);
  },

  async findTasksByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return (await taskRepository.findTasksByProject(parsedProjectId, {
      search: query.search
    })).map(formatTask);
  },

  async getTaskById(taskId) {
    return formatTask(await ensureTaskExists(parseTaskId(taskId)));
  },

  async updateTask(taskId, data) {
    const id = parseTaskId(taskId);
    const current = await ensureTaskExists(id);
    const taskData = buildTaskData(data);
    const requirementId = await resolveRequirementForTask(current.projectId, data?.requirementId);
    if (requirementId !== undefined) taskData.requirementId = requirementId;
    const responsibleUserId = await resolveResponsibleUser(current.projectId, data?.responsibleUserId);
    if (responsibleUserId !== undefined) taskData.responsibleUserId = responsibleUserId;
    if (Object.keys(taskData).length === 0) return formatTask(current);
    const task = await taskRepository.updateTask(id, taskData);
    await recalculateRelatedRequirements(current.requirementId, task.requirementId);
    return formatTask(task);
  },

  async updateTaskStatus(taskId, status) {
    const id = parseTaskId(taskId);
    const current = await ensureTaskExists(id);
    validateStatus(status);
    const task = await taskRepository.updateTaskStatus(id, status);
    await recalculateRelatedRequirements(current.requirementId);
    return formatTask(task);
  },

  async deleteTask(taskId) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    await taskRepository.deleteTask(id);
    await recalculateRelatedRequirements(task.requirementId);
    return { id };
  }
};
