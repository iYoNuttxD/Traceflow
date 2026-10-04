import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

export const indicatorsApi = {
  preference(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/indicator-preference`, options);
  },
  savePreference(projectId, configuration) {
    return httpClient.put(`/projects/${projectId}/indicator-preference`, configuration);
  },
  resetPreference(projectId) {
    return httpClient.delete(`/projects/${projectId}/indicator-preference`);
  },
  dashboard(projectId, filters, options = {}) {
    return httpClient.get(`/projects/${projectId}/indicators/dashboard`, {
      ...options,
      params: compactParams(filters)
    });
  },
  catalog(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/indicators/catalog`, options);
  }
};
