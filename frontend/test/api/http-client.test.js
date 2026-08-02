import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpClient,
  resetHttpSessionScope,
  setCsrfToken
} from '../../src/api/http-client.js';

function successAdapter(config) {
  return Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
}

describe('cliente HTTP compartilhado', () => {
  beforeEach(() => {
    resetHttpSessionScope();
    setCsrfToken();
  });

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
    client.defaults.adapter = (config) =>
      Promise.reject({ response: { status: config.url === '/unauthorized' ? 401 : 403 }, config });

    await expect(client.get('/forbidden')).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.get('/unauthorized')).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('traceflow:unauthorized', listener);
  });

  it('emite atualização de estado apenas para 403 de conta restrita', async () => {
    const client = createHttpClient();
    const listener = vi.fn();
    window.addEventListener('traceflow:account-restricted', listener);
    client.defaults.adapter = (config) =>
      Promise.reject({
        response: {
          status: 403,
          data: {
            code: config.url === '/restricted' ? 'ACCOUNT_DELETION_PENDING' : 'FORBIDDEN'
          }
        },
        config
      });
    await expect(client.get('/forbidden')).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.get('/restricted')).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('traceflow:account-restricted', listener);
  });

  it('deduplica GET simultâneo por URL e parâmetros na mesma geração de sessão', async () => {
    const client = createHttpClient();
    let resolveRequest;
    const adapter = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = () =>
            resolve({ data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config: {} });
        })
    );
    client.defaults.adapter = adapter;

    const first = client.get('/settings/account', { params: { page: 1, filter: 'active' } });
    const duplicate = client.get('/settings/account', {
      params: { filter: 'active', page: 1 }
    });

    expect(duplicate).toBe(first);
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
    resolveRequest();
    await expect(first).resolves.toMatchObject({ data: { ok: true } });
  });

  it('não reutiliza GET após a troca de geração da sessão', async () => {
    const client = createHttpClient();
    client.defaults.adapter = vi.fn(successAdapter);

    await client.get('/settings/account');
    resetHttpSessionScope();
    await client.get('/settings/account');

    expect(client.defaults.adapter).toHaveBeenCalledTimes(2);
  });

  it('não deduplica operações mutáveis', async () => {
    const client = createHttpClient();
    client.defaults.adapter = vi.fn(successAdapter);

    await Promise.all([
      client.post('/settings/account/profile', {}),
      client.post('/settings/account/profile', {})
    ]);

    expect(client.defaults.adapter).toHaveBeenCalledTimes(2);
  });
});
