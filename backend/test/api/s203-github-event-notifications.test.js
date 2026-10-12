import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const boundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));

const password = 'SenhaSegura123';
const ALL_ON = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true
};
const OCCURRED = new Date('2026-10-12T13:00:00.000Z');

let app;
let prisma;
let githubEventNotificationService;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => {
  vi.restoreAllMocks();
  boundary.client = null;
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa S2-03 API ${sequence}`,
    username: `s203api${sequence}`,
    email: `s203-api-${sequence}@example.invalid`,
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

async function githubNotification(recipient, projectId, overrides = {}) {
  sequence += 1;
  const task = await createTask(prisma, projectId, { title: `Tarefa S2-03 ${sequence}` });
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      taskId: task.id,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${sequence}:task:${task.id}`,
      taskTitle: task.title,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/45',
      githubOccurredAt: OCCURRED,
      ...overrides
    }
  });
}

describe('S2-03 API: DTO dos eventos de issue e PR (D10, D12, C6)', () => {
  it('R1 a lista traz o contexto do evento e nada interno nem do GitHub cru', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const row = await githubNotification(owner, project.id);
    await githubNotification(owner, project.id, {
      type: 'PULL_REQUEST_EVENT',
      githubEvent: 'PULL_REQUEST_MERGED',
      artifactNumber: 8,
      artifactTitle: 'Ajusta a sincronização',
      artifactUrl: 'https://github.com/usuario-s203/repositorio-s203/pull/8'
    });

    const response = await owner.agent.get('/api/notifications?status=ALL');

    expect(response.status).toBe(200);
    const issue = response.body.notifications.find((item) => item.id === row.id);
    expect(issue).toEqual({
      id: row.id,
      type: 'ISSUE_EVENT',
      createdAt: row.createdAt.toISOString(),
      readAt: null,
      project: { id: project.id, name: project.name },
      task: {
        id: row.taskId,
        code: `TASK-${row.taskId}`,
        title: row.taskTitle,
        available: true
      },
      context: {
        event: 'ISSUE_CLOSED',
        occurredAt: OCCURRED.toISOString(),
        artifact: {
          kind: 'ISSUE',
          number: 45,
          title: 'Corrigir login',
          url: 'https://github.com/usuario-s203/repositorio-s203/issues/45'
        }
      },
      link: `/projects/${project.id}/kanban?task=${row.taskId}`
    });
    expect(
      response.body.notifications.find((item) => item.type === 'PULL_REQUEST_EVENT').context
    ).toMatchObject({
      event: 'PULL_REQUEST_MERGED',
      artifact: { kind: 'PULL_REQUEST', number: 8 }
    });
    const serialized = JSON.stringify(response.body);
    for (const internal of ['dedupeKey', 'recipientUserId', 'occurrenceKey', 'outcome', 'event:'])
      expect(serialized).not.toContain(internal);
  });

  it('R2 URL fora da lista de permitidas sai nula; tarefa excluída mantém o artefato', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const forged = await githubNotification(owner, project.id, {
      artifactUrl: 'javascript:alert(1)'
    });
    const orphan = await githubNotification(owner, project.id);
    await prisma.task.delete({ where: { id: orphan.taskId } });

    const response = await owner.agent.get('/api/notifications?status=ALL');

    const byId = new Map(response.body.notifications.map((item) => [item.id, item]));
    expect(byId.get(forged.id).context.artifact.url).toBeNull();
    expect(byId.get(orphan.id)).toMatchObject({
      task: { id: null, code: null, available: false },
      link: null,
      context: { artifact: { url: 'https://github.com/usuario-s203/repositorio-s203/issues/45' } }
    });
  });

  it('R7 o contador e o marcar todas incluem os tipos novos', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await githubNotification(owner, project.id);
    await githubNotification(owner, project.id, {
      type: 'PULL_REQUEST_EVENT',
      githubEvent: 'PULL_REQUEST_CLOSED'
    });

    const before = await owner.agent.get('/api/notifications/unread-count');
    const marked = await owner.mutate('post', '/api/notifications/read-all').send({});
    const after = await owner.agent.get('/api/notifications/unread-count');

    expect(before.body).toEqual({ unreadCount: 2 });
    expect(marked.body).toEqual({ updated: 2 });
    expect(after.body).toEqual({ unreadCount: 0 });
  });

  it('R8 a lista com os tipos novos mantém JSON com charset e sem cache', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await githubNotification(owner, project.id);

    const response = await owner.agent.get('/api/notifications');

    expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
    expect(response.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('S2-03 API: preferências com quatro chaves (D7, D12)', () => {
  it('R3 o GET traz as quatro chaves ligadas; o PUT exige as quatro e audita só as alteradas', async () => {
    const owner = await register();

    const initial = await owner.agent.get('/api/settings/notifications');
    const partial = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true } });
    const saved = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { ...ALL_ON, ISSUE_EVENT: false } });
    const withoutCsrf = await owner.agent
      .put('/api/settings/notifications')
      .send({ preferences: ALL_ON });

    expect(initial.body).toEqual({ preferences: ALL_ON });
    expect(partial.status).toBe(400);
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ preferences: { ...ALL_ON, ISSUE_EVENT: false } });
    expect(withoutCsrf.status).toBe(403);
    for (const preferences of [
      { ...ALL_ON, EXTRA_EVENT: true },
      { ...ALL_ON, PULL_REQUEST_EVENT: 'false' },
      JSON.parse(
        `{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":true,"ISSUE_EVENT":true,"PULL_REQUEST_EVENT":true,"__proto__":{"x":1}}`
      )
    ])
      expect(
        (await owner.mutate('put', '/api/settings/notifications').send({ preferences })).status
      ).toBe(400);
    expect(
      await prisma.auditEvent.findMany({
        where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: owner.user.id },
        select: { metadataJson: true }
      })
    ).toEqual([{ metadataJson: { changedTypes: 'ISSUE_EVENT' } }]);
  });
});

describe('S2-03 API: autorização e superfície (D11, C6)', () => {
  it('R4 perder a membership oculta as notificações do GitHub; id alheio responde 404', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const stranger = await register(project.id);
    const row = await githubNotification(owner, project.id);

    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: owner.user.id },
      data: { isActive: false }
    });
    const hidden = await owner.agent.get('/api/notifications?status=ALL');
    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: owner.user.id },
      data: { isActive: true }
    });
    const visible = await owner.agent.get('/api/notifications?status=ALL');
    const alien = await stranger
      .mutate('patch', `/api/notifications/${row.id}`)
      .send({ read: true });

    expect(hidden.body.notifications).toEqual([]);
    expect(visible.body.notifications.map((item) => item.id)).toEqual([row.id]);
    expect(alien.status).toBe(404);
  });

  it('R5 nenhuma rota expõe a fila ou dispara o despacho', async () => {
    const owner = await register();
    for (const [method, path] of [
      ['post', '/api/notifications/github-events'],
      ['get', '/api/notifications/github-events'],
      ['post', '/api/notifications/dispatch'],
      ['get', '/api/github-events']
    ])
      expect((await owner.mutate(method, path).send({})).status, path).toBe(404);
  });
});

describe('S2-03 API: de ponta a ponta pela sincronização (UC04, C1, C3, C4)', () => {
  async function* pages(...values) {
    for (const value of values) yield value;
  }

  function githubDouble(repositoryId, issues) {
    return {
      getRepository: vi.fn().mockResolvedValue({
        githubRepositoryId: repositoryId,
        name: 'repositorio-s203',
        owner: 'usuario-s203',
        fullName: 'usuario-s203/repositorio-s203',
        url: 'https://github.com/usuario-s203/repositorio-s203',
        defaultBranch: 'trunk',
        private: true,
        description: null
      }),
      listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: null }])),
      listCommitPages: vi.fn(() => pages([])),
      listPullRequestPages: vi.fn(() => pages([])),
      listIssuePages: vi.fn(() => pages(issues))
    };
  }

  const issue = (state) => ({
    githubId: 's203-api-issue-45',
    number: 45,
    title: 'Corrigir login',
    state,
    closedAtGithub: state === 'closed' ? OCCURRED : null,
    updatedAtGithub: OCCURRED,
    githubUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/45',
    labels: []
  });

  async function syncWith(manager, project, repositoryId, issues) {
    boundary.client = githubDouble(repositoryId, issues);
    const dispatch = vi.spyOn(githubEventNotificationService, 'dispatchAfterSync');
    const started = await manager
      .mutate('post', `/api/projects/${project.id}/github/sync`)
      .send({});
    expect(started.status, JSON.stringify(started.body)).toBe(202);
    await vi.waitFor(() => expect(dispatch.mock.results.length).toBeGreaterThan(0), {
      timeout: 10000,
      interval: 5
    });
    await dispatch.mock.results[0].value;
    dispatch.mockRestore();
  }

  it('R6 a sincronização que fecha a issue avisa o participante e não repete', async () => {
    const project = await createProject(prisma);
    const manager = await register(project.id, 'OWNER');
    const participant = await register(project.id);
    const outsider = await register(project.id);
    const installation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: 's203-api-installation',
        accountId: 's203-api-account',
        accountLogin: 'usuario-s203',
        accountType: 'User',
        installedAt: new Date(),
        status: 'ACTIVE'
      }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        installationId: installation.id,
        githubRepositoryId: '95001',
        repositoryName: 'repositorio-s203',
        repositoryFullName: 'usuario-s203/repositorio-s203',
        repositoryUrl: 'https://github.com/usuario-s203/repositorio-s203',
        defaultBranch: 'trunk',
        status: 'ACTIVE'
      }
    });
    await syncWith(manager, project, '95001', [issue('open')]);
    const task = await createTask(prisma, project.id, { responsibleUserId: participant.user.id });
    await prisma.taskIssue.create({
      data: {
        taskId: task.id,
        issueId: (await prisma.issue.findFirst({ where: { projectId: project.id } })).id
      }
    });

    await syncWith(manager, project, '95001', [issue('closed')]);
    await syncWith(manager, project, '95001', [issue('closed')]);

    const seen = await participant.agent.get('/api/notifications');
    const notSeen = await outsider.agent.get('/api/notifications?status=ALL');
    expect(seen.body.notifications).toHaveLength(1);
    expect(seen.body.notifications[0]).toMatchObject({
      type: 'ISSUE_EVENT',
      task: { id: task.id, available: true },
      context: { event: 'ISSUE_CLOSED', artifact: { kind: 'ISSUE', number: 45 } },
      link: `/projects/${project.id}/kanban?task=${task.id}`
    });
    expect(notSeen.body.notifications).toEqual([]);
    expect(await prisma.notification.count()).toBe(1);
    expect(await prisma.gitHubArtifactEvent.count()).toBe(1);
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

describe('S2-03 API: exportação do titular (D16)', () => {
  it('PV1 a exportação traz o contexto do GitHub nos tipos novos e mantém os itens do S2-02', async () => {
    const project = await createProject(prisma, { name: 'Projeto exportado S2-03' });
    const owner = await register(project.id);
    const issue = await githubNotification(owner, project.id, {
      readAt: new Date('2026-10-12T15:00:00.000Z')
    });
    sequence += 1;
    const overdue = await prisma.notification.create({
      data: {
        recipientUserId: owner.user.id,
        projectId: project.id,
        type: 'TASK_OVERDUE',
        dedupeKey: `TASK_OVERDUE:${sequence}:2026-10-10`,
        taskTitle: 'Tarefa vencida',
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        createdAt: new Date('2026-10-01T10:00:00.000Z')
      }
    });

    const exported = await owner
      .mutate('post', '/api/settings/privacy/export')
      .buffer(true)
      .parse(parseBinary)
      .send({});

    expect(exported.status).toBe(200);
    const files = readStoredJsonFiles(exported.body);
    expect(files['notification-preferences.json']).toEqual(ALL_ON);
    expect(files['notifications.json']).toEqual([
      {
        id: issue.id,
        type: 'ISSUE_EVENT',
        projectId: project.id,
        taskId: issue.taskId,
        taskTitle: issue.taskTitle,
        fromStatus: null,
        toStatus: null,
        dueDate: null,
        githubEvent: 'ISSUE_CLOSED',
        artifactNumber: 45,
        artifactTitle: 'Corrigir login',
        artifactUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/45',
        githubOccurredAt: OCCURRED.toISOString(),
        createdAt: issue.createdAt.toISOString(),
        readAt: '2026-10-12T15:00:00.000Z',
        visible: true
      },
      {
        id: overdue.id,
        type: 'TASK_OVERDUE',
        projectId: project.id,
        taskId: null,
        taskTitle: 'Tarefa vencida',
        fromStatus: null,
        toStatus: null,
        dueDate: '2026-10-10',
        createdAt: overdue.createdAt.toISOString(),
        readAt: null,
        visible: true
      }
    ]);
  });
});
