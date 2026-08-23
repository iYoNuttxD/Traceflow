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

  startGithubRepositoryAuthorization(returnTo) {
    return httpClient.post('/auth/github/repositories/authorization/start', { returnTo });
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
  },

  getAccessCode(projectId) {
    return httpClient.get(`/projects/${projectId}/access-code`);
  },

  regenerateAccessCode(projectId) {
    return httpClient.post(`/projects/${projectId}/access-code/regenerate`, {});
  },

  updateAccessCodeRole(projectId, role) {
    return httpClient.patch(`/projects/${projectId}/access-code`, { role });
  }
};
