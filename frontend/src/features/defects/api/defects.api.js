import { httpClient } from '../../../api/http-client.js';
const compact = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
const read = async (url, params = {}, options = {}) =>
  (await httpClient.get(url, { ...options, params: compact(params), fresh: true })).data;
export const defectsApi = {
  list: (projectId, params, options) => read(`/projects/${projectId}/defects`, params, options),
  candidates: (projectId, params, options) =>
    read(`/projects/${projectId}/defects/detection-candidates`, params, options),
  detail: async (id, options) => (await read(`/defects/${id}`, {}, options)).defect,
  history: (id, params, options) => read(`/defects/${id}/history`, params, options),
  retests: (id, params, options) => read(`/defects/${id}/retests`, params, options),
  create: async (projectId, payload) =>
    (await httpClient.post(`/projects/${projectId}/defects`, payload)).data.defect,
  update: async (id, payload) => (await httpClient.put(`/defects/${id}`, payload)).data.defect,
  correction: async (id, payload) =>
    (await httpClient.post(`/defects/${id}/correction-tasks`, payload)).data.defect,
  remove: (id) => httpClient.delete(`/defects/${id}`)
};
