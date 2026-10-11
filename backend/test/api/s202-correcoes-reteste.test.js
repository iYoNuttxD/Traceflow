import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let sequence = 0;
const password = 'SenhaSegura123';
const OFF = { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false };

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await cleanTestDatabase(prisma);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register() {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Correção do reteste ${sequence}`,
    username: `s202crapi${sequence}`,
    email: `s202-crapi-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

describe('S2-02 correções do reteste — contrato do PUT ocupado (S202-R01)', () => {
  it('CR-04 o 409 tem code, requestId, JSON com charset e no-store', async () => {
    const owner = await register();
    let release;
    const holding = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${owner.user.id} FOR UPDATE`;
        await new Promise((resolve) => {
          release = resolve;
          setTimeout(resolve, 7000);
        });
      },
      { timeout: 15000, maxWait: 5000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const response = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: OFF });
    release?.();
    await holding;

    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body).toEqual({
      message: expect.any(String),
      code: 'NOTIFICATION_PREFERENCES_BUSY',
      requestId: expect.any(String)
    });
    expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
    expect(response.headers['cache-control']).toMatch(/no-store/);
  }, 30000);
});
