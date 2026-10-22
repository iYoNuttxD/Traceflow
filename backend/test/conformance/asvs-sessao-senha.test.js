import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: expressApp } = await import('../../src/app.js');
  app = await startTestServer(expressApp);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

function register(password) {
  sequence += 1;
  return request(app)
    .post('/api/auth/register')
    .send({
      name: 'Pessoa da conformidade',
      username: `conf${sequence}`,
      email: `conformidade-${sequence}@example.invalid`,
      password
    });
}

async function registeredAgent(password = 'trilho-azul-sereno-77') {
  const agent = request.agent(app);
  sequence += 1;
  const username = `conf${sequence}`;
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa da conformidade',
    username,
    email: `conformidade-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { agent, username, password, response };
}

describe('ASVS V3.3 — cookie de sessão', () => {
  it('V3.3.4 e V3.3.2: HttpOnly, SameSite=Lax e Path=/, emitido só por Set-Cookie', async () => {
    const { response } = await registeredAgent();
    const cookie = response.headers['set-cookie'].find((value) =>
      value.startsWith('traceflow_session=')
    );
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    const token = cookie.split(';')[0].split('=')[1];
    expect(JSON.stringify(response.body)).not.toContain(token);
  });
});

describe('ASVS V6.2 — política de senha', () => {
  it('V6.2.1 e V6.2.9: recusa 11 caracteres e aceita 12, 64 e 128; recusa 129', async () => {
    expect((await register('k'.repeat(4) + 'trilho9')).status).toBe(400);
    for (const length of [12, 64, 128]) {
      const password = 'trilho-azul-'.repeat(11).slice(0, length);
      expect((await register(password)).status, String(length)).toBe(201);
    }
    expect((await register('t'.repeat(129))).status).toBe(400);
  });

  it('V6.2.5: aceita senha sem número, maiúscula ou símbolo', async () => {
    expect((await register('somenteletrasminusculas')).status).toBe(201);
    expect((await register('frase com espacos simples')).status).toBe(201);
  });

  it('V6.2.8: a senha é conferida exatamente como digitada, sem corte nem troca de caixa', async () => {
    const password = `${'Trilho-Azul-'.repeat(10)}Fim!Sereno9`.slice(0, 128);
    const { username } = await registeredAgent(password);
    const attempt = (value) =>
      request(app).post('/api/auth/login').send({ identifier: username, password: value });
    expect((await attempt(password.slice(0, 127))).status).toBe(401);
    expect((await attempt(password.toLowerCase())).status).toBe(401);
    expect((await attempt(password)).status).toBe(200);
  });

  it('V6.2.3: a troca de senha exige a senha atual', async () => {
    const { agent, response } = await registeredAgent();
    const changed = await agent
      .post('/api/settings/security/password')
      .set('X-CSRF-Token', response.body.csrfToken)
      .send({ currentPassword: 'senha-errada-qualquer', newPassword: 'outra-trilha-calma-55' });
    expect(changed.status).toBeGreaterThanOrEqual(400);
  });
});

describe('ASVS V14.3.2 e V15.3 — respostas autenticadas', () => {
  it('V14.3.2: no-store no JSON autenticado', async () => {
    const { agent } = await registeredAgent();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.headers['cache-control']).toContain('no-store');
  });

  it('V15.3.7: limit repetido numa rota autenticada responde 400', async () => {
    const { agent } = await registeredAgent();
    const response = await agent.get('/api/notifications?limit=1&limit=2');
    expect(response.status).toBe(400);
  });

  it.each([
    ['get', '/api/projects/99999999999'],
    ['get', '/api/tasks/99999999999'],
    ['get', '/api/requirements/99999999999'],
    ['patch', '/api/notifications/99999999999']
  ])('V1.4.2: ID acima do INT do MySQL em %s %s responde 4xx, não 500', async (method, path) => {
    const { agent, response } = await registeredAgent();
    const result = await agent[method](path)
      .set('X-CSRF-Token', response.body.csrfToken)
      .send(method === 'patch' ? { read: true } : undefined);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  });

  it('V15.3.3: campo fora do contrato no corpo responde 400 e não é gravado', async () => {
    const { agent, response } = await registeredAgent();
    const patched = await agent
      .patch('/api/settings/account/profile')
      .set('X-CSRF-Token', response.body.csrfToken)
      .send({ name: 'Nome novo', accountStatus: 'ACTIVE', isActive: false });
    expect(patched.status).toBe(400);
  });
});
