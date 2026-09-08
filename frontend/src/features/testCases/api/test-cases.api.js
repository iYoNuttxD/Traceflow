import { httpClient } from '../../../api/http-client.js';

const compact = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value != null));
// Every read belongs to a caller's current context; it must not join an older pending GET.
const read = async (url, params = {}, options = {}) =>
  (await httpClient.get(url, { ...options, params: compact(params), fresh: true })).data;
export const testCasesApi = {
  list: (projectId, params, options) => read(`/projects/${projectId}/test-cases`, params, options),
  detail: async (id, options) => (await read(`/test-cases/${id}`, {}, options)).testCase,
  create: async (projectId, payload) =>
    (await httpClient.post(`/projects/${projectId}/test-cases`, payload)).data.testCase,
  update: async (id, payload) => (await httpClient.put(`/test-cases/${id}`, payload)).data.testCase,
  remove: (id) => httpClient.delete(`/test-cases/${id}`),
  versions: (id, params, options) => read(`/test-cases/${id}/versions`, params, options),
  history: (id, params, options) => read(`/test-cases/${id}/history`, params, options),
  executions: (id, params, options) => read(`/test-cases/${id}/executions`, params, options),
  references: (id, search, options) =>
    read(`/test-cases/${id}/tested-references`, { search, limit: 20 }, options),
  execution: async (id, options) => (await read(`/test-executions/${id}`, {}, options)).execution,
  record: async (id, formData) =>
    (await httpClient.post(`/test-cases/${id}/executions`, formData, { timeout: 120000 })).data
      .execution,
  content: (id, options) =>
    httpClient.get(`/test-evidence/${id}/content`, {
      ...options,
      responseType: 'blob',
      fresh: true
    })
};
