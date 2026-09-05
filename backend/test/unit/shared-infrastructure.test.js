import { startTestServer } from '../helpers/http-server.js';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createErrorHandler } from '../../src/middlewares/error-handler.middleware.js';
import {
  createAuthenticationMiddleware,
  parseCookies
} from '../../src/middlewares/auth/authentication.middleware.js';
import { notFoundMiddleware } from '../../src/middlewares/not-found.middleware.js';
import {
  createRequestContextMiddleware,
  resolveRequestId
} from '../../src/middlewares/request-context.middleware.js';
import { AppError, DomainError, ERROR_CODES } from '../../src/shared/errors/index.js';
import { asyncHandler } from '../../src/shared/http/index.js';
import { createLogger, redact } from '../../src/shared/logger/index.js';

function silentLogger() {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

function createTestApp(route, { logger = silentLogger(), includeErrorStack = false } = {}) {
  const app = express();
  app.use(createRequestContextMiddleware({ logger }));
  if (route) app.get('/failure', asyncHandler(route, { fallbackMessage: 'Falha segura.' }));
  app.use(notFoundMiddleware);
  app.use(createErrorHandler({ logger, includeErrorStack }));
  return { app, logger };
}

describe('AppError', () => {
  it('preserva defaults, causa, stack e serialização pública segura', () => {
    const cause = new Error('causa interna');
    const error = new AppError({ message: 'Falha pública', cause });
    expect(error).toMatchObject({
      statusCode: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      isOperational: true,
      cause
    });
    expect(error.stack).toContain('Falha pública');
    expect(error.toPublic({ requestId: 'req-1' })).toEqual({ message: 'Falha pública' });
  });

  it('expõe código e request ID somente quando configurado', () => {
    const error = new AppError({
      message: 'Falha pública',
      statusCode: 409,
      code: ERROR_CODES.CONFLICT,
      exposeTechnicalDetails: true
    });
    expect(error.toPublic({ requestId: 'req-1' })).toEqual({
      message: 'Falha pública',
      code: ERROR_CODES.CONFLICT,
      requestId: 'req-1'
    });
  });
});

describe('request ID e middlewares HTTP', () => {
  it('ignora cookies malformados sem transformar ausência de sessão em erro interno', () => {
    expect(parseCookies('traceflow_session=abc%20123; inválido; ruim=%; tema=escuro')).toEqual({
      traceflow_session: 'abc 123',
      tema: 'escuro'
    });
  });

  it('reutiliza autenticação já resolvida por middleware anterior na mesma requisição', async () => {
    const service = { authenticate: vi.fn() };
    const next = vi.fn();
    const req = { auth: { user: { id: 7 }, session: { id: 9 } }, headers: {} };
    await createAuthenticationMiddleware({ service, cookieName: 'session' })(req, {}, next);
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('gera UUID e aceita somente identificador seguro', () => {
    expect(resolveRequestId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('cliente-123')).toBe('cliente-123');
    expect(resolveRequestId('x'.repeat(65))).not.toBe('x'.repeat(65));
    expect(resolveRequestId('inválido com espaços')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('devolve request ID no header e no novo erro 404', async () => {
    const { app } = createTestApp();
    const response = await request(await startTestServer(app))
      .get('/inexistente')
      .set('X-Request-Id', 'req-valido');
    expect(response.status).toBe(404);
    expect(response.headers['x-request-id']).toBe('req-valido');
    expect(response.body).toEqual({
      message: 'Rota não encontrada.',
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      requestId: 'req-valido'
    });
  });

  it('preserva contrato de erro operacional conhecido', async () => {
    const { app } = createTestApp(async () => {
      throw new DomainError('Entrada inválida.', 400);
    });
    const response = await request(await startTestServer(app)).get('/failure');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Entrada inválida.' });
    expect(response.body.stack).toBeUndefined();
  });

  it('sanitiza erro inesperado e inclui correlação sem stack', async () => {
    const { app, logger } = createTestApp(async () => {
      throw new Error('token=segredo user@example.com');
    });
    const response = await request(await startTestServer(app))
      .get('/failure')
      .set('X-Request-Id', 'req-500');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'Falha segura.',
      code: ERROR_CODES.INTERNAL_ERROR,
      requestId: 'req-500'
    });
    expect(JSON.stringify(response.body)).not.toContain('segredo');
    expect(JSON.stringify(response.body)).not.toContain('stack');
    expect(logger.error).toHaveBeenCalledWith(
      'HTTP request failed.',
      expect.objectContaining({ requestId: 'req-500', statusCode: 500 })
    );
  });

  it.each([
    [401, ERROR_CODES.AUTHENTICATION_REQUIRED],
    [403, ERROR_CODES.FORBIDDEN],
    [404, ERROR_CODES.RESOURCE_NOT_FOUND],
    [409, ERROR_CODES.CONFLICT],
    [429, ERROR_CODES.RATE_LIMITED]
  ])('não registra stack nem caminho interno para erro esperado %s', async (statusCode, code) => {
    const { app, logger } = createTestApp(async () => {
      throw new AppError({
        message: 'Falha esperada.',
        statusCode,
        code,
        exposeTechnicalDetails: true
      });
    });

    const response = await request(await startTestServer(app))
      .get('/failure')
      .set('X-Request-Id', `req-${statusCode}`);
    const context = logger.error.mock.calls[0][1];
    const serialized = JSON.stringify(context);

    expect(response.status).toBe(statusCode);
    expect(context).toMatchObject({
      requestId: `req-${statusCode}`,
      method: 'GET',
      path: '/failure',
      statusCode,
      errorCode: code,
      error: { name: 'AppError', message: 'Falha esperada.' }
    });
    expect(serialized).not.toMatch(/stack|file:\/\/|node_modules|\/Users\//i);
  });

  it('mantém o log operacional padrão do 500 sem mensagem, stack ou caminho interno', async () => {
    const { app, logger } = createTestApp(async () => {
      throw new Error(
        'ENOENT em file:///Users/pessoa/projeto/node_modules/pacote/index.js token=segredo'
      );
    });

    const response = await request(await startTestServer(app))
      .get('/failure')
      .set('X-Request-Id', 'req-500-seguro');
    const context = logger.error.mock.calls[0][1];
    const serialized = JSON.stringify(context);

    expect(response).toMatchObject({
      status: 500,
      body: {
        message: 'Falha segura.',
        code: ERROR_CODES.INTERNAL_ERROR,
        requestId: 'req-500-seguro'
      }
    });
    expect(context).toMatchObject({
      requestId: 'req-500-seguro',
      method: 'GET',
      path: '/failure',
      statusCode: 500,
      errorCode: ERROR_CODES.INTERNAL_ERROR,
      error: { name: 'Error', message: 'Falha segura.' }
    });
    expect(serialized).not.toMatch(/stack|file:\/\/|node_modules|\/Users\/|segredo/i);
  });

  it('só permite stack de erro inesperado com opt-in explícito e preserva o response público', async () => {
    const { app, logger } = createTestApp(
      async () => {
        throw new Error('Falha interna para diagnóstico controlado.');
      },
      { includeErrorStack: true }
    );

    const response = await request(await startTestServer(app)).get('/failure');
    const context = logger.error.mock.calls[0][1];

    expect(context.error.stack).toContain('Falha interna para diagnóstico controlado.');
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toContain('diagnóstico controlado');
  });

  it('usa fallback seguro para erro de serviço externo', async () => {
    const { ExternalServiceError } = await import('../../src/shared/errors/index.js');
    const { app } = createTestApp(async () => {
      throw new ExternalServiceError('GITHUB_TOKEN ausente.', 500);
    });
    const response = await request(await startTestServer(app)).get('/failure');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Falha segura.' });
  });

  it('delega quando headers já foram enviados', () => {
    const next = vi.fn();
    const handler = createErrorHandler({ logger: silentLogger(), environment: 'test' });
    const error = new Error('falha');
    handler(error, {}, { headersSent: true }, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('logger e redaction', () => {
  it('redige chaves sensíveis, e-mail e ciclos', () => {
    const source = {
      token: 'token-real',
      DATABASE_URL: 'mysql://user:pass@localhost/db',
      authorEmail: 'autor@example.com',
      nested: { message: 'contato pessoa@example.com' }
    };
    source.self = source;
    const result = redact(source);
    expect(result).toMatchObject({
      token: '[REDACTED]',
      DATABASE_URL: '[REDACTED]',
      authorEmail: '[REDACTED]',
      nested: { message: 'contato [REDACTED_EMAIL]' },
      self: '[CIRCULAR]'
    });
  });

  it('produz JSON estruturado e sanitiza erro externo', () => {
    const lines = [];
    const logger = createLogger({
      environment: 'test',
      write: (level, line) => lines.push({ level, line })
    });
    const event = logger.error('Falha Octokit token=abc', {
      requestId: 'req-log',
      service: 'github',
      externalStatus: 401,
      email: 'user@example.com',
      error: new Error('authorization=Bearer-secret')
    });
    expect(event).toMatchObject({
      level: 'error',
      environment: 'test',
      requestId: 'req-log',
      service: 'github',
      externalStatus: 401,
      email: '[REDACTED]'
    });
    expect(JSON.parse(lines[0].line)).toEqual(event);
    expect(lines[0].line).not.toContain('Bearer-secret');
    expect(lines[0].line).not.toContain('user@example.com');
  });
});
