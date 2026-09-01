import { httpClient } from '../../api/http-client.js';

export const privacyApi = {
  async audit(options = {}) {
    return (await httpClient.get('/account/audit-events', options)).data;
  },
  async projectAudit(projectId, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/audit-events`, options)).data;
  }
};
