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
      Promise.reject({
        response: {
          status: config.url === '/forbidden' ? 403 : 401,
          data: {
            code:
              config.url === '/unauthorized'
                ? 'AUTHENTICATION_REQUIRED'
                : config.url === '/wrong-password'
                  ? 'CURRENT_PASSWORD_INVALID'
                  : 'FORBIDDEN'
          }
        },
        config
      });

    await expect(client.get('/forbidden')).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.post('/wrong-password')).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.get('/unauthorized')).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('traceflow:unauthorized', listener);
  });

  it('deixa o probe de bootstrap interpretar 401 sem emitir evento global', async () => {
    const client = createHttpClient();
    const listener = vi.fn();
    window.addEventListener('traceflow:unauthorized', listener);
    client.defaults.adapter = (config) =>
      Promise.reject({
        response: { status: 401, data: { code: 'AUTHENTICATION_REQUIRED' } },
        config
      });

    await expect(client.get('/auth/me', { skipGlobalAuthHandling: true })).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    await expect(client.get('/projects')).rejects.toBeTruthy();
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

  it('mantém a sessão e delega EMAIL_VERIFICATION_REQUIRED ao consumidor', async () => {
    const client = createHttpClient();
    const unauthorized = vi.fn();
    const restricted = vi.fn();
    window.addEventListener('traceflow:unauthorized', unauthorized);
    window.addEventListener('traceflow:account-restricted', restricted);
    client.defaults.adapter = (config) =>
      Promise.reject({
        response: {
          status: 403,
          data: {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Verifique seu e-mail para realizar esta ação.'
          }
        },
        config
      });

    await expect(client.post('/projects/invitations/1/accept', {})).rejects.toMatchObject({
      response: { data: { code: 'EMAIL_VERIFICATION_REQUIRED' } }
    });
    expect(unauthorized).not.toHaveBeenCalled();
    expect(restricted).not.toHaveBeenCalled();
    window.removeEventListener('traceflow:unauthorized', unauthorized);
    window.removeEventListener('traceflow:account-restricted', restricted);
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

  it('mantém uma única GET válida quando o primeiro consumidor é limpo pelo StrictMode', async () => {
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
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = client.get('/projects/1/artifacts', { signal: firstController.signal });
    firstController.abort();
    const second = client.get('/projects/1/artifacts', { signal: secondController.signal });

    await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
    resolveRequest();
    await expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await expect(second).resolves.toMatchObject({ data: { ok: true } });
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

describe('fresh domain reads and authenticated downloads', () => {
  it('does not join a pre-mutation GET when fresh is requested', async () => {
    const client = createHttpClient();
    const pending = [];
    client.defaults.adapter = (config) =>
      new Promise((resolve) => pending.push({ config, resolve }));
    const old = client.get('/test-cases/1');
    const fresh = client.get('/test-cases/1', { fresh: true });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].resolve({
      data: { version: 4 },
      status: 200,
      headers: {},
      config: pending[1].config
    });
    expect((await fresh).data.version).toBe(4);
    pending[0].resolve({
      data: { version: 3 },
      status: 200,
      headers: {},
      config: pending[0].config
    });
    expect((await old).data.version).toBe(3);
    expect(pending[1].config).not.toHaveProperty('fresh');
  });
  it('does not deduplicate blob and JSON responses together', async () => {
    const client = createHttpClient();
    const adapter = vi.fn(successAdapter);
    client.defaults.adapter = adapter;
    await Promise.all([client.get('/content'), client.get('/content', { responseType: 'blob' })]);
    expect(adapter).toHaveBeenCalledTimes(2);
  });
  it('still cancels fresh reads on session changes', async () => {
    const client = createHttpClient();
    let config;
    let finish;
    client.defaults.adapter = (value) => {
      config = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const request = client.get('/test-cases/1', { fresh: true });
    const rejected = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    await vi.waitFor(() => expect(config).toBeDefined());
    resetHttpSessionScope();
    expect(config.signal.aborted).toBe(true);
    finish({ data: {}, status: 200, headers: {}, config });
    await rejected;
  });
  it('decodes a JSON blob error before the canonical session handler', async () => {
    const client = createHttpClient();
    const listener = vi.fn();
    window.addEventListener('traceflow:unauthorized', listener);
    const blob = new Blob(['{"code":"SESSION_EXPIRED"}'], { type: 'application/json' });
    blob.text = async () => '{"code":"SESSION_EXPIRED"}';
    client.defaults.adapter = (config) =>
      Promise.reject({ config, response: { status: 401, data: blob } });
    await expect(
      client.get('/test-evidence/1/content', { responseType: 'blob' })
    ).rejects.toMatchObject({ response: { data: { code: 'SESSION_EXPIRED' } } });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('traceflow:unauthorized', listener);
  });
});
