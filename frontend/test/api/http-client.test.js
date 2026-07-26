import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, setCsrfToken } from '../../src/api/http-client.js';

function successAdapter(config) {
  return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
}

describe('cliente HTTP compartilhado', () => {
  beforeEach(() => setCsrfToken());

  it('configura timeout, credenciais e CSRF somente em mutações', async () => {
    const client = createHttpClient({ baseURL: '/api', timeout: 4321 });
    client.defaults.adapter = successAdapter;
    setCsrfToken('csrf-test');

    const getResponse = await client.get('/projects');
    const postResponse = await client.post('/projects', {});

    expect(client.defaults.timeout).toBe(4321);
    expect(client.defaults.withCredentials).toBe(true);
    expect(getResponse.config.headers['X-CSRF-Token']).toBeUndefined();
    expect(postResponse.config.headers['X-CSRF-Token']).toBe('csrf-test');
  });

  it('emite expiração de sessão somente para 401 e preserva 403', async () => {
    const client = createHttpClient();
    const listener = vi.fn();
    window.addEventListener('traceflow:unauthorized', listener);
    client.defaults.adapter = (config) => Promise.reject({ response: { status: config.url === '/unauthorized' ? 401 : 403 }, config });

    await expect(client.get('/forbidden')).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.get('/unauthorized')).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('traceflow:unauthorized', listener);
  });
});
