import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const password = 'SenhaSegura123';

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

async function account(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa espera de trava ${sequence}`,
    username: `s202f29api${sequence}`,
    email: `s202-f29-api-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

function hold(lock, maxMs) {
  let release;
  const released = new Promise((resolve) => {
    release = resolve;
  });
  let ready;
  const locked = new Promise((resolve) => {
    ready = resolve;
  });
  const done = prisma.$transaction(
    async (tx) => {
      await lock(tx);
      ready();
      await Promise.race([released, new Promise((resolve) => setTimeout(resolve, maxMs))]);
    },
    { timeout: 30000, maxWait: 5000 }
  );
  return { locked, release: () => release(), done };
}

async function timed(send) {
  const started = performance.now();
  const response = await send();
  return { response, ms: Math.round(performance.now() - started) };
}

async function underLock(lock, holdMs, send, bystander) {
  const holder = hold(lock, holdMs);
  await holder.locked;
  let attempt;
  let other;
  try {
    attempt = await timed(send);
    other = await bystander.agent.get('/api/notifications/unread-count');
  } finally {
    holder.release();
    await holder.done;
  }
  return { attempt, other };
}

const lockProject = (projectId) => (tx) =>
  tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;

describe('S202-F29 — Fase 1: a espera de trava não passa do prazo da transação', () => {
  it('F1-01 prazo de 5 s: comentar com o projeto travado falha rápido, e outra conta não é atingida', async () => {
    const project = await createProject(prisma);
    const author = await account(project.id);
    const bystander = await account();
    const task = await createTask(prisma, project.id, { responsibleUserId: author.user.id });

    const { attempt, other } = await underLock(
      lockProject(project.id),
      7000,
      () => author.mutate('post', `/api/tasks/${task.id}/comments`).send({ content: 'Comentário' }),
      bystander
    );

    expect(attempt.response.status).not.toBe(201);
    expect(attempt.ms).toBeLessThan(3500);
    expect([other.status, other.body.code]).toEqual([200, undefined]);
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(0);
  }, 30000);

  it('F1-02 prazo de 15 s: mudar o status com o projeto travado falha antes do prazo, e outra conta não é atingida', async () => {
    const project = await createProject(prisma);
    const owner = await account(project.id, 'OWNER');
    const bystander = await account();
    const task = await createTask(prisma, project.id, { responsibleUserId: owner.user.id });

    const { attempt, other } = await underLock(
      lockProject(project.id),
      17000,
      () => owner.mutate('patch', `/api/tasks/${task.id}/status`).send({ status: 'EM_ANDAMENTO' }),
      bystander
    );

    expect(attempt.response.status).not.toBe(200);
    expect(attempt.ms).toBeLessThan(6500);
    expect([other.status, other.body.code]).toEqual([200, undefined]);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
  }, 60000);

  it('F1-03 espera implícita: marcar como lida uma notificação com a linha travada falha rápido', async () => {
    const project = await createProject(prisma);
    const recipient = await account(project.id);
    const bystander = await account();
    const notification = await prisma.notification.create({
      data: {
        recipientUserId: recipient.user.id,
        projectId: project.id,
        type: 'TASK_OVERDUE',
        dedupeKey: `TASK_OVERDUE:espera:${project.id}`,
        taskTitle: 'Tarefa vencida'
      }
    });

    const { attempt, other } = await underLock(
      (tx) => tx.$queryRaw`SELECT id FROM Notification WHERE id = ${notification.id} FOR UPDATE`,
      7000,
      () => recipient.mutate('patch', `/api/notifications/${notification.id}`).send({ read: true }),
      bystander
    );

    expect(attempt.response.status).not.toBe(200);
    expect(attempt.ms).toBeLessThan(3500);
    expect([other.status, other.body.code]).toEqual([200, undefined]);
    expect(
      (await prisma.notification.findUnique({ where: { id: notification.id } })).readAt
    ).toBeNull();
  }, 30000);

  it('F1-04 Serializable: entrar pelo código de acesso com o projeto travado falha rápido', async () => {
    const accessCode = `TRC-${'A1B2C3D4'.repeat(4)}`;
    const project = await createProject(prisma, { accessCode });
    const visitor = await account();
    const bystander = await account();

    const { attempt, other } = await underLock(
      lockProject(project.id),
      7000,
      () => visitor.mutate('post', '/api/projects/join').send({ accessCode }),
      bystander
    );

    expect(attempt.response.status).not.toBe(201);
    expect(attempt.ms).toBeLessThan(3500);
    expect([other.status, other.body.code]).toEqual([200, undefined]);
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, userId: visitor.user.id }
      })
    ).toBe(0);
  }, 30000);
});
