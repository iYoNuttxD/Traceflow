import { taskRepository } from '../task.repository.js';
import {
  buildCreatedAtFilter,
  calculateCoveragePercentage,
  parseProjectId
} from '../task.schema.js';
import { ensureProjectExists } from '../task.service-support.js';

async function getCoverage(projectId, countLinkedTasks) {
  const id = parseProjectId(projectId);
  await ensureProjectExists(id);
  const [totalTasks, linkedTasks] = await Promise.all([
    taskRepository.countTasksByProject(id),
    countLinkedTasks(id)
  ]);
  return {
    projectId: id,
    totalTasks,
    linkedTasks,
    coveragePercentage: calculateCoveragePercentage(linkedTasks, totalTasks)
  };
}

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
  },
  getPullRequestCoverage(projectId) {
    return getCoverage(projectId, (id) =>
      taskRepository.countTasksWithPullRequestByProject(id)
    );
  },
  getCommitCoverage(projectId) {
    return getCoverage(projectId, (id) => taskRepository.countTasksWithCommitByProject(id));
  },
  getIssueCoverage(projectId) {
    return getCoverage(projectId, (id) => taskRepository.countTasksWithIssueByProject(id));
  }
};
