import { taskRepository } from '../task.repository.js';
import {
  buildCreatedAtFilter,
  parseProjectId
} from '../task.schema.js';
import { ensureProjectExists } from '../task.service-support.js';

export const taskMetricsService = {
  async getTaskMetrics(projectId, startDate, endDate) {
    const id = parseProjectId(projectId);
    await ensureProjectExists(id);
    const totalTasksCreated = await taskRepository.countTasksByProject(
      id,
      buildCreatedAtFilter(startDate, endDate)
    );
    return {
      projectId: id,
      indicator: 'Volume de planejamento',
      metric: 'Quantidade de tarefas cadastradas',
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      totalTasksCreated
    };
  }
};
