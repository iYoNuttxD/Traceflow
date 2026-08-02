import axios from 'axios';
import { normalizeApiError } from '../shared/services/http-error.js';

const mutatingMethods = new Set(['post', 'put', 'patch', 'delete']);
const defaultTimeout = 15_000;
let csrfToken;
let sessionGeneration = 0;
const activeGetScopes = new Set();

function stableValue(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`)
    .join(',')}}`;
}

export function resetHttpSessionScope() {
  sessionGeneration += 1;
  for (const requests of activeGetScopes) {
    for (const entry of requests.values()) entry.controller.abort();
    requests.clear();
  }
}

function configuredTimeout() {
  const value = Number(import.meta.env.VITE_API_TIMEOUT_MS || defaultTimeout);
  return Number.isFinite(value) && value > 0 ? value : defaultTimeout;
}

export function setCsrfToken(value) {
  csrfToken = value || undefined;
}

export function createHttpClient(options = {}) {
  const pendingGets = new Map();
  activeGetScopes.add(pendingGets);
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
      resetHttpSessionScope();
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

  const get = client.get.bind(client);
  client.get = (url, config = {}) => {
    const key = `${sessionGeneration}:get:${url}:${stableValue(config.params || {})}`;
    const pending = pendingGets.get(key);
    if (pending) return pending.promise;

    const controller = new AbortController();
    if (config.signal) {
      if (config.signal.aborted) controller.abort();
      else config.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const promise = get(url, { ...config, signal: controller.signal }).finally(() => {
      if (pendingGets.get(key)?.promise === promise) pendingGets.delete(key);
    });
    pendingGets.set(key, { promise, controller });
    return promise;
  };

  return client;
}

export const httpClient = createHttpClient();

export function isRequestCanceled(error) {
  return axios.isCancel(error) || error?.code === 'ERR_CANCELED';
}

export { normalizeApiError };
