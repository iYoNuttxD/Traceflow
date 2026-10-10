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

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(projectId, role = 'MEMBER', target = app) {
  sequence += 1;
  const agent = request.agent(target);
  const response = await agent.post('/api/auth/register').send({
    name: `Bateria S2-02 ${sequence}`,
    username: `s202bat${sequence}`,
    email: `s202-bat-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(target)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId) await join(projectId, response.body.user.id, role);
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

const join = (projectId, userId, role = 'MEMBER') =>
  prisma.projectMembership.create({ data: { projectId, userId, role } });

async function notify(recipient, projectId, overrides = {}) {
  sequence += 1;
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${sequence}:2026-10-10`,
      taskTitle: `Tarefa da bateria ${sequence}`,
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      ...overrides
    }
  });
}

const ids = (body) => body.notifications.map((item) => item.id);
const rawCursor = (text) => Buffer.from(text, 'utf8').toString('base64url');
const cursorOf = (row) => rawCursor(`${row.createdAt.toISOString()}|${row.id}`);

async function walk(person, status, limit, afterFirstPage = async () => {}) {
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const query = `status=${status}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
    const response = await person.agent.get(`/api/notifications?${query}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    seen.push(...ids(response.body));
    cursor = response.body.nextCursor;
    pages += 1;
    if (pages === 1) await afterFirstPage();
  } while (cursor && pages < 50);
  return seen;
}

describe('S2-02 correções — cursor estável na central (S202-A01)', () => {
  it('C2-01 H1: marcar a primeira página como lida não esconde as não lidas seguintes', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const created = [];
    for (let index = 0; index < 5; index += 1)
      created.push(
        await notify(owner, project.id, { createdAt: new Date(Date.UTC(2026, 9, 1, index)) })
      );
    const [n1, n2, n3, n4, n5] = created;

    const first = await owner.agent.get('/api/notifications?limit=2');
    for (const item of first.body.notifications)
      await owner.mutate('patch', `/api/notifications/${item.id}`).send({ read: true });
    const second = await owner.agent.get(
      `/api/notifications?limit=2&cursor=${first.body.nextCursor}`
    );
    const third = await owner.agent.get(
      `/api/notifications?limit=2&cursor=${second.body.nextCursor}`
    );

    expect(ids(first.body)).toEqual([n5.id, n4.id]);
    expect(first.body.pagination).toMatchObject({ page: 1, limit: 2, total: 5 });
    expect(ids(second.body)).toEqual([n3.id, n2.id]);
    expect(second.body.pagination).toMatchObject({ page: null, limit: 2, total: 3 });
    expect(second.body.unreadCount).toBe(3);
    expect(ids(third.body)).toEqual([n1.id]);
    expect(third.body.nextCursor).toBeNull();
  });

  it('C2-02 empate de createdAt desempata por id, e a notificação nova entre páginas não se repete', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const tiedAt = new Date('2026-10-01T12:00:00.000Z');
    const tied = [];
    for (let index = 0; index < 4; index += 1)
      tied.push(await notify(owner, project.id, { createdAt: tiedAt }));
    const expected = tied.map((row) => row.id).sort((a, b) => b - a);

    expect(await walk(owner, 'UNREAD', 1)).toEqual(expected);
    expect(await walk(owner, 'ALL', 1)).toEqual(expected);

    let newer;
    const walked = await walk(owner, 'ALL', 2, async () => {
      newer = await notify(owner, project.id, { createdAt: new Date('2026-10-02T00:00:00.000Z') });
    });
    const fresh = await owner.agent.get('/api/notifications?status=ALL&limit=1');

    expect(walked).toEqual(expected);
    expect(ids(fresh.body)).toEqual([newer.id]);
  });

  it.each([
    ['caractere fora do base64url', 'abc!'],
    ['conteúdo fora do formato', rawCursor('lixo')],
    ['data que não existe', rawCursor('2026-02-30T00:00:00.000Z|5')],
    ['id zero', rawCursor('2026-10-01T00:00:00.000Z|0')],
    ['id acima do INT', rawCursor('2026-10-01T00:00:00.000Z|2147483648')],
    ['texto longo demais', 'A'.repeat(129)],
    ['valor vazio', '']
  ])('C2-03 cursor com %s → 400, nunca 500', async (_, cursor) => {
    const owner = await register();

    const response = await owner.agent.get(
      `/api/notifications?cursor=${encodeURIComponent(cursor)}`
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('C2-03 cursor com page, ou repetido, → 400', async () => {
    const owner = await register();
    const cursor = rawCursor('2026-10-01T00:00:00.000Z|5');

    const both = await owner.agent.get(`/api/notifications?page=1&cursor=${cursor}`);
    const repeated = await owner.agent.get(`/api/notifications?cursor=${cursor}&cursor=${cursor}`);

    expect([both.status, repeated.status]).toEqual([400, 400]);
    expect(both.body.code).toBe('VALIDATION_ERROR');
  });

  it('C2-03 cursor feito com a notificação de outra pessoa só posiciona a lista do próprio usuário', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const other = await register(project.id);
    const own = [];
    for (const hour of [3, 4, 6])
      own.push(
        await notify(owner, project.id, { createdAt: new Date(Date.UTC(2026, 9, 1, hour)) })
      );
    const foreign = await notify(other, project.id, {
      createdAt: new Date(Date.UTC(2026, 9, 1, 5))
    });

    const response = await owner.agent.get(
      `/api/notifications?status=ALL&cursor=${cursorOf(foreign)}`
    );

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual([own[1].id, own[0].id]);
  });
});
