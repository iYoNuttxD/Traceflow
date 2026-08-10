import { httpClient } from '../../api/http-client.js';

export const privacyApi = {
  async data(options = {}) {
    return (await httpClient.get('/account/personal-data', options)).data.data;
  },
  async updateProfile(data) {
    return (await httpClient.patch('/account/profile', data)).data;
  },
  async sessions(options = {}) {
    return (await httpClient.get('/account/sessions', options)).data.sessions;
  },
  revokeSession(id) {
    return httpClient.delete(`/account/sessions/${id}`);
  },
  revokeAllSessions() {
    return httpClient.delete('/account/sessions');
  },
  async requestExport() {
    return (await httpClient.post('/account/personal-data/export')).data.export;
  },
  async deletionRequest(options = {}) {
    return (await httpClient.get('/account/deletion-request', options)).data.request;
  },
  async requestDeletion(password) {
    return (await httpClient.post('/account/deletion-request', { password })).data.request;
  },
  cancelDeletion(password) {
    return httpClient.delete('/account/deletion-request', { data: { password } });
  },
  deactivate(password) {
    return httpClient.post('/account/deactivate', { password });
  },
  async audit(options = {}) {
    return (await httpClient.get('/account/audit-events', options)).data;
  },
  async projectAudit(projectId, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/audit-events`, options)).data;
  }
};
