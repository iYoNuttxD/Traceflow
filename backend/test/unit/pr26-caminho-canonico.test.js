import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import {
  createCanonicalPathMiddleware,
  isCanonicalPath
} from '../../src/middlewares/canonical-path.middleware.js';

function capturingLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function securityConfig() {
  return {
    isProduction: false,
    trustProxy: false,
    bodyLimit: '100kb',
    corsAllowedOrigins: ['http://frontend.test'],
    corsAllowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    corsAllowedHeaders: ['Content-Type', 'X-Request-Id'],
    rateLimitWindowMs: 60000,
    rateLimitMax: 1000,
    sensitiveRateLimitMax: 1000
  };
}

const notCanonicalEvents = (logger) =>
  logger.warn.mock.calls.filter(([, context]) => context?.event === 'api_path_not_canonical');

describe('A1-03 — predicado do caminho canônico', () => {
  it.each([
    '/projects/98',
    '/projects/98/tasks',
    '/tasks/1.5',
    '/projects/x/commits',
    '/notifications/31'
  ])('aceita %s', (path) => {
    expect(isCanonicalPath(path)).toBe(true);
  });

  it.each([
    '/projects/%39%38',
    '/projects/98/traceability/alerts/%35/dismiss',
    '/projects/98%2Ftasks',
    '/projects/98%2ftasks',
    '/projects/%ZZ',
    '/projects/%',
    '/projects/%25',
    '/notifications/%31',
    '/%70rojects/98'
  ])('recusa %s', (path) => {
    expect(isCanonicalPath(path)).toBe(false);
  });

  it('o middleware olha só o caminho, sem a query string', () => {
    const middleware = createCanonicalPathMiddleware({ logger: capturingLogger() });
    const next = vi.fn();
    middleware({ method: 'GET', path: '/projects/98/tasks', baseUrl: '/api' }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('o middleware recusa com 404 RESOURCE_NOT_FOUND e registra um aviso', () => {
    const logger = capturingLogger();
    const middleware = createCanonicalPathMiddleware({ logger });
    const next = vi.fn();
    middleware(
      { method: 'DELETE', path: '/tasks/%31', baseUrl: '/api', requestId: 'req-1' },
      {},
      next
    );
    const [error] = next.mock.calls[0];
    expect(error).toMatchObject({ statusCode: 404, code: 'RESOURCE_NOT_FOUND' });
    expect(notCanonicalEvents(logger)).toEqual([
      [
        expect.any(String),
        {
          event: 'api_path_not_canonical',
          requestId: 'req-1',
          method: 'DELETE',
          path: '/api/tasks/%31'
        }
      ]
    ]);
  });

  it('corta o caminho registrado em 200 caracteres', () => {
    const logger = capturingLogger();
    const middleware = createCanonicalPathMiddleware({ logger });
    middleware(
      { method: 'GET', path: `/projects/%31${'a'.repeat(400)}`, baseUrl: '/api' },
      {},
      vi.fn()
    );
    expect(notCanonicalEvents(logger)[0][1].path).toHaveLength(200);
  });
});

describe('A1-04 — resposta da API ao caminho não canônico', () => {
  it('anônimo recebe 404 opaco antes da autenticação, com um aviso no log', async () => {
    const logger = capturingLogger();
    const app = createApp({ logger, securityConfig: securityConfig() });
    const response = await request(app).get('/api/projects/%39%38?search=%41');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: 'Recurso não encontrado.',
      code: 'RESOURCE_NOT_FOUND',
      requestId: expect.any(String)
    });
    const events = notCanonicalEvents(logger);
    expect(events).toHaveLength(1);
    expect(events[0][1]).toMatchObject({ method: 'GET', path: '/api/projects/%39%38' });
  });

  it('escrita com caminho não canônico também recebe 404, sem chegar ao CSRF', async () => {
    const app = createApp({ logger: capturingLogger(), securityConfig: securityConfig() });
    const response = await request(app).delete('/api/tasks/%31').send({});
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('% só na query string não é recusado', async () => {
    const logger = capturingLogger();
    const app = createApp({ logger, securityConfig: securityConfig() });
    const response = await request(app).get('/api/projects/98/tasks?search=%41');
    expect(response.status).toBe(401);
    expect(notCanonicalEvents(logger)).toEqual([]);
  });
});
