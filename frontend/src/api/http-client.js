import axios from 'axios';
import { normalizeApiError } from '../shared/services/http-error.js';

const mutatingMethods = new Set(['post', 'put', 'patch', 'delete']);
const defaultTimeout = 15_000;
let csrfToken;

function configuredTimeout() {
  const value = Number(import.meta.env.VITE_API_TIMEOUT_MS || defaultTimeout);
  return Number.isFinite(value) && value > 0 ? value : defaultTimeout;
}

export function setCsrfToken(value) {
  csrfToken = value || undefined;
}

export function createHttpClient(options = {}) {
  const client = axios.create({
    baseURL: options.baseURL || import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
    withCredentials: true,
    timeout: options.timeout || configuredTimeout()
  });

  client.interceptors.request.use((config) => {
    if (csrfToken && mutatingMethods.has(config.method?.toLowerCase())) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    return config;
  });

  client.interceptors.response.use(undefined, (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('traceflow:unauthorized'));
    }
    if (
      error?.response?.status === 403 &&
      ['ACCOUNT_DEACTIVATED', 'ACCOUNT_DELETION_PENDING', 'ACCOUNT_ANONYMIZED'].includes(
        error.response.data?.code
      ) &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(
        new CustomEvent('traceflow:account-restricted', {
          detail: { code: error.response.data.code }
        })
      );
    }
    return Promise.reject(error);
  });

  return client;
}

export const httpClient = createHttpClient();

export function isRequestCanceled(error) {
  return axios.isCancel(error) || error?.code === 'ERR_CANCELED';
}

export { normalizeApiError };
