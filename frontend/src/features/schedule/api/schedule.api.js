import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

export const scheduleApi = {
  // Sprints
  listSprints(projectId, params = {}, options = {}) {
    return httpClient.get(`/projects/${projectId}/sprints`, {
      ...options,
      params: compactParams(params)
    });
  },
  createSprint(projectId, data) {
    return httpClient.post(`/projects/${projectId}/sprints`, data);
  },
  getSprint(sprintId, options = {}) {
    return httpClient.get(`/sprints/${sprintId}`, options);
  },
  updateSprint(sprintId, data) {
    return httpClient.put(`/sprints/${sprintId}`, data);
  },
  updateSprintStatus(sprintId, status) {
    return httpClient.patch(`/sprints/${sprintId}/status`, { status });
  },
  // Sprint nao e excluida: o endpoint responde 405 e a tela nao oferece a acao.
  listSprintTasks(sprintId, options = {}) {
    return httpClient.get(`/sprints/${sprintId}/tasks`, options);
  },
  replaceSprintTasks(sprintId, taskIds) {
    return httpClient.put(`/sprints/${sprintId}/tasks`, { taskIds });
  },

  // Marcos
  listMilestones(projectId, params = {}, options = {}) {
    return httpClient.get(`/projects/${projectId}/milestones`, {
      ...options,
      params: compactParams(params)
    });
  },
  createMilestone(projectId, data) {
    return httpClient.post(`/projects/${projectId}/milestones`, data);
  },
  updateMilestone(milestoneId, data) {
    return httpClient.put(`/milestones/${milestoneId}`, data);
  },
  updateMilestoneStatus(milestoneId, status) {
    return httpClient.patch(`/milestones/${milestoneId}/status`, { status });
  },
  removeMilestone(milestoneId) {
    return httpClient.delete(`/milestones/${milestoneId}`);
  },

  // Tarefas do projeto para o painel de associacao.
  // Metodo proprio, e nao um import de `features/tasks`, para nao criar ciclo:
  // tasks/index.js -> KanbanScreen -> schedule/index.js -> ScheduleScreen.
  listProjectTasks(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/tasks`, options);
  },

  // Cronograma agregado
  getSchedule(projectId, params = {}, options = {}) {
    return httpClient.get(`/projects/${projectId}/schedule`, {
      ...options,
      params: compactParams(params)
    });
  },

  // Evolucao por sprint (RF35)
  getSprintProgress(sprintId, options = {}) {
    return httpClient.get(`/sprints/${sprintId}/progress`, options);
  },

  // Vinculo pelo lado da tarefa
  linkTaskSprint(taskId, sprintId) {
    return httpClient.patch(`/tasks/${taskId}/sprint`, { sprintId });
  },
  unlinkTaskSprint(taskId) {
    return httpClient.delete(`/tasks/${taskId}/sprint`);
  }
};
