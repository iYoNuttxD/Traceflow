// Configuracao central do Axios. As chamadas HTTP futuras devem passar por este arquivo.
// TODO: Ajustar baseURL por ambiente e adicionar interceptors caso autenticacao seja implementada.
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
});

export async function getProjectArtifacts(projectId, filters = {}) {
  const params = new URLSearchParams();

  if (filters.type) {
    params.set('type', filters.type);
  }

  if (filters.startDate) {
    params.set('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params.set('endDate', filters.endDate);
  }

  const queryString = params.toString();
  const url = `/projects/${projectId}/artifacts${queryString ? `?${queryString}` : ''}`;
  const response = await api.get(url);

  return response.data;
}

export async function syncProjectGithub(projectId) {
  const response = await api.post(`/projects/${projectId}/github/sync`);

  return response.data;
}

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

export const projectMembersApi = {
  listProjectMembers(projectId) {
    return api.get(`/projects/${projectId}/members`);
  },

  addProjectMember(projectId, data) {
    return api.post(`/projects/${projectId}/members`, data);
  },

  joinProject(data) {
    return api.post('/projects/join', data);
  }
};

export const requirementsApi = {
  create(projectId, data) {
    return api.post(`/projects/${projectId}/requirements`, data);
  },

  listByProject(projectId) {
    return api.get(`/projects/${projectId}/requirements`);
  },

  getById(requirementId) {
    return api.get(`/requirements/${requirementId}`);
  },

  update(requirementId, data) {
    return api.put(`/requirements/${requirementId}`, data);
  },

  updateStatus(requirementId, status) {
    return api.patch(`/requirements/${requirementId}/status`, { status });
  },

  listTasks(requirementId) {
    return api.get(`/requirements/${requirementId}/tasks`);
  }
};
