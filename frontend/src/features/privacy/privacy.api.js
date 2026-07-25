import { api } from '../../api/api.js';

export const privacyApi = {
  async data() { return (await api.get('/account/personal-data')).data.data; },
  async updateProfile(data) { return (await api.patch('/account/profile', data)).data; },
  async sessions() { return (await api.get('/account/sessions')).data.sessions; },
  revokeSession(id) { return api.delete(`/account/sessions/${id}`); },
  revokeAllSessions() { return api.delete('/account/sessions'); },
  async requestExport() { return (await api.post('/account/personal-data/export')).data.export; },
  async deletionRequest() { return (await api.get('/account/deletion-request')).data.request; },
  async requestDeletion(password) { return (await api.post('/account/deletion-request', { password })).data.request; },
  cancelDeletion() { return api.delete('/account/deletion-request'); },
  deactivate(password) { return api.post('/account/deactivate', { password }); },
  async audit() { return (await api.get('/account/audit-events')).data; },
  async projectAudit(projectId) { return (await api.get(`/projects/${projectId}/audit-events`)).data; }
};
