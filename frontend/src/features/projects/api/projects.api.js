import { api } from '../../../api/api.js';

export const projectsApi = {
  list() {
    return api.get('/projects');
  },

  listGithubRepositories() {
    return api.get('/github/repositories');
  },

  create(data) {
    return api.post('/projects', data);
  }
};
