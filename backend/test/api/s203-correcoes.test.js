import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const password = 'SenhaSegura123';
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const ISSUE_URL = 'https://github.com/usuario-s203/repositorio-s203/issues';
const GITHUB_EXCLUSIONS = [
  'NO_TASK',
  'NO_PARTICIPANT',
  'INACTIVE_ACCOUNT',
  'INACTIVE_MEMBER',
  'PREFERENCE_OFF'
];

let app;
let prisma;
let issueRepository;
let createGithubEventNotificationService;
let createProjectDeletionService;
let storage;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  ({ createProjectDeletionService } =
    await import('../../src/modules/projects/services/project-deletion.service.js'));
  const { LocalTestEvidenceStorage } =
    await import('../../src/modules/testCases/storage/local-test-evidence.storage.js');
  storage = new LocalTestEvidenceStorage({
    directory: process.env.TEST_EVIDENCE_STORAGE_DIR,
    environment: 'test'
  });
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
});

async function register(projectId, role = 'MEMBER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa correção S2-03 ${sequence}`,
    username: `s203corapi${sequence}`,
    email: `s203-cor-api-${sequence}@example.invalid`,
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

const runJob = () => createGithubEventNotificationService().runJob({ dryRun: false });

async function closedLinkedIssue(project, responsible) {
  sequence += 1;
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.user.id });
  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      githubId: `s203-cor-api-issue-${project.id}-${sequence}`,
      number: sequence,
      title: `Issue ${sequence}`,
      labels: [],
      githubUrl: `${ISSUE_URL}/${sequence}`,
      state: 'open',
      closedAtGithub: null
    }
  });
  await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  const closedAt = new Date(Date.now() - 60 * 60 * 1000);
  await issueRepository.upsertMany(
    [
      {
        projectId: project.id,
        githubId: issue.githubId,
        number: issue.number,
        title: issue.title,
        githubUrl: issue.githubUrl,
        labels: [],
        state: 'closed',
        closedAtGithub: closedAt,
        updatedAtGithub: closedAt
      }
    ],
    { detectedAt: new Date() }
  );
  return { task, issue };
}

const deleteProject = (project) =>
  prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
const restoreProject = (project) =>
  prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });

async function central(person) {
  const [list, count] = await Promise.all([
    person.agent.get('/api/notifications?status=ALL'),
    person.agent.get('/api/notifications/unread-count')
  ]);
  expect(list.status).toBe(200);
  expect(count.status).toBe(200);
  return { items: list.body.notifications, unreadCount: count.body.unreadCount };
}

describe('S2-03 correções — Fase 4: projeto excluído (S203-A02)', () => {
  it('C4-01 evento de projeto excluído é despachado, fica fora da central e do contador e aparece com a restauração (EV-E-06)', async () => {
    const project = await createProject(prisma, { createdAt: PROJECT_CREATED_AT });
    const participant = await register(project.id);
    const { task } = await closedLinkedIssue(project, participant);
    await deleteProject(project);

    const report = await runJob();

    expect(report).toMatchObject({ dispatched: 1, created: 1 });
    expect(await central(participant)).toEqual({ items: [], unreadCount: 0 });

    await restoreProject(project);

    const visible = await central(participant);
    expect(visible.unreadCount).toBe(1);
    expect(visible.items.map((item) => [item.type, item.task.id])).toEqual([
      ['ISSUE_EVENT', task.id]
    ]);
  });

  it('C4-02 a purga do projeto apaga o evento e a notificação que nasceu oculta', async () => {
    const project = await createProject(prisma, { createdAt: PROJECT_CREATED_AT });
    const owner = await register(project.id, 'OWNER');
    await closedLinkedIssue(project, owner);
    const service = createProjectDeletionService({ storage });
    await service.requestDeletion(project.id, owner.user.id);
    await runJob();
    expect(await prisma.notification.count({ where: { projectId: project.id } })).toBe(1);

    await expect(service.purge(project.id, owner.user.id, project.name)).resolves.toMatchObject({
      purged: true
    });

    expect(await prisma.gitHubArtifactEvent.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { projectId: project.id } })).toBe(0);
  });

  it('C4-03 o outcome dos eventos novos tem cinco motivos, sem janela, e created + alreadyNotified = eligible (TF-REV-002)', async () => {
    const project = await createProject(prisma, { createdAt: PROJECT_CREATED_AT });
    const participant = await register(project.id);
    await closedLinkedIssue(project, participant);
    await deleteProject(project);

    await runJob();

    const [event] = await prisma.gitHubArtifactEvent.findMany({
      where: { projectId: project.id }
    });
    expect(Object.keys(event.outcome.excluded).sort()).toEqual([...GITHUB_EXCLUSIONS].sort());
    expect(event.outcome.created + event.outcome.alreadyNotified).toBe(event.outcome.eligible);
    expect(event.outcome.eligible).toBe(1);
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

async function storedNotification(recipient, projectId, artifactUrl) {
  sequence += 1;
  const task = await createTask(prisma, projectId, { title: `Tarefa exportada ${sequence}` });
  return prisma.notification.create({
    data: {
      recipientUserId: recipient.user.id,
      projectId,
      taskId: task.id,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${900000 + sequence}:task:${task.id}`,
      taskTitle: task.title,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl,
      githubOccurredAt: new Date('2026-10-12T13:00:00Z')
    }
  });
}

describe('S2-03 correções — Fase 7: exportação e preferências (S203-A09, S203-A10)', () => {
  const RELOAD = 'As opções de notificação mudaram. Recarregue a página e salve de novo.';
  const ALL_ON = {
    TASK_STATUS_CHANGED: true,
    TASK_OVERDUE: true,
    ISSUE_EVENT: true,
    PULL_REQUEST_EVENT: true,
    TRACEABILITY_INCONSISTENCY: true
  };

  it('C7-01 a exportação devolve artifactUrl nula fora do prefixo e preserva a válida (EV-D-01)', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const longValid = `${ISSUE_URL}/${'4'.repeat(512 - ISSUE_URL.length - 1)}`;
    const valid = await storedNotification(owner, project.id, `${ISSUE_URL}/45`);
    const longest = await storedNotification(owner, project.id, longValid);
    const forged = [];
    for (const url of [
      'javascript:alert(1)',
      'http://github.com/usuario-s203/repositorio-s203/issues/45',
      'https://github.com.evil/usuario-s203/repositorio-s203/issues/45'
    ])
      forged.push(await storedNotification(owner, project.id, url));
    const status = await prisma.notification.create({
      data: {
        recipientUserId: owner.user.id,
        projectId: project.id,
        type: 'TASK_STATUS_CHANGED',
        dedupeKey: 'TASK_STATUS_CHANGED:movement:990001',
        taskTitle: 'Tarefa do S2-02',
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO'
      }
    });

    const exported = await owner
      .mutate('post', '/api/settings/privacy/export')
      .buffer(true)
      .parse(parseBinary)
      .send({});

    expect(exported.status).toBe(200);
    const items = new Map(
      readStoredJsonFiles(exported.body)['notifications.json'].map((item) => [item.id, item])
    );
    expect(longValid).toHaveLength(512);
    expect(items.get(valid.id).artifactUrl).toBe(`${ISSUE_URL}/45`);
    expect(items.get(longest.id).artifactUrl).toBe(longValid);
    for (const row of forged) expect(items.get(row.id).artifactUrl, row.artifactUrl).toBeNull();
    expect(Object.keys(items.get(status.id))).not.toContain('artifactUrl');
  });

  it('C7-02 o cliente desatualizado recebe a mensagem para recarregar; valor inválido mantém a mensagem de antes (EV-F-02)', async () => {
    const owner = await register();

    const outdated = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { TASK_STATUS_CHANGED: false, TASK_OVERDUE: false } });
    const invalid = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { ...ALL_ON, ISSUE_EVENT: 'true' } });

    expect(outdated.status).toBe(400);
    expect(outdated.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: RELOAD,
      details: [
        { field: 'preferences.ISSUE_EVENT', message: RELOAD },
        { field: 'preferences.PULL_REQUEST_EVENT', message: RELOAD },
        { field: 'preferences.TRACEABILITY_INCONSISTENCY', message: RELOAD }
      ]
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('Cada preferência deve ser verdadeira ou falsa.');
    expect((await owner.agent.get('/api/settings/notifications')).body).toEqual({
      preferences: ALL_ON
    });
    expect(
      await prisma.auditEvent.count({ where: { action: 'NOTIFICATION_PREFERENCES_UPDATED' } })
    ).toBe(0);
  });
});

describe('S2-03 correções — Fase 8: filtro por origem (S203-A08)', () => {
  const TASK_TYPES = ['TASK_STATUS_CHANGED', 'TASK_OVERDUE'];
  const GITHUB_TYPES = ['ISSUE_EVENT', 'PULL_REQUEST_EVENT'];

  async function bulk(recipient, projectId, type, count, start) {
    sequence += 1;
    const batch = sequence;
    await prisma.notification.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        recipientUserId: recipient.user.id,
        projectId,
        type,
        dedupeKey: `${type}:carga:${batch}:${index}`,
        taskTitle: `Tarefa ${batch}-${index}`,
        createdAt: new Date(start.getTime() + index * 1000)
      }))
    });
  }

  const list = (person, query) => person.agent.get(`/api/notifications?${query}`);
  const typesOf = (response) => [...new Set(response.body.notifications.map((item) => item.type))];

  it('C8-01 group filtra por origem e combina com status e page; sem group é ALL', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    const base = new Date('2026-10-01T12:00:00Z');
    await bulk(owner, project.id, 'ISSUE_EVENT', 2, base);
    await bulk(owner, project.id, 'PULL_REQUEST_EVENT', 1, base);
    await bulk(owner, project.id, 'TASK_STATUS_CHANGED', 1, base);
    await bulk(owner, project.id, 'TASK_OVERDUE', 1, base);
    await prisma.notification.updateMany({
      where: { recipientUserId: owner.user.id, type: 'PULL_REQUEST_EVENT' },
      data: { readAt: new Date() }
    });

    const github = await list(owner, 'status=ALL&group=GITHUB');
    const tasks = await list(owner, 'status=ALL&group=TASKS');
    const all = await list(owner, 'status=ALL&group=ALL');
    const plain = await list(owner, 'status=ALL');
    const unreadGithub = await list(owner, 'status=UNREAD&group=GITHUB&page=1&limit=1');

    expect(github.status).toBe(200);
    expect(github.body.pagination.total).toBe(3);
    expect(typesOf(github).sort()).toEqual([...GITHUB_TYPES].sort());
    expect(tasks.body.pagination.total).toBe(2);
    expect(typesOf(tasks).sort()).toEqual([...TASK_TYPES].sort());
    expect(all.body.pagination.total).toBe(5);
    expect(plain.body.notifications.map((item) => item.id)).toEqual(
      all.body.notifications.map((item) => item.id)
    );
    expect(unreadGithub.body.pagination).toMatchObject({ total: 2, totalPages: 2, page: 1 });
    expect(typesOf(unreadGithub)).toEqual(['ISSUE_EVENT']);
    for (const response of [github, tasks, all, unreadGithub])
      expect(response.body.unreadCount).toBe(4);
  });

  it('C8-02 em escala, TASKS traz os avisos de tarefa na primeira página e o cursor percorre cada origem sem perder nem repetir', async () => {
    const project = await createProject(prisma);
    const owner = await register(project.id);
    await bulk(owner, project.id, 'TASK_OVERDUE', 3, new Date('2026-09-01T12:00:00Z'));
    await bulk(owner, project.id, 'ISSUE_EVENT', 300, new Date('2026-10-01T12:00:00Z'));

    const tasks = await list(owner, 'group=TASKS&limit=20');
    const seen = [];
    let response = await list(owner, 'group=GITHUB&limit=100');
    for (;;) {
      seen.push(...response.body.notifications.map((item) => item.id));
      expect(response.body.unreadCount).toBe(303);
      if (!response.body.nextCursor) break;
      response = await list(
        owner,
        `group=GITHUB&limit=100&cursor=${encodeURIComponent(response.body.nextCursor)}`
      );
    }

    expect(tasks.body.notifications.map((item) => item.type)).toEqual([
      'TASK_OVERDUE',
      'TASK_OVERDUE',
      'TASK_OVERDUE'
    ]);
    expect(tasks.body.nextCursor).toBeNull();
    expect(tasks.body.unreadCount).toBe(303);
    expect(seen).toHaveLength(300);
    expect(new Set(seen).size).toBe(300);
  });

  it('C8-03 group inválido responde 400; o filtro não dá acesso a notificação alheia nem oculta', async () => {
    const project = await createProject(prisma);
    const hiddenProject = await createProject(prisma);
    const owner = await register(project.id);
    const other = await register(project.id);
    await prisma.projectMembership.create({
      data: { projectId: hiddenProject.id, userId: owner.user.id, role: 'MEMBER' }
    });
    await bulk(owner, project.id, 'ISSUE_EVENT', 1, new Date('2026-10-01T12:00:00Z'));
    await bulk(other, project.id, 'ISSUE_EVENT', 2, new Date('2026-10-01T12:00:00Z'));
    await bulk(owner, hiddenProject.id, 'ISSUE_EVENT', 1, new Date('2026-10-01T12:00:00Z'));
    await prisma.project.update({
      where: { id: hiddenProject.id },
      data: { deletedAt: new Date() }
    });

    for (const query of [
      'group=github',
      'group=',
      'group=OUTRO',
      'group=GITHUB&group=TASKS',
      'group[x]=GITHUB'
    ]) {
      const response = await list(owner, query);
      expect(response.status, query).toBe(400);
      expect(response.body.code, query).toBe('VALIDATION_ERROR');
    }
    const github = await list(owner, 'status=ALL&group=GITHUB');
    expect(github.body.pagination.total).toBe(1);
    expect(github.body.notifications.map((item) => item.project.id)).toEqual([project.id]);
  });
});
