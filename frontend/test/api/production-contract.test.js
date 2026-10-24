import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  validateProductionBundle,
  validateProductionEnvironment
} from '../../production-contract.js';
import { configuredApiBase } from '../../src/api/api-base.js';
import { createHttpClient, setCsrfToken } from '../../src/api/http-client.js';
import { buildProjectEventsUrl } from '../../src/features/projects/events/ProjectEventsContext.jsx';
afterEach(() => {
  vi.unstubAllEnvs();
  setCsrfToken();
});
describe('production same-origin', () => {
  it.each(['/api', ''])(
    'shares base %s for REST and EventSource while preserving CSRF/uploads/downloads',
    async (value) => {
      vi.stubEnv('PROD', true);
      vi.stubEnv('VITE_API_URL', value);
      expect(configuredApiBase()).toBe('/api');
      const client = createHttpClient();
      expect(client.defaults.baseURL).toBe('/api');
      expect(client.defaults.withCredentials).toBe(true);
      expect(buildProjectEventsUrl(7)).toBe('/api/projects/7/events');
      client.defaults.adapter = async (config) => ({ status: 200, data: {}, headers: {}, config });
      const login = await client.post('/auth/login', { identifier: 'synthetic' });
      expect(login.config.baseURL).toBe('/api');
      setCsrfToken('test-only-csrf');
      const data = new FormData();
      data.append('evidence', new Blob(['synthetic']), 'example.txt');
      const upload = await client.post('/test-cases/1/executions', data);
      expect(upload.config.data).toBe(data);
      expect(upload.config.headers['X-CSRF-Token']).toBe('test-only-csrf');
      const download = await client.get('/test-evidences/1/content', { responseType: 'blob' });
      expect(download.config.responseType).toBe('blob');
      expect(download.config.headers['X-CSRF-Token']).toBeUndefined();
    }
  );
  it('preserves local development', () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_API_URL', '');
    expect(configuredApiBase()).toBe('http://localhost:3001/api');
  });
  it('rejects unsafe build configuration without echoing values', () => {
    expect(validateProductionEnvironment({})).toBe('/api');
    expect(
      validateProductionEnvironment({ VITE_API_URL: '/api', VITE_API_TIMEOUT_MS: '15000' })
    ).toBe('/api');
    for (const value of [
      'http://localhost:3001/api',
      'https://other.example/api',
      '//other.example/api'
    ])
      expect(() => validateProductionEnvironment({ VITE_API_URL: value })).toThrow(/VITE_API_URL/);
    expect(() => validateProductionEnvironment({ VITE_SECRET: 'sensitive' })).toThrow(
      /não autorizada/
    );
    expect(() => validateProductionEnvironment({ VITE_API_TIMEOUT_MS: '0' })).toThrow(/TIMEOUT/);
  });
  it('validates all emitted executable assets but permits inert URL-parser metadata', () => {
    const bundle = (code) => ({
      html: { fileName: 'index.html', source: '<div id="root"></div>' },
      js: { fileName: 'assets/main.js', code }
    });
    expect(() =>
      validateProductionBundle(bundle('const metadata="http://localhost";'))
    ).not.toThrow();
    expect(() =>
      validateProductionBundle(bundle('const base="http://localhost:3001/api";'))
    ).toThrow(/operacional/);
    expect(() => validateProductionBundle(bundle('const base="mysql://private";'))).toThrow(
      /credencial/
    );
    expect(() => validateProductionBundle({})).toThrow(/index.html/);
  });
});
