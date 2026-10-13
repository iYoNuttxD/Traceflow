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
  'OUTSIDE_WINDOW',
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

const runJob = () =>
  createGithubEventNotificationService({
    configuration: { githubEventNotificationsLookbackDays: 7 }
  }).runJob({ dryRun: false });

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

  it('C4-03 o outcome dos eventos novos tem seis motivos e created + alreadyNotified = eligible', async () => {
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
