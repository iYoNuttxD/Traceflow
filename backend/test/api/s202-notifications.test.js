import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let app;
let prisma;
let createApp;
let env;
let sequence = 0;
const password = 'SenhaSegura123';

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app, createApp } = await import('../../src/app.js'));
  ({ env } = await import('../../src/config/env.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(projectId, role = 'MEMBER', target = app) {
  sequence += 1;
  const agent = request.agent(target);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa S2-02 ${sequence}`,
    username: `s202api${sequence}`,
    email: `s202-api-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(target)
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

async function notify(recipient, projectId, overrides = {}) {
  sequence += 1;
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${sequence}:2026-10-10`,
      taskTitle: `Tarefa notificada ${sequence}`,
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      ...overrides
    }
  });
}

const routes = [
  ['get', '/api/notifications'],
  ['get', '/api/notifications/unread-count'],
  ['patch', '/api/notifications/1'],
  ['post', '/api/notifications/read-all'],
  ['get', '/api/settings/notifications'],
  ['put', '/api/settings/notifications']
];

describe('S2-02 API: autenticação, CSRF e cabeçalhos', () => {
  it('as seis rotas exigem sessão', async () => {
    for (const [method, path] of routes)
      expect((await request(app)[method](path).send({})).status, path).toBe(401);
  });

  it('as mutações exigem CSRF', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);

    expect(
      (await owner.agent.patch(`/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(403);
    expect((await owner.agent.post('/api/notifications/read-all').send({})).status).toBe(403);
    expect(
      (
        await owner.agent
          .put('/api/settings/notifications')
          .send({ preferences: { TASK_STATUS_CHANGED: false, TASK_OVERDUE: true } })
      ).status
    ).toBe(403);
    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });

  it('responde JSON com charset e sem cache nas rotas novas', async () => {
    const owner = await register();
    for (const path of [
      '/api/notifications',
      '/api/notifications/unread-count',
      '/api/settings/notifications',
      '/api/notifications/abc'
    ]) {
      const method = path.endsWith('abc') ? 'patch' : 'get';
      const response = await owner
        .mutate(method, path)
        .send(method === 'patch' ? { read: true } : undefined);
      expect(response.headers['content-type'], path).toMatch(/^application\/json; charset=utf-8/);
      expect(response.headers['cache-control'], path).toMatch(/no-store/);
    }
  });
});

describe('S2-02 API: lista, contador e DTO (C3)', () => {
  it('lista só as não lidas por padrão, em ordem, com paginação e contador coerente', async () => {
    const project = await createProject(prisma, { name: 'Projeto de notificação' });
    const owner = await register(project.id);
    const old = await notify(owner, project.id, { createdAt: new Date('2026-10-01T10:00:00Z') });
    const recent = await notify(owner, project.id, { createdAt: new Date('2026-10-02T10:00:00Z') });
    const read = await notify(owner, project.id, {
      createdAt: new Date('2026-10-03T10:00:00Z'),
      readAt: new Date('2026-10-04T10:00:00Z')
    });

    const unread = await owner.agent.get('/api/notifications');
    expect(unread.status).toBe(200);
    expect(unread.body.notifications.map((item) => item.id)).toEqual([recent.id, old.id]);
    expect(unread.body.unreadCount).toBe(2);
    expect(unread.body.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });

    const all = await owner.agent.get('/api/notifications?status=ALL&limit=2&page=1');
    expect(all.body.notifications.map((item) => item.id)).toEqual([read.id, recent.id]);
    expect(all.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    const second = await owner.agent.get('/api/notifications?status=ALL&limit=2&page=2');
    expect(second.body.notifications.map((item) => item.id)).toEqual([old.id]);

    expect((await owner.agent.get('/api/notifications/unread-count')).body).toEqual({
      unreadCount: 2
    });
  });

  it('o DTO traz só o necessário, com contexto por tipo e link do Kanban', async () => {
    const project = await createProject(prisma, { name: 'Projeto do DTO' });
    const owner = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    const task = await createTask(prisma, project.id, { title: 'Tarefa viva' });
    await notify(owner, project.id, {
      type: 'TASK_STATUS_CHANGED',
      dedupeKey: 'TASK_STATUS_CHANGED:movement:1',
      taskId: task.id,
      taskTitle: 'Tarefa viva',
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      actorUserId: actor.user.id,
      dueDate: null,
      createdAt: new Date('2026-10-02T10:00:00Z')
    });
    await notify(owner, project.id, {
      taskId: null,
      taskTitle: 'Tarefa excluída',
      createdAt: new Date('2026-10-01T10:00:00Z')
    });

    const { body } = await owner.agent.get('/api/notifications');
    const [status, overdue] = body.notifications;
    expect(Object.keys(status).sort()).toEqual(
      ['context', 'createdAt', 'id', 'link', 'project', 'readAt', 'task', 'type'].sort()
    );
    expect(status).toMatchObject({
      type: 'TASK_STATUS_CHANGED',
      readAt: null,
      project: { id: project.id, name: 'Projeto do DTO' },
      task: { id: task.id, code: `TASK-${task.id}`, title: 'Tarefa viva', available: true },
      context: {
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        actor: { id: actor.user.id, name: actor.user.name }
      },
      link: `/projects/${project.id}/kanban?task=${task.id}`
    });
    expect(Object.keys(status.context.actor).sort()).toEqual(['id', 'name']);
    expect(overdue).toMatchObject({
      type: 'TASK_OVERDUE',
      task: { id: null, code: null, title: 'Tarefa excluída', available: false },
      context: { dueDate: '2026-10-10' },
      link: null
    });
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'dedupeKey',
      'recipientUserId',
      'email',
      actor.user.email,
      owner.user.email
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it('valida a consulta e nunca responde 500 a entradas malformadas', async () => {
    const owner = await register();
    for (const query of [
      'limit=101',
      'limit=0',
      'page=0',
      'status=LIDAS',
      'status=UNREAD&status=ALL',
      `userId=${owner.user.id}`,
      'recipientUserId=1'
    ])
      expect((await owner.agent.get(`/api/notifications?${query}`)).status, query).toBe(400);
    expect((await owner.agent.get(`/api/notifications/unread-count?userId=1`)).status).toBe(400);
    expect((await owner.agent.get('/api/settings/notifications?userId=1')).status).toBe(400);
    for (const id of ['abc', '0', '-1', '1.5', '99999999999', '2147483648'])
      expect(
        (await owner.mutate('patch', `/api/notifications/${id}`).send({ read: true })).status,
        id
      ).toBe(400);
    for (const path of ['/api/notifications/', '/api/notifications/unread-count/'])
      expect((await owner.agent.get(path)).status, path).toBeLessThan(500);
  });

  it('listar não marca nada como lido', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);

    await owner.agent.get('/api/notifications?status=ALL');
    await owner.agent.get('/api/notifications/unread-count');

    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });
});

describe('S2-02 API: leitura (C3)', () => {
  it('marca como lida, preserva o primeiro instante e volta a não lida', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);
    const path = `/api/notifications/${row.id}`;

    const first = await owner.mutate('patch', path).send({ read: true });
    expect(first.status).toBe(200);
    expect(first.body.notification.readAt).toEqual(expect.any(String));
    const again = await owner.mutate('patch', path).send({ read: true });
    expect(again.body.notification.readAt).toBe(first.body.notification.readAt);
    expect((await owner.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);

    const unread = await owner.mutate('patch', path).send({ read: false });
    expect(unread.body.notification.readAt).toBeNull();
    expect((await owner.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(1);
  });

  it('o corpo é estrito: só read booleano', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);
    const path = `/api/notifications/${row.id}`;

    for (const body of [
      {},
      { read: 'true' },
      { read: 1 },
      { read: true, readAt: '2020-01-01T00:00:00Z' },
      { read: true, userId: 1 },
      { read: true, recipientUserId: 1 }
    ])
      expect((await owner.mutate('patch', path).send(body)).status, JSON.stringify(body)).toBe(400);
    expect((await prisma.notification.findUnique({ where: { id: row.id } })).readAt).toBeNull();
  });

  it('marcar todas afeta só as não lidas visíveis do próprio usuário', async () => {
    const project = await createProject(prisma);
    const hiddenProject = await createProject(prisma);
    const owner = await register(project.id);
    const other = await register(project.id);
    await prisma.projectMembership.create({
      data: { projectId: hiddenProject.id, userId: owner.user.id, role: 'MEMBER', isActive: false }
    });
    const mine = [await notify(owner, project.id), await notify(owner, project.id)];
    const hidden = await notify(owner, hiddenProject.id);
    const theirs = await notify(other, project.id);

    const response = await owner.mutate('post', '/api/notifications/read-all').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updated: 2 });
    for (const row of mine)
      expect(
        (await prisma.notification.findUnique({ where: { id: row.id } })).readAt
      ).not.toBeNull();
    expect((await prisma.notification.findUnique({ where: { id: hidden.id } })).readAt).toBeNull();
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readAt).toBeNull();
    expect(
      (await owner.mutate('post', '/api/notifications/read-all').send({ all: true })).status
    ).toBe(400);
  });
});

describe('S2-02 API: somente o destinatário vê (C6, D9)', () => {
  it('id de outra pessoa responde 404 igual ao inexistente, e o 404 fica no log', async () => {
    const logged = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const observed = await startTestServer(createApp({ logger: logged }));
    const project = await createProject(prisma);
    const owner = await register(project.id, 'MEMBER', observed);
    const other = await register(project.id);
    const theirs = await notify(other, project.id);
    const errors = logged.error;

    const foreign = await owner
      .mutate('patch', `/api/notifications/${theirs.id}`)
      .send({ read: true });
    const missing = await owner
      .mutate('patch', '/api/notifications/2147483647')
      .send({ read: true });

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body.code).toBe('NOTIFICATION_NOT_FOUND');
    expect({ code: foreign.body.code, message: foreign.body.message }).toEqual({
      code: missing.body.code,
      message: missing.body.message
    });
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readAt).toBeNull();
    expect((await owner.agent.get('/api/notifications?status=ALL')).body.notifications).toEqual([]);
    expect(errors).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ statusCode: 404, errorCode: 'NOTIFICATION_NOT_FOUND' })
    );
  });

  it('perder a membership oculta sem apagar, e voltar ao projeto exibe de novo', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);
    const membership = { projectId_userId: { projectId: project.id, userId: owner.user.id } };

    await prisma.projectMembership.update({ where: membership, data: { isActive: false } });
    expect((await owner.agent.get('/api/notifications')).body).toMatchObject({
      notifications: [],
      unreadCount: 0
    });
    expect((await owner.agent.get('/api/notifications/unread-count')).body.unreadCount).toBe(0);
    expect(
      (await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: true })).status
    ).toBe(404);
    expect(await prisma.notification.count({ where: { id: row.id } })).toBe(1);

    await prisma.projectMembership.update({ where: membership, data: { isActive: true } });
    expect((await owner.agent.get('/api/notifications')).body.notifications).toHaveLength(1);
  });

  it('projeto excluído oculta as notificações', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await notify(owner, project.id);

    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });

    expect((await owner.agent.get('/api/notifications')).body.unreadCount).toBe(0);
  });

  it('a notificação criada por uma mudança real de status chega só ao responsável', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    const bystander = await register(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });

    const moved = await actor
      .mutate('patch', `/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });

    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const list = (await responsible.agent.get('/api/notifications')).body.notifications;
    expect(list).toHaveLength(1);
    expect(list[0].context.actor).toEqual({ id: actor.user.id, name: actor.user.name });
    expect((await bystander.agent.get('/api/notifications')).body.notifications).toEqual([]);
    expect((await actor.agent.get('/api/notifications')).body.notifications).toEqual([]);
  });
});

describe('S2-02 API: preferências (D7)', () => {
  it('vêm ligadas por padrão e persistem o PUT', async () => {
    const owner = await register();

    expect((await owner.agent.get('/api/settings/notifications')).body).toEqual({
      preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true }
    });
    const saved = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false } });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false } });
    expect((await owner.agent.get('/api/settings/notifications')).body).toEqual(saved.body);
  });

  it('o PUT é estrito e recusa chaves fora do enum', async () => {
    const owner = await register();
    for (const body of [
      {},
      { preferences: { TASK_STATUS_CHANGED: true } },
      { preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: 'false' } },
      { preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true, ISSUE_EVENT: true } },
      { preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true }, userId: 1 },
      JSON.parse(
        '{"preferences":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"__proto__":{"admin":true}}}'
      ),
      JSON.parse(
        '{"preferences":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"constructor":{"x":1}}}'
      )
    ])
      expect(
        (await owner.mutate('put', '/api/settings/notifications').send(body)).status,
        JSON.stringify(body)
      ).toBe(400);
    expect(await prisma.notificationPreference.count()).toBe(0);
  });

  it('audita só a mudança, com os tipos alterados e nada mais', async () => {
    const owner = await register();
    const put = (preferences) =>
      owner.mutate('put', '/api/settings/notifications').send({ preferences });

    await put({ TASK_STATUS_CHANGED: true, TASK_OVERDUE: false });
    await put({ TASK_STATUS_CHANGED: true, TASK_OVERDUE: false });

    const events = await prisma.auditEvent.findMany({
      where: { action: 'NOTIFICATION_PREFERENCES_UPDATED' }
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: owner.user.id,
      resourceType: 'NotificationPreference',
      metadataJson: { changedTypes: 'TASK_OVERDUE' }
    });
  });
});

describe('S2-02 API: limitador de leitura (V2.4.1)', () => {
  it('as leituras novas entram no limitador autenticado e respondem 429 com Retry-After', async () => {
    const limited = await startTestServer(
      createApp({ securityConfig: { ...env, rateLimitReadBurstMax: 2 } })
    );
    for (const path of [
      '/api/notifications',
      '/api/notifications/unread-count',
      '/api/settings/notifications'
    ]) {
      const person = await register(undefined, 'MEMBER', limited);
      const statuses = [];
      for (let index = 0; index < 3; index += 1)
        statuses.push((await person.agent.get(path)).status);
      expect(statuses, path).toEqual([200, 200, 429]);
      const blocked = await person.agent.get(path);
      expect(blocked.headers['retry-after'], path).toBeDefined();
    }
  });
});

function readStoredJsonFiles(zip) {
  const files = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const filenameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + filenameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + filenameLength).toString('utf8');
    files[name] = JSON.parse(zip.subarray(contentStart, contentStart + size).toString('utf8'));
    offset = contentStart + size;
  }
  return files;
}

function parseBinary(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('S2-02 API: exportação do titular (D13)', () => {
  it('inclui as preferências e as notificações dos projetos com acesso atual', async () => {
    const project = await createProject(prisma, { name: 'Projeto exportado' });
    const former = await createProject(prisma, { name: 'Projeto antigo' });
    const owner = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    await prisma.projectMembership.create({
      data: { projectId: former.id, userId: owner.user.id, role: 'MEMBER', isActive: false }
    });
    const visible = await notify(owner, project.id, {
      type: 'TASK_STATUS_CHANGED',
      dedupeKey: 'TASK_STATUS_CHANGED:movement:7',
      fromStatus: 'A_FAZER',
      toStatus: 'CONCLUIDO',
      actorUserId: actor.user.id,
      dueDate: null,
      readAt: new Date('2026-10-09T10:00:00.000Z')
    });
    await notify(owner, former.id);
    await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false } });

    const exported = await owner
      .mutate('post', '/api/settings/privacy/export')
      .buffer(true)
      .parse(parseBinary)
      .send({});

    expect(exported.status).toBe(200);
    const files = readStoredJsonFiles(exported.body);
    expect(files['manifest.json'].files).toEqual(
      expect.arrayContaining(['notifications.json', 'notification-preferences.json'])
    );
    expect(files['notification-preferences.json']).toEqual({
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false
    });
    expect(files['notifications.json']).toEqual([
      {
        id: visible.id,
        type: 'TASK_STATUS_CHANGED',
        projectId: project.id,
        taskId: null,
        taskTitle: visible.taskTitle,
        fromStatus: 'A_FAZER',
        toStatus: 'CONCLUIDO',
        dueDate: null,
        createdAt: visible.createdAt.toISOString(),
        readAt: '2026-10-09T10:00:00.000Z'
      }
    ]);
    const serialized = JSON.stringify(files['notifications.json']);
    expect(serialized).not.toContain(actor.user.email);
    expect(serialized).not.toContain('actor');
  });
});
