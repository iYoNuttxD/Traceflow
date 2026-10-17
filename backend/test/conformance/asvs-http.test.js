import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { startTestServer } from '../helpers/http-server.js';

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

async function server(overrides) {
  return request(
    await startTestServer(
      createApp({ logger: silentLogger, securityConfig: securityConfig(overrides) })
    )
  );
}

async function responsesOfEveryKind() {
  const api = await server();
  const limited = await server({ rateLimitGlobalMax: 1 });
  await limited.get('/api/projects');
  return {
    200: await api.get('/health'),
    400: await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"x":'),
    401: await api.get('/api/projects'),
    403: await api.get('/health').set('Origin', 'http://outra-origem.test'),
    '404 fora de /api': await api.get('/caminho-inexistente'),
    413: await api
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ identifier: 'x'.repeat(2048), password: 'senha' }),
    415: await api.post('/api/auth/login').set('Content-Type', 'text/plain').send('identifier=x'),
    429: await limited.get('/api/projects')
  };
}

describe('ASVS V3.4 e V4.1 — cabeçalhos em todas as classes de resposta', () => {
  it('cada classe de resposta tem o status esperado', async () => {
    const responses = await responsesOfEveryKind();
    for (const [kind, response] of Object.entries(responses)) {
      expect(String(response.status), kind).toBe(kind.split(' ')[0]);
    }
  });

  it('V3.4.4 nosniff, V3.4.5 Referrer-Policy e sem X-Powered-By em todas', async () => {
    for (const [kind, response] of Object.entries(await responsesOfEveryKind())) {
      expect(response.headers['x-content-type-options'], kind).toBe('nosniff');
      expect(response.headers['referrer-policy'], kind).toBe('no-referrer');
      expect(response.headers['x-powered-by'], kind).toBeUndefined();
    }
  });

  it('V3.4.3 e V3.4.6 CSP com object-src e frame-ancestors none em todas', async () => {
    for (const [kind, response] of Object.entries(await responsesOfEveryKind())) {
      const policy = response.headers['content-security-policy'];
      expect(policy, kind).toContain("default-src 'none'");
      expect(policy, kind).toContain("object-src 'none'");
      expect(policy, kind).toContain("frame-ancestors 'none'");
    }
  });

  it('V4.1.1 Content-Type com charset em toda resposta com corpo', async () => {
    for (const [kind, response] of Object.entries(await responsesOfEveryKind())) {
      expect(response.headers['content-type'], kind).toMatch(/^application\/json; charset=utf-8$/i);
    }
  });

  it('V14.3.2 no-store nas respostas da API', async () => {
    const responses = await responsesOfEveryKind();
    for (const kind of ['400', '401', '413', '415', '429']) {
      expect(responses[kind].headers['cache-control'], kind).toContain('no-store');
    }
  });
});

describe('ASVS V3.4.1 — HSTS com a configuração de produção', () => {
  it('um ano, subdomínios incluídos', async () => {
    const response = await (await server({ isProduction: true })).get('/health');
    const hsts = response.headers['strict-transport-security'];
    expect(Number(/max-age=(\d+)/.exec(hsts)[1])).toBeGreaterThanOrEqual(31536000);
    expect(hsts).toContain('includeSubDomains');
  });
});

describe('ASVS V3.4.2 e V3.5 — CORS', () => {
  it('origem fora da lista recebe 403 sem Access-Control-Allow-Origin', async () => {
    const response = await (
      await server()
    )
      .get('/api/projects')
      .set('Origin', 'http://outra-origem.test');
    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('origem da lista recebe o valor exato, nunca o curinga', async () => {
    const response = await (await server()).get('/health').set('Origin', 'http://frontend.test');
    expect(response.headers['access-control-allow-origin']).toBe('http://frontend.test');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('formulário entre sites não chega ao login: corpo que não é JSON responde 415', async () => {
    const response = await (
      await server()
    )
      .post('/api/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('identifier=vitima&password=senha');
    expect(response.status).toBe(415);
  });
});

describe('ASVS V13.4.4 — método TRACE', () => {
  it.each(['/api/projects', '/health', '/caminho-inexistente'])(
    'TRACE %s não ecoa a requisição nem responde 200',
    async (path) => {
      const response = await (
        await server()
      )
        .trace(path)
        .set('X-Eco-Sonda', 'valor-que-nao-pode-voltar');
      expect(response.status).not.toBe(200);
      expect(JSON.stringify(response.body)).not.toContain('valor-que-nao-pode-voltar');
      expect(response.text || '').not.toContain('valor-que-nao-pode-voltar');
    }
  );
});

describe('ASVS V15.3.7 e V15.3.6 — parâmetros repetidos e chave __proto__', () => {
  it('token repetido na confirmação pública responde 400, não 500', async () => {
    const response = await (
      await server()
    ).get('/api/settings/account/email-change/confirm?token=a&token=b');
    expect(response.status).toBe(400);
  });

  it('__proto__ no corpo do login não polui o protótipo', async () => {
    const response = await (
      await server()
    )
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identifier":"pessoa","password":"senha-qualquer-1","__proto__":{"poluido":true}}');
    expect(response.status).toBeLessThan(500);
    expect({}.poluido).toBeUndefined();
  });
});
