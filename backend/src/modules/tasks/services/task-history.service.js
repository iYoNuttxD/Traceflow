import { taskHistoryRepository } from '../repositories/task-history.repository.js';
import { buildMovedAtFilter, buildPagination, parseProjectId } from '../task.schema.js';
import { ensureProjectExists } from '../task.service-support.js';

export const taskHistoryService = {
  async listTaskHistory(projectId, query = {}) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const pagination = buildPagination(query);
    const [total, entries] = await taskHistoryRepository.listPage(id, {
      taskId: query.taskId,
      actorUserId: query.actorUserId,
      field: query.field,
      occurredAt: buildMovedAtFilter(query.startDate, query.endDate)
    }, pagination);
    return {
      projectId: id,
      total,
      items: entries.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        taskTitle: entry.task.title,
        actorUserId: entry.actorUserId,
        actor: entry.actorUser,
        field: entry.field,
        fromValue: entry.fromValue,
        toValue: entry.toValue,
        occurredAt: entry.occurredAt
      })),
      pagination: { page: pagination.page, limit: pagination.limit, total, totalPages: Math.ceil(total / pagination.limit) }
    };
  }
};
