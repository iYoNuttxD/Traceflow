import { httpClient } from '../../../api/http-client.js';

export const requirementsApi = {
  create(projectId, data) { return httpClient.post(`/projects/${projectId}/requirements`, data); },
  listByProject(projectId, params = {}, options = {}) {
    return httpClient.get(`/projects/${projectId}/requirements`, { ...options, params });
  },
  getById(requirementId, options = {}) { return httpClient.get(`/requirements/${requirementId}`, options); },
  update(requirementId, data) { return httpClient.put(`/requirements/${requirementId}`, data); },
  updateStatus(requirementId, status) { return httpClient.patch(`/requirements/${requirementId}/status`, { status }); },
  listTasks(requirementId, options = {}) { return httpClient.get(`/requirements/${requirementId}/tasks`, options); },
  async replaceTasks(requirementId, taskIds) {
    return (await httpClient.put(`/requirements/${requirementId}/tasks`, { taskIds })).data;
  },
  async remove(requirementId) { return (await httpClient.delete(`/requirements/${requirementId}`)).data; },
  async confirmCompletion(requirementId) {
    return (await httpClient.patch(`/requirements/${requirementId}/confirm-completion`)).data;
  }
};

export const replaceRequirementTasks = (requirementId, taskIds) => requirementsApi.replaceTasks(requirementId, taskIds);
export const deleteRequirement = (requirementId) => requirementsApi.remove(requirementId);
export const confirmRequirementCompletion = (requirementId) => requirementsApi.confirmCompletion(requirementId);
