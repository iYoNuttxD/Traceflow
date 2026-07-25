import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { ERROR_CODES, ExternalServiceError } from '../../src/shared/errors/index.js';
import {
  calculateGithubRetryDelay,
  executeGithubRequest,
  isRetryableGithubError
} from '../../src/modules/github/github-request.js';
import { isAllowedGithubUrl } from '../../src/shared/security/index.js';
import { scanText } from '../../scripts/check-secrets.js';

const silentLogger = Object.freeze({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
});

function securityConfig(overrides = {}) {
  return {
    isProduction: false,
    trustProxy: false,
    bodyLimit: '1kb',
    corsAllowedOrigins: ['http://frontend.test'],
    corsAllowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    corsAllowedHeaders: ['Content-Type', 'X-Request-Id'],
    rateLimitWindowMs: 60000,
    rateLimitMax: 100,
    sensitiveRateLimitMax: 10,
    ...overrides
  };
}

describe('headers, body e CORS', () => {
  it('remove fingerprint e aplica headers de API sem HSTS fora de produção', async () => {
    const app = createApp({ logger: silentLogger, securityConfig: securityConfig() });
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('habilita HSTS somente na configuração de produção', async () => {
    const app = createApp({
      logger: silentLogger,
      securityConfig: securityConfig({ isProduction: true })
    });
    const response = await request(app).get('/health');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
  });

  it('aceita origem configurada, ausência de Origin e preflight permitido', async () => {
    const app = createApp({ logger: silentLogger, securityConfig: securityConfig() });
    const allowed = await request(app).get('/health').set('Origin', 'http://frontend.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://frontend.test');
    expect((await request(app).get('/health')).status).toBe(200);
    const preflight = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://frontend.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,X-Request-Id');
    expect(preflight.status).toBe(204);
  });

  it('rejeita origem, método e header não permitidos', async () => {
    const app = createApp({ logger: silentLogger, securityConfig: securityConfig() });
    const forbiddenOrigin = await request(app).get('/health').set('Origin', 'https://evil.invalid');
    expect(forbiddenOrigin).toMatchObject({
      status: 403,
      body: expect.objectContaining({ code: ERROR_CODES.CORS_ORIGIN_DENIED })
    });
    const forbiddenMethod = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://frontend.test')
      .set('Access-Control-Request-Method', 'TRACE');
    expect(forbiddenMethod.status).toBe(403);
    const forbiddenHeader = await request(app)
      .options('/api/projects')
      .set('Origin', 'http://frontend.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization');
    expect(forbiddenHeader.status).toBe(403);
  });

  it('rejeita JSON excessivo, malformado e content type inesperado com resposta segura', async () => {
    const app = createApp({ logger: silentLogger, securityConfig: securityConfig() });
    const oversized = await request(app)
      .post('/api/projects/join')
      .set('Content-Type', 'application/json')
      .send({ accessCode: 'TRC-TEST', name: 'x'.repeat(2048) });
    expect(oversized).toMatchObject({
      status: 413,
      body: expect.objectContaining({ code: ERROR_CODES.PAYLOAD_TOO_LARGE })
    });
    expect(oversized.body.requestId).toBe(oversized.headers['x-request-id']);
    expect(JSON.stringify(oversized.body)).not.toContain('x'.repeat(100));

    const malformed = await request(app)
      .post('/api/projects/join')
      .set('Content-Type', 'application/json')
      .send('{"accessCode":');
    expect(malformed).toMatchObject({
      status: 400,
      body: expect.objectContaining({ code: ERROR_CODES.MALFORMED_JSON })
    });

    const unsupported = await request(app)
      .post('/api/projects/join')
      .set('Content-Type', 'text/plain')
      .send('accessCode=TRC-TEST');
    expect(unsupported).toMatchObject({
      status: 415,
      body: expect.objectContaining({ code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE })
    });
  });
});

describe('rate limiting', () => {
  it('aplica limite geral, headers e isolamento mínimo por IP', async () => {
    const app = createApp({
      logger: silentLogger,
      securityConfig: securityConfig({ trustProxy: 1, rateLimitMax: 1 })
    });
    const first = await request(app).get('/api/unknown').set('X-Forwarded-For', '198.51.100.10');
    const limited = await request(app).get('/api/unknown').set('X-Forwarded-For', '198.51.100.10');
    const isolated = await request(app).get('/api/unknown').set('X-Forwarded-For', '198.51.100.11');
    expect(first.status).toBe(401);
    expect(limited).toMatchObject({
      status: 429,
      body: {
        message: 'Muitas requisições. Tente novamente mais tarde.',
        code: ERROR_CODES.RATE_LIMITED,
        requestId: expect.any(String)
      }
    });
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers.ratelimit).toBeDefined();
    expect(isolated.status).toBe(401);
  });

  it.each([
    ['/api/projects/join', 'join'],
    ['/api/projects/not-an-id/github/sync', 'sync']
  ])('aplica limite sensível em %s', async (path) => {
    const app = createApp({
      logger: silentLogger,
      securityConfig: securityConfig({ sensitiveRateLimitMax: 2 })
    });
    for (let index = 0; index < 2; index += 1) {
      await request(app).post(path).send({});
    }
    const response = await request(app).post(path).send({});
    expect(response.status).toBe(429);
    expect(response.body.code).toBe(ERROR_CODES.RATE_LIMITED);
  });
});

describe('GitHub, SSRF e segredos', () => {
  it.each([
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]',
    'http://169.254.169.254',
    'http://10.0.0.1',
    'http://192.168.0.1',
    'ftp://github.com',
    'https://dominio-malicioso.com'
  ])('rejeita URL externa %s', (url) => {
    expect(isAllowedGithubUrl(url)).toBe(false);
  });

  it('aceita somente URLs HTTPS oficiais esperadas', () => {
    expect(isAllowedGithubUrl('https://github.com/artificial/repository')).toBe(true);
    expect(isAllowedGithubUrl('https://api.github.com/repos/artificial/repository')).toBe(true);
  });

  it('faz retry limitado de falha transitória sem espera real', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue({ data: 'ok' });
    const wait = vi.fn().mockResolvedValue();
    await expect(executeGithubRequest(operation, {
      maxRetries: 2,
      wait,
      random: () => 0
    })).resolves.toEqual({ data: 'ok' });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(250);
  });

  it('não repete autenticação e encerra no máximo configurado', async () => {
    const authOperation = vi.fn().mockRejectedValue({ status: 401 });
    await expect(executeGithubRequest(authOperation, { maxRetries: 3, wait: vi.fn() }))
      .rejects.toBeInstanceOf(ExternalServiceError);
    expect(authOperation).toHaveBeenCalledOnce();

    const transient = vi.fn().mockRejectedValue({ status: 503 });
    await expect(executeGithubRequest(transient, {
      maxRetries: 2,
      wait: vi.fn().mockResolvedValue(),
      random: () => 0
    })).rejects.toBeInstanceOf(ExternalServiceError);
    expect(transient).toHaveBeenCalledTimes(3);
  });

  it('normaliza timeout e rate limit 403/429 sem carregar token', async () => {
    expect(isRetryableGithubError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableGithubError({ status: 403 })).toBe(false);
    expect(calculateGithubRetryDelay({ response: { headers: { 'retry-after': '9' } } }, 0))
      .toBe(2000);
    await expect(executeGithubRequest(
      vi.fn().mockRejectedValue({ code: 'ETIMEDOUT', message: 'token=segredo' }),
      { maxRetries: 0 }
    )).rejects.toMatchObject({ statusCode: 503, code: ERROR_CODES.EXTERNAL_SERVICE_ERROR });
    await expect(executeGithubRequest(
      vi.fn().mockRejectedValue({
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0', authorization: 'token-real' } }
      }),
      { maxRetries: 0 }
    )).rejects.toMatchObject({ statusCode: 429, code: ERROR_CODES.GITHUB_RATE_LIMITED });
    await expect(executeGithubRequest(
      vi.fn().mockRejectedValue({ status: 429, response: { headers: { token: 'token-real' } } }),
      { maxRetries: 0 }
    )).rejects.toMatchObject({ statusCode: 429, code: ERROR_CODES.GITHUB_RATE_LIMITED });
  });

  it('scanner detecta fixture controlada e ignora placeholder permitido', () => {
    const unsafe = readFileSync(
      resolve('test/fixtures/security/unsafe-secret.txt'),
      'utf8'
    );
    expect(scanText(unsafe, 'unsafe-secret.txt')).toEqual([
      { file: 'unsafe-secret.txt', line: 1, type: 'GitHub token' }
    ]);
    expect(scanText('DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"'))
      .toEqual([]);
  });
});
