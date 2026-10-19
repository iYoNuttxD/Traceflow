import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

const withoutRequestId = ({ requestId: _requestId, ...rest }) => rest;
const notificationsOf = (user, type) =>
  prisma.notification.findMany({
    where: { recipientUserId: user.user.id, ...(type ? { type } : {}) }
  });

describe('S2-02 bateria API — UC07 e escritores de status (bloco C, bloco S)', () => {
  it('NT-C-02 sem sessão → 401 e não membro → 404 ao mover; nada muda e nada nasce', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const outsider = await register();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });

    const anonymous = await request(app)
      .patch(`/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    const foreign = await outsider
      .mutate('patch', `/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });

    expect(anonymous.status).toBe(401);
    expect(foreign.status).toBe(404);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.taskMovement.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });

  it('NT-C-03 VIEWER não pode mover (E7): 403, status intacto e nenhuma notificação', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const viewer = await register(project.id, 'VIEWER');
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });

    const response = await viewer
      .mutate('patch', `/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });

    expect(response.status).toBe(403);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.notification.count()).toBe(0);
  });

  it('NT-S-02 /move e /status notificam uma vez cada; mover para a mesma coluna → 400 sem notificação', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });

    const moved = await actor
      .mutate('patch', `/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    const status = await actor
      .mutate('patch', `/api/tasks/${task.id}/status`)
      .send({ status: 'CONCLUIDO' });
    const same = await actor
      .mutate('patch', `/api/tasks/${task.id}/status`)
      .send({ status: 'CONCLUIDO' });

    expect([moved.status, status.status, same.status]).toEqual([200, 200, 400]);
    const rows = await notificationsOf(responsible, 'TASK_STATUS_CHANGED');
    expect(rows.map((row) => `${row.fromStatus}>${row.toStatus}`).sort()).toEqual([
      'A_FAZER>EM_ANDAMENTO',
      'EM_ANDAMENTO>CONCLUIDO'
    ]);
  });

  it('NT-S-03 criação e edição de tarefa recusam status: só a movimentação muda status', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id, 'OWNER');
    const task = await createTask(prisma, project.id, { responsibleUserId: owner.user.id });

    const created = await owner
      .mutate('post', `/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa já concluída', status: 'CONCLUIDO' });
    const updated = await owner
      .mutate('put', `/api/tasks/${task.id}`)
      .send({ status: 'CONCLUIDO' });

    expect(created.status).toBe(400);
    expect(updated.status).toBe(400);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
  });
});

describe('S2-02 bateria API — lista, contador e leitura (bloco L)', () => {
  it('NT-L-01 status minúsculo, desconhecido ou parâmetro extra → 400', async () => {
    const owner = await register();
    for (const query of [
      'status=unread',
      'status=all',
      'status=READ',
      'sort=createdAt',
      'page=1&page=2'
    ])
      expect((await owner.agent.get(`/api/notifications?${query}`)).status, query).toBe(400);
  });

  it('NT-L-02 página além da última → 200 vazia com total coerente; limit não numérico → 400', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    for (let index = 0; index < 3; index += 1) await notify(owner, project.id);

    const beyond = await owner.agent.get('/api/notifications?status=ALL&limit=2&page=3');
    const last = await owner.agent.get('/api/notifications?status=ALL&limit=2&page=2');
    const single = await owner.agent.get('/api/notifications?status=ALL&limit=100');

    expect(beyond.status).toBe(200);
    expect(beyond.body).toMatchObject({
      notifications: [],
      pagination: { page: 3, limit: 2, total: 3, totalPages: 2 }
    });
    expect(last.body.notifications).toHaveLength(1);
    expect(single.body.pagination).toEqual({ page: 1, limit: 100, total: 3, totalPages: 1 });
    for (const query of ['limit=abc', 'limit=', 'page=abc', 'limit=-1'])
      expect((await owner.agent.get(`/api/notifications?${query}`)).status, query).toBe(400);
  });

  it('NT-L-03 empate de createdAt desempata por id decrescente', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const at = new Date('2026-10-09T12:00:00.000Z');
    const rows = [];
    for (let index = 0; index < 4; index += 1)
      rows.push(await notify(owner, project.id, { createdAt: at }));

    const { body } = await owner.agent.get('/api/notifications?status=ALL');

    expect(body.notifications.map((item) => item.id)).toEqual(
      rows.map((row) => row.id).sort((a, b) => b - a)
    );
  });

  it('NT-L-04 percorrer as páginas sem mudança concorrente não perde nem duplica', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const created = [];
    for (let index = 0; index < 7; index += 1)
      created.push(
        await notify(owner, project.id, { createdAt: new Date(Date.UTC(2026, 9, 1, index)) })
      );

    const seen = [];
    for (let page = 1; page <= 4; page += 1) {
      const { body } = await owner.agent.get(`/api/notifications?status=ALL&limit=2&page=${page}`);
      seen.push(...body.notifications.map((item) => item.id));
    }

    expect(seen).toHaveLength(7);
    expect(new Set(seen)).toEqual(new Set(created.map((row) => row.id)));
  });

  it('NT-L-05 unreadCount conta todas as visíveis, não a página', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    for (let index = 0; index < 3; index += 1) await notify(owner, project.id);
    await notify(owner, project.id, { readAt: new Date() });

    const list = await owner.agent.get('/api/notifications?limit=1');
    const count = await owner.agent.get('/api/notifications/unread-count');

    expect(list.body.notifications).toHaveLength(1);
    expect(list.body.unreadCount).toBe(3);
    expect(count.body.unreadCount).toBe(3);
  });

  it('NT-L-06 lida → não lida → lida grava um instante novo na segunda leitura', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);
    const path = `/api/notifications/${row.id}`;

    const first = await owner.mutate('patch', path).send({ read: true });
    await owner.mutate('patch', path).send({ read: false });
    await new Promise((resolve) => setTimeout(resolve, 15));
    const again = await owner.mutate('patch', path).send({ read: true });

    expect(Date.parse(again.body.notification.readAt)).toBeGreaterThan(
      Date.parse(first.body.notification.readAt)
    );
  });

  it('NT-L-07 nenhuma GET cria notificação, muda leitura ou audita', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await notify(owner, project.id);
    const before = {
      audit: await prisma.auditEvent.count(),
      notifications: await prisma.notification.count(),
      unread: await prisma.notification.count({ where: { readAt: null } })
    };

    for (const path of [
      '/api/notifications',
      '/api/notifications?status=ALL',
      '/api/notifications/unread-count',
      '/api/settings/notifications'
    ])
      expect((await owner.agent.get(path)).status, path).toBe(200);

    expect({
      audit: await prisma.auditEvent.count(),
      notifications: await prisma.notification.count(),
      unread: await prisma.notification.count({ where: { readAt: null } })
    }).toEqual(before);
  });

  it('NT-L-08 datas em ISO 8601 UTC e dueDate como data pura', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await notify(owner, project.id, { readAt: new Date('2026-10-09T10:00:00.000Z') });

    const [item] = (await owner.agent.get('/api/notifications?status=ALL')).body.notifications;

    expect(item.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(item.readAt).toBe('2026-10-09T10:00:00.000Z');
    expect(item.context).toEqual({ dueDate: '2026-10-10' });
    expect(Object.keys(item.task).sort()).toEqual(['available', 'code', 'id', 'title']);
  });

  it('NT-L-09 read-all sem pendência devolve 0; corpo com campo → 400', async () => {
    const owner = await register();

    expect((await owner.mutate('post', '/api/notifications/read-all').send({})).body).toEqual({
      updated: 0
    });
    expect((await owner.mutate('post', '/api/notifications/read-all').send({ x: 1 })).status).toBe(
      400
    );
  });
});

describe('S2-02 bateria API — exportação (bloco D)', () => {
  it('NT-D-02 a exportação traz a data do prazo das notificações de vencimento', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await notify(owner, project.id, { dueDate: new Date('2026-10-12T00:00:00.000Z') });

    const exported = await owner
      .mutate('post', '/api/settings/privacy/export')
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .send({});

    expect(exported.status).toBe(200);
    const text = exported.body.toString('utf8');
    expect(text).toMatch(/"type":\s*"TASK_OVERDUE"/);
    expect(text).toMatch(/"dueDate":\s*"2026-10-12"/);
  });
});

describe('S2-02 bateria API — preferências (bloco F)', () => {
  it('NT-F-02 PUT recusa null, array, chaves de protótipo em qualquer nível e valores não booleanos', async () => {
    const owner = await register();
    const bodies = [
      { preferences: null },
      { preferences: [] },
      { preferences: [true, false] },
      {
        preferences: {
          TASK_STATUS_CHANGED: null,
          TASK_OVERDUE: true,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true,
          TRACEABILITY_INCONSISTENCY: true
        }
      },
      {
        preferences: {
          TASK_STATUS_CHANGED: 0,
          TASK_OVERDUE: 1,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true,
          TRACEABILITY_INCONSISTENCY: true
        }
      },
      { preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true, prototype: {} } },
      '{"__proto__":{"x":1},"preferences":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"ISSUE_EVENT":true,"PULL_REQUEST_EVENT":true,"TRACEABILITY_INCONSISTENCY":true}}',
      '{"constructor":{"x":1},"preferences":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"ISSUE_EVENT":true,"PULL_REQUEST_EVENT":true,"TRACEABILITY_INCONSISTENCY":true}}',
      '{"preferences":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"ISSUE_EVENT":true,"PULL_REQUEST_EVENT":true,"TRACEABILITY_INCONSISTENCY":true,"__proto__":{"polluted":true}}}'
    ];

    for (const body of bodies)
      expect(
        (
          await owner
            .mutate('put', '/api/settings/notifications')
            .set('Content-Type', 'application/json')
            .send(typeof body === 'string' ? body : JSON.stringify(body))
        ).status,
        typeof body === 'string' ? body : JSON.stringify(body)
      ).toBe(400);
    expect(await prisma.notificationPreference.count()).toBe(0);
    expect({}.polluted).toBeUndefined();
  });

  it('NT-F-03 preferência do RF30 desligada impede, religada vale para o próximo movimento', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    const tasks = [
      await createTask(prisma, project.id, { responsibleUserId: responsible.user.id }),
      await createTask(prisma, project.id, { responsibleUserId: responsible.user.id })
    ];
    const prefs = (value) =>
      responsible.mutate('put', '/api/settings/notifications').send({
        preferences: {
          TASK_STATUS_CHANGED: value,
          TASK_OVERDUE: true,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true,
          TRACEABILITY_INCONSISTENCY: true
        }
      });

    await prefs(false);
    await actor
      .mutate('patch', `/api/tasks/${tasks[0].id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    await prefs(true);
    await actor
      .mutate('patch', `/api/tasks/${tasks[1].id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });

    const rows = await notificationsOf(responsible, 'TASK_STATUS_CHANGED');
    expect(rows.map((row) => row.taskId)).toEqual([tasks[1].id]);
  });

  it('NT-F-06 a preferência vale em todos os projetos do usuário', async () => {
    const [first, second] = [await createProject(prisma), await createProject(prisma)];
    const responsible = await register(first.id);
    await join(second.id, responsible.user.id);
    const actor = await register(first.id, 'MANAGER');
    await join(second.id, actor.user.id, 'MANAGER');
    await responsible.mutate('put', '/api/settings/notifications').send({
      preferences: {
        TASK_STATUS_CHANGED: false,
        TASK_OVERDUE: true,
        ISSUE_EVENT: true,
        PULL_REQUEST_EVENT: true,
        TRACEABILITY_INCONSISTENCY: true
      }
    });

    for (const project of [first, second]) {
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });
      await actor.mutate('patch', `/api/tasks/${task.id}/move`).send({ toStatus: 'EM_ANDAMENTO' });
    }

    expect(await prisma.notification.count()).toBe(0);
  });
});

describe('S2-02 bateria API — autorização, visibilidade e estado da conta (bloco Z)', () => {
  it('NT-Z-01 alheia, inexistente, oculta e de projeto excluído respondem o mesmo 404; restaurar exibe de novo', async () => {
    const [project, hidden, removed] = [
      await createProject(prisma),
      await createProject(prisma),
      await createProject(prisma)
    ];
    const owner = await register(project.id);
    const other = await register(project.id);
    await join(hidden.id, owner.user.id);
    await join(removed.id, owner.user.id);
    const theirs = await notify(other, project.id);
    const hiddenRow = await notify(owner, hidden.id);
    const removedRow = await notify(owner, removed.id);
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: hidden.id, userId: owner.user.id } },
      data: { isActive: false }
    });
    await prisma.project.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    const patch = (id) => owner.mutate('patch', `/api/notifications/${id}`).send({ read: true });

    const bodies = [];
    for (const id of [theirs.id, hiddenRow.id, removedRow.id, 2147483646]) {
      const response = await patch(id);
      expect(response.status, String(id)).toBe(404);
      bodies.push(withoutRequestId(response.body));
    }

    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    await prisma.project.update({ where: { id: removed.id }, data: { deletedAt: null } });
    expect((await patch(removedRow.id)).status).toBe(200);
  });

  it('NT-Z-02/H4 conta desativada ou com exclusão pendente não lê a central nem recebe a notificação do movimento', async () => {
    const project = await createProject(prisma);
    const deactivated = await register(project.id);
    const pending = await register(project.id);
    const actor = await register(project.id, 'MANAGER');
    await prisma.user.update({
      where: { id: deactivated.user.id },
      data: { accountStatus: 'DEACTIVATED', deactivatedAt: new Date() }
    });
    await prisma.user.update({
      where: { id: pending.user.id },
      data: { accountStatus: 'DELETION_PENDING' }
    });

    const readDeactivated = await deactivated.agent.get('/api/notifications');
    const readPending = await pending.agent.get('/api/notifications');
    for (const person of [deactivated, pending]) {
      const task = await createTask(prisma, project.id, { responsibleUserId: person.user.id });
      await actor.mutate('patch', `/api/tasks/${task.id}/move`).send({ toStatus: 'EM_ANDAMENTO' });
    }

    expect([readDeactivated.status, readPending.status]).toEqual([403, 403]);
    expect(readDeactivated.body.code).toBe('ACCOUNT_DEACTIVATED');
    expect(readPending.body.code).toBe('ACCOUNT_DELETION_PENDING');
    expect(
      await prisma.notification.count({ where: { recipientUserId: deactivated.user.id } })
    ).toBe(0);
    expect(await prisma.notification.count({ where: { recipientUserId: pending.user.id } })).toBe(
      0
    );
  });

  it('NT-Z-04 variantes de caminho no PATCH nunca alteram notificação alheia nem dão 500', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const other = await register(project.id);
    const theirs = await notify(other, project.id);
    const mine = await notify(owner, project.id);

    for (const path of [
      `/api/notifications/${theirs.id}/`,
      `/api/Notifications/${theirs.id}`,
      `/api/NOTIFICATIONS/${theirs.id}`,
      `/api/notifications/${encodeURIComponent(String(theirs.id))}`,
      `/api/notifications/%2F${theirs.id}`,
      `/api/notifications//${theirs.id}`,
      `/api//notifications/${theirs.id}`
    ]) {
      const response = await owner.mutate('patch', path).send({ read: true });
      expect(response.status, path).toBeGreaterThanOrEqual(400);
      expect(response.status, path).toBeLessThan(500);
    }
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readAt).toBeNull();
    expect(
      (await owner.mutate('patch', `/api/notifications/${mine.id}/`).send({ read: true })).status
    ).toBe(200);
  });

  it('NT-Z-05 ids malformados ou fora da faixa → 400 ou 404, nunca 500', async () => {
    const owner = await register();
    for (const id of [
      '0',
      '-1',
      '01',
      '1e2',
      '1.5',
      'abc',
      '2147483647',
      '2147483648',
      '99999999999999999999',
      '%00'
    ]) {
      const response = await owner.mutate('patch', `/api/notifications/${id}`).send({ read: true });
      expect([400, 404], id).toContain(response.status);
    }
  });

  it('NT-Z-06 projectId ou recipientUserId em query ou corpo → 400', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await notify(owner, project.id);

    expect((await owner.agent.get(`/api/notifications?projectId=${project.id}`)).status).toBe(400);
    expect(
      (await owner.agent.get(`/api/notifications/unread-count?recipientUserId=${owner.user.id}`))
        .status
    ).toBe(400);
    expect(
      (
        await owner
          .mutate('patch', `/api/notifications/${row.id}`)
          .send({ read: true, projectId: 1 })
      ).status
    ).toBe(400);
    expect(
      (
        await owner
          .mutate('post', `/api/notifications/read-all?recipientUserId=${owner.user.id}`)
          .send({})
      ).status
    ).toBe(400);
  });

  it('NT-Z-07 o OWNER do projeto não enxerga nem marca notificações de outro membro', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id, 'OWNER');
    const member = await register(project.id);
    const theirs = await notify(member, project.id);

    expect((await owner.agent.get('/api/notifications?status=ALL')).body.notifications).toEqual([]);
    expect(
      (await owner.mutate('patch', `/api/notifications/${theirs.id}`).send({ read: true })).status
    ).toBe(404);
    expect((await owner.mutate('post', '/api/notifications/read-all').send({})).body).toEqual({
      updated: 0
    });
    expect((await prisma.notification.findUnique({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it('NT-Z-08 o limitador de leitura é por usuário; as mutações caem no limitador global', async () => {
    const reads = await startTestServer(
      createApp({ securityConfig: { ...env, rateLimitReadBurstMax: 2 } })
    );
    const first = await register(undefined, 'MEMBER', reads);
    const second = await register(undefined, 'MEMBER', reads);
    const firstStatuses = [];
    for (let index = 0; index < 3; index += 1)
      firstStatuses.push((await first.agent.get('/api/notifications')).status);

    expect(firstStatuses).toEqual([200, 200, 429]);
    expect((await second.agent.get('/api/notifications')).status).toBe(200);

    const writes = await startTestServer(
      createApp({ securityConfig: { ...env, rateLimitGlobalMax: 6 } })
    );
    const writer = await register(undefined, 'MEMBER', writes);
    const statuses = [];
    for (let index = 0; index < 8; index += 1)
      statuses.push((await writer.mutate('post', '/api/notifications/read-all').send({})).status);
    expect(statuses).toContain(429);
  });

  it('X V4.1.1/V3.4.4 respostas de erro das rotas novas têm JSON com charset, nosniff e no-store', async () => {
    const owner = await register();
    const cases = [
      [request(app).get('/api/notifications'), 401],
      [owner.agent.patch('/api/notifications/1').send({ read: true }), 403],
      [owner.mutate('patch', '/api/notifications/abc').send({ read: true }), 400],
      [owner.mutate('patch', '/api/notifications/2147483646').send({ read: true }), 404]
    ];

    for (const [pending, status] of cases) {
      const response = await pending;
      expect(response.status).toBe(status);
      expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toMatch(/no-store/);
      expect(response.body.code).toEqual(expect.any(String));
    }
  });
});
