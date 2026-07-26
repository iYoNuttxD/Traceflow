import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createGracefulShutdown } from '../../src/shared/runtime/graceful-shutdown.js';

const silentLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
};

describe('health probes', () => {
  it('preserva health e responde liveness', async () => {
    const app = createApp({ logger: silentLogger, readinessCheck: async () => true });
    expect((await request(app).get('/health')).body).toEqual({
      status: 'ok',
      message: 'TRACEFLOW backend structure is ready.'
    });
    expect(await request(app).get('/health/live')).toMatchObject({
      status: 200,
      body: { status: 'ok' }
    });
  });

  it('responde readiness 200 ou 503 sem expor detalhes', async () => {
    const readyApp = createApp({ logger: silentLogger, readinessCheck: async () => true });
    expect(await request(readyApp).get('/health/ready')).toMatchObject({
      status: 200,
      body: { status: 'ready' }
    });

    const unavailableApp = createApp({
      logger: silentLogger,
      readinessCheck: async () => {
        throw new Error('mysql://user:secret@localhost/private');
      }
    });
    const response = await request(unavailableApp).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      message: 'Dependência essencial indisponível.'
    });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
});

describe('shutdown controlado', () => {
  it('fecha HTTP, desconecta Prisma e evita execução duplicada', async () => {
    const server = { close: vi.fn((callback) => callback()), closeAllConnections: vi.fn() };
    const disconnect = vi.fn(async () => {});
    const exit = vi.fn();
    const logger = { info: vi.fn(), error: vi.fn() };
    const shutdown = createGracefulShutdown({ server, disconnect, exit, logger, timeoutMs: 100 });

    const first = shutdown('SIGTERM');
    const second = shutdown('SIGINT');
    expect(first).toBe(second);
    await first;

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalledWith('Graceful shutdown completed.', {
      signal: 'SIGTERM'
    });
  });
});
