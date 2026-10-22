import { httpClient } from '../../../api/http-client.js';
import { dashboardTimeZone } from '../../indicators/index.js';

export const reportsApi = {
  async list(projectId, params = {}, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/reports`, { ...options, params })).data;
  },
  async create(projectId, body) {
    return (await httpClient.post(`/projects/${projectId}/reports`, body)).data;
  },
  async get(projectId, reportId, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/reports/${reportId}`, options)).data
      .report;
  },
  // S2-07: o PDF é montado na hora; o fuso só formata instantes de relatórios sem período.
  async downloadPdf(projectId, reportId) {
    return (
      await httpClient.get(`/projects/${projectId}/reports/${reportId}/pdf`, {
        params: { timeZone: dashboardTimeZone() },
        responseType: 'blob',
        fresh: true,
        timeout: 120000
      })
    ).data;
  }
};
