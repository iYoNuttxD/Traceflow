import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

export const scheduleApi = {
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
  listSprintTasks(sprintId, options = {}) {
    return httpClient.get(`/sprints/${sprintId}/tasks`, options);
  },
  replaceSprintTasks(sprintId, taskIds) {
    return httpClient.put(`/sprints/${sprintId}/tasks`, { taskIds });
  },

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

  getMembership(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/members`, options);
  },

  listProjectTasks(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/tasks`, options);
  },

  getSchedule(projectId, params = {}, options = {}) {
    return httpClient.get(`/projects/${projectId}/schedule`, {
      ...options,
      params: compactParams(params)
    });
  },

  getSprintProgress(sprintId, options = {}) {
    return httpClient.get(`/sprints/${sprintId}/progress`, options);
  },

  linkTaskSprint(taskId, sprintId) {
    return httpClient.patch(`/tasks/${taskId}/sprint`, { sprintId });
  },
  unlinkTaskSprint(taskId) {
    return httpClient.delete(`/tasks/${taskId}/sprint`);
  }
};
