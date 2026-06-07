// Configuracao central do Axios. As chamadas HTTP futuras devem passar por este arquivo.
// TODO: Ajustar baseURL por ambiente e adicionar interceptors caso autenticacao seja implementada.
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
});

export const kanbanApi = {
  getBoard(projectId) {
    return api.get(`/projects/${projectId}/kanban`);
  },

  moveTask(taskId, data) {
    return api.patch(`/tasks/${taskId}/move`, data);
  },

  listMovements(projectId, params) {
    return api.get(`/projects/${projectId}/kanban/movements`, { params });
  },

  getMetrics(projectId, params) {
    return api.get(`/projects/${projectId}/kanban/metrics`, { params });
  }
};

export const githubApi = {
  listProjectMembers(projectId) {
    return api.get(`/projects/${projectId}/github/members`);
  }
};
