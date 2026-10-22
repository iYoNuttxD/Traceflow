import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';
import { slowQuery } from '../helpers/slow-statement.js';

const password = 'SenhaSegura123';
const TIMEOUT_MESSAGE =
  'A operação demorou mais que o permitido e foi desfeita. Tente de novo em instantes.';

let app;
let prisma;
let auditRepository;
let disconnectRecoveryPrisma;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ disconnectRecoveryPrisma } = await import('../../src/database/recovery-prisma.js'));
  ({ auditRepository } = await import('../../src/modules/audit/audit.repository.js'));
  const { default: expressApp } = await import('../../src/app.js');
  app = await startTestServer(expressApp);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
  await disconnectRecoveryPrisma();
});

async function account(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa prazo ${sequence}`,
    username: `s202f33api${sequence}`,
    email: `s202-f33-api-${sequence}@example.invalid`,
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

function injectIntoCommentTransaction(work) {
  const original = auditRepository.create;
  let injected = false;
  vi.spyOn(auditRepository, 'create').mockImplementation(async (data, client) => {
    if (!injected && data?.action === 'TASK_COMMENT_CREATED') {
      injected = true;
      await work(client);
    }
    return original.call(auditRepository, data, client);
  });
}

describe('S202-F33 — Fase 2: resposta HTTP do prazo próprio', () => {
  it('F2-01 A recebe 503 OPERATION_TIMEOUT sem efeito, B de outra conta segue com 200, e repetir depois funciona', async () => {
    const project = await createProject(prisma);
    const author = await account(project.id);
    const bystander = await account(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: author.user.id });
    injectIntoCommentTransaction((tx) => slowQuery(tx));

    const started = performance.now();
    const response = await author
      .mutate('post', `/api/tasks/${task.id}/comments`)
      .send({ content: 'Comentário lento' });
    const ms = Math.round(performance.now() - started);

    expect([response.status, response.body.code]).toEqual([503, 'OPERATION_TIMEOUT']);
    expect(response.body.message).toBe(TIMEOUT_MESSAGE);
    expect(response.headers['retry-after']).toBe('5');
    expect(response.body.requestId).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toMatch(
      /prisma|P20\d\d|1317|SELECT|interrupted|TRANSACTION_DEADLINE|stack/i
    );
    expect(ms).toBeLessThan(6000);
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(0);
    for (const path of ['/api/notifications/unread-count', '/api/projects']) {
      const other = await bystander.agent.get(path);
      expect([path, other.status, other.body.code]).toEqual([path, 200, undefined]);
    }

    const retried = await author
      .mutate('post', `/api/tasks/${task.id}/comments`)
      .send({ content: 'Comentário' });
    expect(retried.status).toBe(201);
    expect(await prisma.taskComment.count({ where: { taskId: task.id } })).toBe(1);
  }, 60000);

  it('F2-05 pânico do motor numa requisição: 500 para quem a fez, e /health/live e /health/ready passam a 503', async () => {
    const project = await createProject(prisma);
    const author = await account(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: author.user.id });
    expect((await request(app).get('/health/live')).status).toBe(200);
    injectIntoCommentTransaction(async () => {
      throw Object.assign(new Error('PANIC: Could not figure out an ID in create'), {
        name: 'PrismaClientRustPanicError'
      });
    });

    const response = await author
      .mutate('post', `/api/tasks/${task.id}/comments`)
      .send({ content: 'Comentário' });

    expect([response.status, response.body.code]).toEqual([500, 'INTERNAL_ERROR']);
    expect(JSON.stringify(response.body)).not.toMatch(/panic|figure out/i);
    const live = await request(app).get('/health/live');
    expect([live.status, live.body.status]).toEqual([503, 'not_live']);
    expect((await request(app).get('/health/ready')).status).toBe(503);
  }, 60000);
});
