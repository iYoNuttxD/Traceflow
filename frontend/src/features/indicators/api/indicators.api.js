import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

export const indicatorsApi = {
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
