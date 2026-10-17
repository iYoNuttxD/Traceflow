import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createPullRequest, createTask } from '../fixtures/factories.js';

const password = 'SenhaSegura123';
const RELOAD = 'As opções de notificação mudaram. Recarregue a página e salve de novo.';
const ALL_ON = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true,
  TRACEABILITY_INCONSISTENCY: true
};

let app;
let prisma;
let alertService;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  const { default: expressApp } = await import('../../src/app.js');
  app = await startTestServer(expressApp);
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
    name: `Pessoa aviso API ${sequence}`,
    username: `pr26avisoapi${sequence}`,
    email: `pr26-aviso-api-${sequence}@example.invalid`,
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

describe('PR #26 avisos de inconsistência — API (TF-REV-008)', () => {
  it('A-01 as preferências têm cinco chaves; o cliente de quatro recebe a mensagem para recarregar', async () => {
    const owner = await register();
    const fourKeys = Object.fromEntries(
      Object.entries(ALL_ON).filter(([type]) => type !== 'TRACEABILITY_INCONSISTENCY')
    );

    const initial = await owner.agent.get('/api/settings/notifications');
    const outdated = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: fourKeys });
    const saved = await owner
      .mutate('put', '/api/settings/notifications')
      .send({ preferences: { ...ALL_ON, TRACEABILITY_INCONSISTENCY: false } });

    expect(initial.body).toEqual({ preferences: ALL_ON });
    expect(outdated.status).toBe(400);
    expect(outdated.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: RELOAD,
      details: [{ field: 'preferences.TRACEABILITY_INCONSISTENCY', message: RELOAD }]
    });
    expect(saved.status).toBe(200);
    expect(saved.body.preferences).toEqual({ ...ALL_ON, TRACEABILITY_INCONSISTENCY: false });
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: owner.user.id }
    });
    expect(audit.metadataJson).toEqual({ changedTypes: 'TRACEABILITY_INCONSISTENCY' });
  });

  it('A-02 a origem INCONSISTENCIES lista só os avisos, sem tarefa e com o estado do alerta; origem desconhecida responde 400', async () => {
    const project = await createProject(prisma);
    const viewer = await register(project.id, 'VIEWER');
    const responsible = await register(project.id);
    const task = await createTask(prisma, project.id, {
      responsibleUserId: responsible.user.id
    });
    await prisma.notification.create({
      data: {
        recipientUserId: viewer.user.id,
        projectId: project.id,
        taskId: task.id,
        type: 'TASK_OVERDUE',
        dedupeKey: `TASK_OVERDUE:${task.id}:2026-10-10`,
        taskTitle: task.title,
        dueDate: new Date('2026-10-10T00:00:00.000Z')
      }
    });
    const pullRequest = await createPullRequest(prisma, project.id, {
      number: 31,
      state: 'closed',
      mergedAtGithub: new Date('2026-10-10T12:00:00.000Z'),
      githubUrl: 'https://github.com/o/r/pull/31'
    });
    await alertService.reconcileProject(project.id, { trigger: 'MANUAL' });
    const alert = await prisma.traceabilityAlert.findFirst({
      where: { pullRequestId: pullRequest.id }
    });

    const notices = await viewer.agent.get('/api/notifications?status=ALL&group=INCONSISTENCIES');
    const unknown = await viewer.agent.get('/api/notifications?group=OUTRO');

    expect(notices.status).toBe(200);
    expect(notices.body.unreadCount).toBe(2);
    expect(notices.body.pagination.total).toBe(1);
    expect(notices.body.notifications).toEqual([
      expect.objectContaining({
        type: 'TRACEABILITY_INCONSISTENCY',
        task: null,
        project: { id: project.id, name: project.name },
        link: `/projects/${project.id}/repository?alerta=${alert.id}`,
        context: {
          occurredAt: '2026-10-10T12:00:00.000Z',
          artifact: {
            kind: 'PULL_REQUEST',
            number: 31,
            title: pullRequest.title,
            url: 'https://github.com/o/r/pull/31'
          },
          alert: {
            id: alert.id,
            type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
            status: 'OPEN',
            resolvedAt: null,
            dismissedAt: null
          },
          batch: null
        }
      })
    ]);
    expect(JSON.stringify(notices.body)).not.toMatch(/dedupeKey|recipientUserId|email/);
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toContain('Use ALL, TASKS, GITHUB ou INCONSISTENCIES.');
  });
});
