import { httpClient } from '../../../api/http-client.js';

export const projectsApi = {
  list() {
    return httpClient.get('/projects');
  },

  listGithubRepositories() {
    return httpClient.get('/github/repositories');
  },

  create(data) {
    return httpClient.post('/projects', data);
  },

  createFromGithub(data) {
    return httpClient.post('/projects/from-github', data);
  },

  get(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}`, options);
  },

  update(projectId, data) {
    return httpClient.put(`/projects/${projectId}`, data);
  }
};
