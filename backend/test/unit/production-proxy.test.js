import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import { createEnvironment } from '../../src/config/env.js';
import { productionEnvironment } from '../helpers/production-environment.js';
import { createRateLimiters } from '../../src/shared/security/rate-limit.js';
import { createCorsMiddleware } from '../../src/shared/security/cors.js';

const config = createEnvironment(productionEnvironment());
function harness(peer) {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    Object.defineProperty(req.socket, 'remoteAddress', { value: peer, configurable: true });
    next();
  });
  const limits = createRateLimiters({
    ...config,
    rateLimitGlobalMax: 1,
    logger: { warn: vi.fn() }
  });
  app.use(createCorsMiddleware(config));
  app.use(limits.globalAbuse);
  app.get('/', (req, res) =>
    res.json({ ip: req.ip, protocol: req.protocol, hostname: req.hostname })
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(error.statusCode || 500).json({ denied: true });
  });
  return app;
}
describe('loopback proxy boundary', () => {
  it('ignores forged forwarded headers and CF-Connecting-IP from an untrusted peer, including limiter identity', async () => {
    const server = await startTestServer(harness('203.0.113.19'));
    const first = await request(server)
      .get('/')
      .set('Host', 'traceflow.example')
      .set('X-Forwarded-For', '1.1.1.1')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'evil.example')
      .set('CF-Connecting-IP', '1.1.1.1');
    expect(first.body).toEqual({
      ip: '203.0.113.19',
      protocol: 'http',
      hostname: 'traceflow.example'
    });
    expect((await request(server).get('/').set('X-Forwarded-For', '8.8.8.8')).status).toBe(429);
  });
  it('uses the nearest untrusted client beyond loopback and recognizes normalized HTTPS/Host', async () => {
    const server = await startTestServer(harness('127.0.0.1'));
    const response = await request(server)
      .get('/')
      .set('Host', 'traceflow.example')
      .set('X-Forwarded-Host', 'traceflow.example')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-For', '1.1.1.1, 203.0.113.20')
      .set('CF-Connecting-IP', '8.8.8.8');
    expect(response.body).toEqual({
      ip: '203.0.113.20',
      protocol: 'https',
      hostname: 'traceflow.example'
    });
    expect(
      (await request(server).get('/').set('X-Forwarded-For', '9.9.9.9, 203.0.113.20')).status
    ).toBe(429);
  });
  it('preserves exact-origin credentialed CORS and rejects unknown origins', async () => {
    const server = await startTestServer(harness('127.0.0.1'));
    const ok = await request(server).get('/').set('Origin', 'https://traceflow.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://traceflow.example');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(server).get('/').set('Origin', 'https://evil.example');
    expect(denied.status).toBe(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
