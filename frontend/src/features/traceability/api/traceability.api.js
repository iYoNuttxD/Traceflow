import { httpClient } from '../../../api/http-client.js';

async function data(request) { return (await request).data; }

export const traceabilityApi = {
  requirementTaskCoverage(projectId, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/requirement-task-coverage`, options)); },
  pullRequestCoverage(projectId, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/pull-request-coverage`, options)); },
  commitCoverage(projectId, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/commit-coverage`, options)); },
  issueCoverage(projectId, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/issue-coverage`, options)); },
  matrix(projectId, params = {}, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/requirements-matrix`, { ...options, params })); },
  requirement(projectId, requirementId, params = {}, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/requirements/${requirementId}`, { ...options, params })); },
  task(projectId, taskId, params = {}, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/tasks/${taskId}`, { ...options, params })); },
  artifact(projectId, artifactType, artifactId, params = {}, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/artifacts/${artifactType}/${artifactId}`, { ...options, params })); },
  suggestions(projectId, params = {}, options = {}) { return data(httpClient.get(`/projects/${projectId}/traceability/commit-suggestions`, { ...options, params })); },
  scanSuggestions(projectId) { return data(httpClient.post(`/projects/${projectId}/traceability/commit-suggestions/scan`, {})); },
  confirmSuggestion(projectId, suggestionId) { return data(httpClient.post(`/projects/${projectId}/traceability/commit-suggestions/${suggestionId}/confirm`, {})); },
  rejectSuggestion(projectId, suggestionId) { return data(httpClient.post(`/projects/${projectId}/traceability/commit-suggestions/${suggestionId}/reject`, {})); }
};

export const getRequirementTaskCoverage = (projectId, options) => traceabilityApi.requirementTaskCoverage(projectId, options);
export const getProjectPullRequestCoverage = (projectId, options) => traceabilityApi.pullRequestCoverage(projectId, options);
export const getProjectCommitCoverage = (projectId, options) => traceabilityApi.commitCoverage(projectId, options);
export const getProjectIssueCoverage = (projectId, options) => traceabilityApi.issueCoverage(projectId, options);
export const getRequirementsTraceabilityMatrix = (projectId, params, options) => traceabilityApi.matrix(projectId, params, options);
export const getRequirementTraceability = (projectId, requirementId, params, options) => traceabilityApi.requirement(projectId, requirementId, params, options);
export const getTaskTraceability = (projectId, taskId, params, options) => traceabilityApi.task(projectId, taskId, params, options);
export const getArtifactTraceability = (projectId, artifactType, artifactId, params, options) => traceabilityApi.artifact(projectId, artifactType, artifactId, params, options);
export const getCommitSuggestions = (projectId, params, options) => traceabilityApi.suggestions(projectId, params, options);
export const scanCommitSuggestions = (projectId) => traceabilityApi.scanSuggestions(projectId);
export const confirmCommitSuggestion = (projectId, suggestionId) => traceabilityApi.confirmSuggestion(projectId, suggestionId);
export const rejectCommitSuggestion = (projectId, suggestionId) => traceabilityApi.rejectSuggestion(projectId, suggestionId);
