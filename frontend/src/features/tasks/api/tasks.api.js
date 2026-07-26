import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

async function responseData(request) {
  return (await request).data;
}

export const tasksApi = {
  list(projectId, params = {}, options = {}) { return httpClient.get(`/projects/${projectId}/tasks`, { ...options, params: compactParams(params) }); },
  create(projectId, payload) { return httpClient.post(`/projects/${projectId}/tasks`, payload); },
  update(taskId, payload) { return httpClient.put(`/tasks/${taskId}`, payload); },
  remove(taskId) { return responseData(httpClient.delete(`/tasks/${taskId}`)); },
  linkRequirement(taskId, requirementId) { return responseData(httpClient.patch(`/tasks/${taskId}/requirement`, { requirementId })); },
  unlinkRequirement(taskId) { return responseData(httpClient.delete(`/tasks/${taskId}/requirement`)); },
  linkPullRequest(taskId, pullRequestId) { return responseData(httpClient.patch(`/tasks/${taskId}/pull-request`, { pullRequestId })); },
  unlinkPullRequest(taskId) { return responseData(httpClient.delete(`/tasks/${taskId}/pull-request`)); },
  commits(taskId, options = {}) { return responseData(httpClient.get(`/tasks/${taskId}/commits`, options)); },
  linkCommit(taskId, commitId) { return responseData(httpClient.post(`/tasks/${taskId}/commits`, { commitId })); },
  unlinkCommit(taskId, commitId) { return responseData(httpClient.delete(`/tasks/${taskId}/commits/${commitId}`)); },
  issues(taskId, options = {}) { return responseData(httpClient.get(`/tasks/${taskId}/issues`, options)); },
  linkIssue(taskId, issueId) { return responseData(httpClient.post(`/tasks/${taskId}/issues`, { issueId })); },
  unlinkIssue(taskId, issueId) { return responseData(httpClient.delete(`/tasks/${taskId}/issues/${issueId}`)); }
};

export const deleteTask = (taskId) => tasksApi.remove(taskId);
export const linkTaskRequirement = (taskId, requirementId) => tasksApi.linkRequirement(taskId, requirementId);
export const unlinkTaskRequirement = (taskId) => tasksApi.unlinkRequirement(taskId);
export const linkTaskToPullRequest = (taskId, pullRequestId) => tasksApi.linkPullRequest(taskId, pullRequestId);
export const unlinkTaskFromPullRequest = (taskId) => tasksApi.unlinkPullRequest(taskId);
export const getTaskCommits = (taskId, options) => tasksApi.commits(taskId, options);
export const linkTaskCommit = (taskId, commitId) => tasksApi.linkCommit(taskId, commitId);
export const unlinkTaskCommit = (taskId, commitId) => tasksApi.unlinkCommit(taskId, commitId);
export const getTaskIssues = (taskId, options) => tasksApi.issues(taskId, options);
export const linkTaskIssue = (taskId, issueId) => tasksApi.linkIssue(taskId, issueId);
export const unlinkTaskIssue = (taskId, issueId) => tasksApi.unlinkIssue(taskId, issueId);

export const kanbanApi = {
  getBoard(projectId, options = {}) { return httpClient.get(`/projects/${projectId}/kanban`, options); },
  moveTask(taskId, data) { return httpClient.patch(`/tasks/${taskId}/move`, data); },
  listMovements(projectId, params = {}, options = {}) { return httpClient.get(`/projects/${projectId}/kanban/movements`, { ...options, params: compactParams(params) }); },
  listTaskHistory(projectId, params = {}, options = {}) { return httpClient.get(`/projects/${projectId}/tasks/history`, { ...options, params: compactParams(params) }); },
  getMetrics(projectId, params = {}, options = {}) { return httpClient.get(`/projects/${projectId}/kanban/metrics`, { ...options, params: compactParams(params) }); }
};
