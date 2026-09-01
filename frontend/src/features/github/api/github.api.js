import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

async function data(request) {
  return (await request).data;
}

export const githubApi = {
  installations(options = {}) {
    return httpClient.get('/github/app/installations', options);
  },
  repositories(installationId, options = {}) {
    return httpClient.get(`/github/app/installations/${installationId}/repositories`, options);
  },
  startInstallation(payload) {
    return data(httpClient.post('/github/app/installations/start', payload));
  },
  connectProject(projectId, data) {
    return data(httpClient.put(`/projects/${projectId}/github/integration`, data));
  },
  syncProject(projectId) {
    return data(httpClient.post(`/projects/${projectId}/github/sync`));
  },
  syncStatus(projectId, options = {}) {
    return data(httpClient.get(`/projects/${projectId}/github/sync/status`, options));
  },
  artifacts(projectId, params = {}, options = {}) {
    return data(
      httpClient.get(`/projects/${projectId}/artifacts`, {
        ...options,
        params: compactParams(params)
      })
    );
  },
  pullRequests(projectId, params = {}, options = {}) {
    return data(
      httpClient.get(`/projects/${projectId}/pull-requests`, {
        ...options,
        params: compactParams(params)
      })
    );
  },
  commits(projectId, params = {}, options = {}) {
    return data(
      httpClient.get(`/projects/${projectId}/commits`, {
        ...options,
        params: compactParams(params)
      })
    );
  },
  issues(projectId, params = {}, options = {}) {
    return data(
      httpClient.get(`/projects/${projectId}/issues`, { ...options, params: compactParams(params) })
    );
  }
};

export const getProjectArtifacts = (projectId, filters = {}, options = {}) =>
  githubApi.artifacts(projectId, filters, options);
export const syncProjectGithub = (projectId) => githubApi.syncProject(projectId);
export const getProjectGithubSyncStatus = (projectId, options = {}) =>
  githubApi.syncStatus(projectId, options);
export const getProjectPullRequests = (projectId, filters = {}, options = {}) =>
  githubApi.pullRequests(projectId, filters, options);
export const getProjectCommits = (projectId, filters = {}, options = {}) =>
  githubApi.commits(projectId, filters, options);
export const getProjectIssues = (projectId, filters = {}, options = {}) =>
  githubApi.issues(projectId, filters, options);
