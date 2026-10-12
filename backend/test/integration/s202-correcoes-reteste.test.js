import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let app;
let sequence = 0;
const password = 'SenhaSegura123';
const OFF = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: false,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true
};
const ON = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true
};

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
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

async function account() {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Correção do reteste ${sequence}`,
    username: `s202crint${sequence}`,
    email: `s202-crint-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    user: response.body.user,
    agent,
    put: (preferences) =>
      agent
        .put('/api/settings/notifications')
        .set('X-CSRF-Token', response.body.csrfToken)
        .send({ preferences })
  };
}

function holdUser(userId, ms) {
  let release;
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      await new Promise((resolve) => {
        release = resolve;
        setTimeout(resolve, ms);
      });
    },
    { timeout: ms + 8000, maxWait: 5000 }
  );
  return {
    ready: new Promise((resolve) => setTimeout(resolve, 300)),
    release: async () => {
      release?.();
      await done;
    }
  };
}

const audits = (userId) =>
  prisma.auditEvent.findMany({
    where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: userId },
    orderBy: { id: 'asc' }
  });

function replay(events) {
  let state = { ...ON };
  for (const event of events) {
    const changed = event.metadataJson.changedTypes.split(',');
    state = Object.fromEntries(
      Object.entries(state).map(([type, value]) => [type, changed.includes(type) ? !value : value])
    );
  }
  return state;
}

describe('S2-02 correções do reteste — PUT de preferências com espera limitada (S202-R01)', () => {
  it('CR-01 com a conta bloqueada o PUT responde 409 sem gravar; liberado, o mesmo PUT é aceito e audita uma vez', async () => {
    const owner = await account();
    const lock = holdUser(owner.user.id, 7000);
    await lock.ready;

    const busy = await owner.put(OFF);
    const auditsWhileBusy = (await audits(owner.user.id)).length;
    await lock.release();
    const accepted = await owner.put(OFF);
    const current = await owner.agent.get('/api/settings/notifications');

    expect([busy.status, busy.body.code]).toEqual([409, 'NOTIFICATION_PREFERENCES_BUSY']);
    expect(auditsWhileBusy).toBe(0);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(current.body.preferences).toEqual(OFF);
    expect(await audits(owner.user.id)).toHaveLength(1);
  }, 30000);

  it('CR-02 vinte PUT simultâneos da mesma conta pela API terminam sem 409 e com a trilha reaplicável ao estado final', async () => {
    const owner = await account();

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) => owner.put(index % 2 ? ON : OFF))
    );
    const final = await owner.agent.get('/api/settings/notifications');

    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    expect(replay(await audits(owner.user.id))).toEqual(final.body.preferences);
  }, 30000);

  it('CR-03 o 409 traz mensagem em português e nenhum detalhe técnico', async () => {
    const owner = await account();
    const lock = holdUser(owner.user.id, 5000);
    await lock.ready;

    const busy = await owner.put(OFF);
    await lock.release();

    expect(busy.status).toBe(409);
    expect(busy.body.message).toMatch(/preferências/i);
    expect(JSON.stringify(busy.body)).not.toMatch(
      /prisma|P20\d\d|NOWAIT|3572|1205|SELECT|FOR UPDATE|stack|lock/i
    );
  }, 30000);
});
