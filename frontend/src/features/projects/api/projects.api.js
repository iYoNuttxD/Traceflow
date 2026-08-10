import { httpClient } from '../../../api/http-client.js';

export const projectsApi = {
  list() {
    return httpClient.get('/projects');
  },

  listGithubInstallations() {
    return httpClient.get('/github/app/installations');
  },

  listGithubRepositories(installationId, projectId) {
    return httpClient.get(`/github/app/installations/${installationId}/repositories`, {
      params: projectId ? { projectId } : undefined
    });
  },

  listAllGithubRepositories(projectId) {
    return httpClient.get('/github/app/repositories', {
      params: projectId ? { projectId } : undefined
    });
  },

  startGithubInstallation(data) {
    return httpClient.post('/github/app/installations/start', data);
  },

  connectGithubRepository(projectId, data) {
    return httpClient.put(`/projects/${projectId}/github/integration`, data);
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
