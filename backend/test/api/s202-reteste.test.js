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

async function register(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Reteste S2-02 ${sequence}`,
    username: `s202rt${sequence}`,
    email: `s202-rt-${sequence}@example.invalid`,
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

async function notify(recipient, projectId, overrides = {}) {
  sequence += 1;
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${sequence}:2026-10-10`,
      taskTitle: `Tarefa do reteste ${sequence}`,
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      ...overrides
    }
  });
}

const hour = (index) => new Date(Date.UTC(2026, 8, 1) + index * 3_600_000);
const ids = (body) => body.notifications.map((item) => item.id);
const rawCursor = (text) => Buffer.from(text, 'utf8').toString('base64url');
const cursorFor = (row) => rawCursor(`${row.createdAt.toISOString()}|${row.id}`);
const list = (person, query) => person.agent.get(`/api/notifications?${query}`);

async function walk(person, status, limit, onPage = async () => {}) {
  const seen = [];
  let cursor = null;
  let page = 0;
  do {
    const response = await list(
      person,
      `status=${status}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    seen.push(...ids(response.body));
    page += 1;
    await onPage(page, response.body);
    cursor = response.body.nextCursor;
  } while (cursor && page < 100);
  return seen;
}

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

async function exportOf(person) {
  const response = await person
    .mutate('post', '/api/settings/privacy/export')
    .buffer(true)
    .parse((res, callback) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .send({});
  expect(response.status).toBe(200);
  return readStoredJsonFiles(response.body);
}

describe('S2-02 reteste — verificação independente das correções (bloco V)', () => {
  it('RT-V-01 percorrer 47 não lidas marcando e desmarcando no caminho mostra cada não lida uma vez', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const rows = [];
    for (let index = 0; index < 50; index += 1)
      rows.push(
        await notify(owner, project.id, {
          createdAt: hour(index),
          readAt: [3, 20, 45].includes(index) ? hour(index + 1) : null
        })
      );
    const unreadAtStart = rows.filter((row) => !row.readAt).map((row) => row.id);
    const olderRead = rows[3];
    const newerRead = rows[45];

    const seen = await walk(owner, 'UNREAD', 10, async (page, body) => {
      if (page === 1)
        for (const item of body.notifications.slice(0, 3))
          await owner.mutate('patch', `/api/notifications/${item.id}`).send({ read: true });
      if (page === 2) {
        await owner
          .mutate('patch', `/api/notifications/${body.notifications[4].id}`)
          .send({ read: true });
        for (const row of [olderRead, newerRead])
          await owner.mutate('patch', `/api/notifications/${row.id}`).send({ read: false });
      }
    });

    expect(unreadAtStart).toHaveLength(47);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort((a, b) => a - b)).toEqual(
      [...unreadAtStart, olderRead.id].sort((a, b) => a - b)
    );
  });

  it('RT-V-04 RF30 pela API: só a conta ACTIVE recebe a notificação do movimento', async () => {
    const project = await createProject(prisma);
    const actor = await register(project.id, 'MANAGER');
    const received = {};
    for (const accountStatus of ['ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED']) {
      const responsible = await register(project.id);
      await prisma.user.update({ where: { id: responsible.user.id }, data: { accountStatus } });
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });
      const moved = await actor
        .mutate('patch', `/api/tasks/${task.id}/move`)
        .send({ toStatus: 'EM_ANDAMENTO' });
      expect(moved.status, JSON.stringify(moved.body)).toBe(200);
      received[accountStatus] = await prisma.notification.count({
        where: { recipientUserId: responsible.user.id }
      });
    }

    expect(received).toEqual({ ACTIVE: 1, DEACTIVATED: 0, DELETION_PENDING: 0, ANONYMIZED: 0 });
  });

  it('RT-V-05 exportação de projeto ativo, deixado, excluído e restaurado: visible igual à central', async () => {
    const owner = await register();
    const projects = {};
    for (const name of ['ativo', 'deixado', 'excluido', 'restaurado']) {
      projects[name] = await createProject(prisma, { name: `Projeto ${name}` });
      await prisma.projectMembership.create({
        data: { projectId: projects[name].id, userId: owner.user.id, role: 'MEMBER' }
      });
    }
    const rows = {};
    for (const [index, name] of Object.keys(projects).entries())
      rows[name] = await notify(owner, projects[name].id, { createdAt: hour(index) });
    await prisma.projectMembership.updateMany({
      where: { projectId: projects.deixado.id, userId: owner.user.id },
      data: { isActive: false }
    });
    for (const name of ['excluido', 'restaurado'])
      await prisma.project.update({
        where: { id: projects[name].id },
        data: { deletedAt: new Date() }
      });
    await prisma.project.update({
      where: { id: projects.restaurado.id },
      data: { deletedAt: null }
    });

    const central = await list(owner, 'status=ALL&limit=100');
    const exported = (await exportOf(owner))['notifications.json'];

    const visibleInCentral = new Set(ids(central.body));
    expect(Object.fromEntries(exported.map((item) => [item.id, item.visible]))).toEqual(
      Object.fromEntries(Object.values(rows).map((row) => [row.id, visibleInCentral.has(row.id)]))
    );
    expect([...visibleInCentral].sort()).toEqual([rows.ativo.id, rows.restaurado.id].sort());
  });
});

describe('S2-02 reteste — cursor na API (N-C)', () => {
  async function seeded(count) {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const rows = [];
    for (let index = 0; index < count; index += 1)
      rows.push(await notify(owner, project.id, { createdAt: hour(index) }));
    return { project, owner, rows };
  }

  it('RT-N-C-01 cursor de 128 caracteres sem conteúdo válido e de 129 → 400; cursor válido → 200', async () => {
    const { owner, rows } = await seeded(3);

    const statuses = [];
    for (const cursor of ['A'.repeat(128), 'A'.repeat(129), cursorFor(rows[2])])
      statuses.push((await list(owner, `cursor=${cursor}`)).status);

    expect(statuses).toEqual([400, 400, 200]);
  });

  it('RT-N-C-02 base64 com =, + ou / → 400; forma não canônica do mesmo cursor → mesma posição', async () => {
    const { owner, rows } = await seeded(5);
    const canonical = cursorFor(rows[3]);
    const padded = Buffer.from(`${rows[3].createdAt.toISOString()}|${rows[3].id}`).toString(
      'base64'
    );
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = canonical.at(-1);
    const unusedBits = canonical.length % 4 === 3 ? 2 : canonical.length % 4 === 2 ? 4 : 0;
    const variant =
      unusedBits > 0
        ? canonical.slice(0, -1) + alphabet[alphabet.indexOf(last) ^ 1]
        : `${canonical}A`;

    const withPadding = await list(owner, `cursor=${encodeURIComponent(`${padded}=`)}`);
    const withPlus = await list(owner, `cursor=${encodeURIComponent('ab+c')}`);
    const withSlash = await list(owner, `cursor=${encodeURIComponent('ab/c')}`);
    const reference = await list(owner, `cursor=${canonical}`);
    const nonCanonical = await list(owner, `cursor=${variant}`);

    expect([withPadding.status, withPlus.status, withSlash.status]).toEqual([400, 400, 400]);
    expect(reference.status).toBe(200);
    process.stdout.write(`RT-N-C-02 ${JSON.stringify({ variant, status: nonCanonical.status })}\n`);
    expect([200, 400]).toContain(nonCanonical.status);
    if (nonCanonical.status === 200) expect(ids(nonCanonical.body)).toEqual(ids(reference.body));
  });

  it('RT-N-C-03 cursor tirado do filtro UNREAD posiciona o filtro ALL pela mesma ordem', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const rows = [];
    for (let index = 0; index < 8; index += 1)
      rows.push(
        await notify(owner, project.id, {
          createdAt: hour(index),
          readAt: index % 2 ? hour(index + 1) : null
        })
      );
    const unread = await list(owner, 'status=UNREAD&limit=2');

    const all = await list(owner, `status=ALL&limit=100&cursor=${unread.body.nextCursor}`);
    const pivot = rows.find((row) => row.id === unread.body.notifications.at(-1).id);

    expect(all.status).toBe(200);
    expect(ids(all.body)).toEqual(
      rows
        .filter((row) => row.createdAt < pivot.createdAt)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((row) => row.id)
    );
  });

  it('RT-N-C-04 cursor de notificação apagada, oculta ou de tarefa excluída continua posicionando', async () => {
    const project = await createProject(prisma);
    const other = await createProject(prisma);
    const owner = await register(project.id);
    await prisma.projectMembership.create({
      data: { projectId: other.id, userId: owner.user.id, role: 'MEMBER' }
    });
    const task = await createTask(prisma, project.id);
    const rows = [];
    for (let index = 0; index < 6; index += 1)
      rows.push(
        await notify(owner, index === 3 ? other.id : project.id, {
          createdAt: hour(index),
          taskId: index === 2 ? task.id : null
        })
      );
    const deletedCursor = cursorFor(rows[4]);
    await prisma.notification.delete({ where: { id: rows[4].id } });
    await prisma.projectMembership.updateMany({
      where: { projectId: other.id, userId: owner.user.id },
      data: { isActive: false }
    });
    await prisma.task.delete({ where: { id: task.id } });

    const afterDeleted = await list(owner, `status=ALL&cursor=${deletedCursor}`);
    const afterHidden = await list(owner, `status=ALL&cursor=${cursorFor(rows[3])}`);
    const afterTaskGone = await list(owner, `status=ALL&cursor=${cursorFor(rows[2])}`);

    expect(ids(afterDeleted.body)).toEqual([rows[2].id, rows[1].id, rows[0].id]);
    expect(ids(afterHidden.body)).toEqual([rows[2].id, rows[1].id, rows[0].id]);
    expect(ids(afterTaskGone.body)).toEqual([rows[1].id, rows[0].id]);
  });

  it.each([
    ['futuro', '2030-01-01T00:00:00.000Z', 'todas'],
    ['1970-01-01', '1970-01-01T00:00:00.000Z', 'nenhuma'],
    ['9999-12-31 no fim', '9999-12-31T23:59:59.999Z', 'todas'],
    ['ano 0999', '0999-12-31T00:00:00.000Z', 'nenhuma'],
    ['ano 0000', '0000-01-01T00:00:00.000Z', 'nenhuma']
  ])(
    'RT-N-C-05 cursor com createdAt %s (%s) → 200 com %s, ou 400; nunca 500',
    async (_, instant, expected) => {
      const { owner, rows } = await seeded(3);

      const response = await list(owner, `status=ALL&cursor=${rawCursor(`${instant}|1`)}`);

      process.stdout.write(
        `RT-N-C-05 ${JSON.stringify({ instant, status: response.status, items: response.body.notifications?.length ?? null })}\n`
      );
      expect(response.status).not.toBe(500);
      expect([200, 400]).toContain(response.status);
      if (response.status === 200)
        expect(ids(response.body)).toEqual(
          expected === 'todas' ? rows.map((row) => row.id).reverse() : []
        );
    }
  );

  it('RT-N-C-06 com exatamente limit restantes nextCursor é null; com limit + 1 a página seguinte tem 1 item', async () => {
    const { owner } = await seeded(7);

    const exact = await list(owner, 'status=ALL&limit=7');
    const oneMore = await list(owner, 'status=ALL&limit=6');
    const tail = await list(owner, `status=ALL&limit=6&cursor=${oneMore.body.nextCursor}`);

    expect(exact.body.nextCursor).toBeNull();
    expect(typeof oneMore.body.nextCursor).toBe('string');
    expect(ids(tail.body)).toHaveLength(1);
    expect(tail.body.nextCursor).toBeNull();
  });

  it('RT-N-C-07 page=1 traz nextCursor quando há mais; página além da última traz null', async () => {
    const { owner } = await seeded(5);

    const first = await list(owner, 'status=ALL&limit=2&page=1');
    const beyond = await list(owner, 'status=ALL&limit=2&page=9');

    expect(first.body.pagination).toMatchObject({ page: 1, total: 5, totalPages: 3 });
    expect(typeof first.body.nextCursor).toBe('string');
    expect(beyond.body).toMatchObject({ notifications: [], nextCursor: null });
  });

  it('RT-N-C-08 item acima do cursor desmarcado no percurso não volta na continuação e aparece no início', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const rows = [];
    for (let index = 0; index < 6; index += 1)
      rows.push(
        await notify(owner, project.id, {
          createdAt: hour(index),
          readAt: index === 5 ? hour(index + 1) : null
        })
      );
    const first = await list(owner, 'status=UNREAD&limit=2');

    await owner.mutate('patch', `/api/notifications/${rows[5].id}`).send({ read: false });
    const rest = await walk(owner, 'UNREAD', 2, async () => {});
    const continuation = await list(
      owner,
      `status=UNREAD&limit=100&cursor=${first.body.nextCursor}`
    );

    expect(ids(first.body)).toEqual([rows[4].id, rows[3].id]);
    expect(ids(continuation.body)).toEqual([rows[2].id, rows[1].id, rows[0].id]);
    expect(rest[0]).toBe(rows[5].id);
  });

  it('RT-N-C-09 cursor feito com notificação de outra pessoa, de outro projeto ou de conta restrita nunca revela notificação alheia', async () => {
    const shared = await createProject(prisma);
    const foreignProject = await createProject(prisma);
    const owner = await register(shared.id);
    const other = await register(shared.id);
    const outsider = await register(foreignProject.id);
    const restricted = await register(shared.id);
    await prisma.user.update({
      where: { id: restricted.user.id },
      data: { accountStatus: 'DEACTIVATED' }
    });
    const own = [];
    for (let index = 0; index < 4; index += 1)
      own.push(await notify(owner, shared.id, { createdAt: hour(index * 2) }));
    const foreign = [
      await notify(other, shared.id, { createdAt: hour(5) }),
      await notify(outsider, foreignProject.id, { createdAt: hour(5) }),
      await notify(restricted, shared.id, { createdAt: hour(5) })
    ];
    const foreignIds = new Set(foreign.map((row) => row.id));

    for (const row of foreign) {
      const response = await list(owner, `status=ALL&limit=100&cursor=${cursorFor(row)}`);
      expect(response.status).toBe(200);
      expect(ids(response.body).some((id) => foreignIds.has(id))).toBe(false);
      expect(ids(response.body)).toEqual([own[2].id, own[1].id, own[0].id]);
    }
  });

  it('X V4.1.1/V14.3.2 respostas com cursor, sucesso e erro, têm JSON com charset, nosniff e no-store', async () => {
    const { owner, rows } = await seeded(2);

    for (const query of [`cursor=${cursorFor(rows[1])}`, 'cursor=%21', 'cursor=AAAA&page=1']) {
      const response = await list(owner, query);
      expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toMatch(/no-store/);
    }
  });
});

describe('S2-02 reteste — preferências, conta restrita e exportação na API (N-E, N-A, N-X)', () => {
  it('RT-N-E-04 enabledAt não aparece em nenhuma resposta nem na exportação', async () => {
    const owner = await register();
    const put = (preferences) =>
      owner.mutate('put', '/api/settings/notifications').send({ preferences });

    await put({
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: false,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const reenabled = await put({
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    const read = await owner.agent.get('/api/settings/notifications');
    const files = await exportOf(owner);

    for (const body of [reenabled.body, read.body])
      expect(body).toEqual({
        preferences: {
          TASK_STATUS_CHANGED: true,
          TASK_OVERDUE: true,
          ISSUE_EVENT: true,
          PULL_REQUEST_EVENT: true
        }
      });
    expect(files['notification-preferences.json']).toEqual({
      TASK_STATUS_CHANGED: true,
      TASK_OVERDUE: true,
      ISSUE_EVENT: true,
      PULL_REQUEST_EVENT: true
    });
    expect(JSON.stringify(files)).not.toContain('enabledAt');
  });

  it('RT-N-A-05/R17 ator desativado ou com exclusão pendente não move tarefa nem gera notificação', async () => {
    const project = await createProject(prisma);
    const responsible = await register(project.id);
    const outcomes = {};
    for (const accountStatus of ['DEACTIVATED', 'DELETION_PENDING']) {
      const actor = await register(project.id, 'MANAGER');
      await prisma.user.update({ where: { id: actor.user.id }, data: { accountStatus } });
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });
      const moved = await actor
        .mutate('patch', `/api/tasks/${task.id}/move`)
        .send({ toStatus: 'EM_ANDAMENTO' });
      outcomes[accountStatus] = [
        moved.status,
        moved.body.code,
        (await prisma.task.findUnique({ where: { id: task.id } })).status
      ];
    }

    expect(outcomes).toEqual({
      DEACTIVATED: [403, 'ACCOUNT_DEACTIVATED', 'A_FAZER'],
      DELETION_PENDING: [403, 'ACCOUNT_DELETION_PENDING', 'A_FAZER']
    });
    expect(await prisma.notification.count()).toBe(0);
  });

  it('RT-N-X-01 membership × estado do projeto × leitura: visible igual à central', async () => {
    const owner = await register();
    const expected = {};
    let index = 0;
    for (const membership of [true, false])
      for (const projectState of ['ativo', 'excluido', 'restaurado'])
        for (const read of [false, true]) {
          index += 1;
          const project = await createProject(prisma, { name: `RT-N-X ${index}` });
          await prisma.projectMembership.create({
            data: {
              projectId: project.id,
              userId: owner.user.id,
              role: 'MEMBER',
              isActive: membership
            }
          });
          const row = await notify(owner, project.id, {
            createdAt: hour(index),
            readAt: read ? hour(index + 1) : null
          });
          if (projectState !== 'ativo')
            await prisma.project.update({
              where: { id: project.id },
              data: { deletedAt: new Date() }
            });
          if (projectState === 'restaurado')
            await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
          expected[row.id] = membership && projectState !== 'excluido';
        }

    const central = new Set(ids((await list(owner, 'status=ALL&limit=100')).body));
    const exported = (await exportOf(owner))['notifications.json'];

    expect(exported).toHaveLength(12);
    expect(Object.fromEntries(exported.map((item) => [item.id, item.visible]))).toEqual(expected);
    expect(
      Object.fromEntries(Object.keys(expected).map((id) => [id, central.has(Number(id))]))
    ).toEqual(expected);
  });
});
