import { taskRepository } from '../task.repository.js';
import { buildMovementFilters, parseProjectId } from '../task.schema.js';
import { ensureProjectExists, formatMovement } from '../task.service-support.js';

export const taskMovementService = {
  async listMovements(projectId, query = {}) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const movements = await taskRepository.findMovementsByProject(
      id,
      buildMovementFilters(query)
    );
    return { projectId: id, total: movements.length, movements: movements.map(formatMovement) };
  },

  async getKanbanMetrics(projectId, query = {}) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const totalMovements = await taskRepository.countMovementsByProject(
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
