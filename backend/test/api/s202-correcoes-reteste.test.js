import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

let app;
let prisma;
let sequence = 0;
const password = 'SenhaSegura123';
const OFF = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: false,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true
};

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

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const rawCursor = (text) => Buffer.from(text, 'utf8').toString('base64url');
const list = (person, query) => person.agent.get(`/api/notifications?${query}`);

async function withNotifications(count) {
  const project = await createProject(prisma);
  const owner = await register();
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: owner.user.id, role: 'MEMBER' }
  });
  for (let index = 0; index < count; index += 1)
    await prisma.notification.create({
      data: {
        recipientUserId: owner.user.id,
        projectId: project.id,
        type: 'TASK_OVERDUE',
        dedupeKey: `TASK_OVERDUE:cr${index}:2026-10-10`,
        taskTitle: `Correção do reteste ${index}`,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        createdAt: new Date(Date.UTC(2026, 8, 1, index))
      }
    });
  return owner;
}

describe('S2-02 correções do reteste — cursor só na forma canônica (S202-R06)', () => {
  it('CR-05 cursor com os bits de sobra trocados no último caractere → 400; o canônico → 200', async () => {
    const owner = await withNotifications(3);
    const canonical = rawCursor('2026-09-01T02:30:00.000Z|7');
    const last = canonical.at(-1);
    const variant = canonical.slice(0, -1) + ALPHABET[ALPHABET.indexOf(last) ^ 1];

    const accepted = await list(owner, `status=ALL&cursor=${canonical}`);
    const refused = await list(owner, `status=ALL&cursor=${variant}`);

    expect(canonical.length % 4).not.toBe(0);
    expect(Buffer.from(variant, 'base64url').toString('utf8')).toBe('2026-09-01T02:30:00.000Z|7');
    expect(accepted.status).toBe(200);
    expect(accepted.body.notifications).toHaveLength(3);
    expect([refused.status, refused.body.code]).toEqual([400, 'VALIDATION_ERROR']);
  });

  it('CR-06 cursor com um caractere a mais que decodifica para o mesmo texto → 400', async () => {
    const owner = await withNotifications(2);
    const canonical = rawCursor('2026-09-01T02:30:00.000Z|42');
    const variant = `${canonical}A`;

    const accepted = await list(owner, `status=ALL&cursor=${canonical}`);
    const refused = await list(owner, `status=ALL&cursor=${variant}`);

    expect(canonical.length % 4).toBe(0);
    expect(Buffer.from(variant, 'base64url').toString('utf8')).toBe('2026-09-01T02:30:00.000Z|42');
    expect(accepted.status).toBe(200);
    expect([refused.status, refused.body.code]).toEqual([400, 'VALIDATION_ERROR']);
  });
});

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
