import { buildMovementFilters, buildPagination, parseProjectId } from '../task.schema.js';
import { ensureProjectExists, formatMovement } from '../task.service-support.js';
import { taskMovementRepository } from '../repositories/task-movement.repository.js';

export const taskMovementService = {
  async listMovements(projectId, query = {}) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const pagination = buildPagination(query);
    const [total, movements] = await taskMovementRepository.listPage(
      id,
      buildMovementFilters(query),
      pagination
    );
    return {
      projectId: id,
      total,
      movements: movements.map(formatMovement),
      pagination: { page: pagination.page, limit: pagination.limit, total, totalPages: Math.ceil(total / pagination.limit) }
    };
  },

  async getKanbanMetrics(projectId, query = {}) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const totalMovements = await taskMovementRepository.count(
      id,
      buildMovementFilters(query)
    );
    return {
      projectId: id,
      indicator: 'Fluxo de trabalho das tarefas',
      metric: 'Número de movimentações entre colunas',
      ...(query.startDate !== undefined ? { startDate: query.startDate } : {}),
      ...(query.endDate !== undefined ? { endDate: query.endDate } : {}),
      totalMovements
    };
  }
};
