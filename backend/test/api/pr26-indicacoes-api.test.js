import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createCommit,
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

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

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(projectId, role = 'VIEWER') {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa indicação ${sequence}`,
    username: `pr26indicacao${sequence}`,
    email: `pr26-indicacao-${sequence}@example.invalid`,
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
  return { agent, user: response.body.user };
}

function alert(projectId, subject, overrides = {}) {
  sequence += 1;
  const [type, key, code] = subject.taskId
    ? ['TASK_CONCLUDED_WITHOUT_COMMIT', 'taskId', `TASK-${subject.taskId}`]
    : subject.pullRequestId
      ? ['PULL_REQUEST_MERGED_WITHOUT_TASK', 'pullRequestId', 'PR #1']
      : ['ISSUE_CLOSED_WITHOUT_TASK', 'issueId', 'Issue #1'];
  return prisma.traceabilityAlert.create({
    data: {
      projectId,
      type,
      [key]: subject[key],
      dedupeKey: `${type}:${subject[key]}:${sequence}`,
      subjectCode: code,
      subjectTitle: 'Sujeito',
      occurredAt: new Date('2026-10-10T12:00:00.000Z'),
      detectedAt: new Date('2026-10-11T12:00:00.000Z'),
      ...overrides
    }
  });
}

describe('PR #26 índice de alertas e histórico por sujeito (TF-REV-008, RF13, RF39, RF40)', () => {
  it('IND-01 o índice agrupa os alertas abertos por sujeito, exige membership e não cai em :alertId', async () => {
    const project = await createProject(prisma);
    const viewer = await register(project.id);
    const outsider = await register();
    const task = await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    const pullRequest = await createPullRequest(prisma, project.id, { state: 'closed' });
    const issue = await createIssue(prisma, project.id, { state: 'closed' });
    const taskAlert = await alert(project.id, { taskId: task.id });
    const prAlert = await alert(project.id, { pullRequestId: pullRequest.id });
    await alert(project.id, { issueId: issue.id }, { status: 'DISMISSED' });

    const open = await viewer.agent.get(`/api/projects/${project.id}/traceability/alerts/index`);
    const dismissed = await viewer.agent.get(
      `/api/projects/${project.id}/traceability/alerts/index?status=DISMISSED`
    );
    const denied = await outsider.agent.get(
      `/api/projects/${project.id}/traceability/alerts/index`
    );
    const invalid = await viewer.agent.get(
      `/api/projects/${project.id}/traceability/alerts/index?status=ALL`
    );

    expect(open.status).toBe(200);
    expect(open.body).toEqual({
      projectId: project.id,
      status: 'OPEN',
      tasks: [{ subjectId: task.id, alertId: taskAlert.id }],
      pullRequests: [{ subjectId: pullRequest.id, alertId: prAlert.id }],
      issues: []
    });
    expect(dismissed.body.issues).toHaveLength(1);
    expect(denied.status).toBe(404);
    expect(invalid.status).toBe(400);
  });

  it('IND-02 a listagem filtra por sujeito e aceita ALL para o histórico; dois sujeitos respondem 400', async () => {
    const project = await createProject(prisma);
    const viewer = await register(project.id);
    const task = await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    const other = await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await alert(project.id, { taskId: task.id }, { status: 'RESOLVED', resolvedAt: new Date() });
    await alert(
      project.id,
      { taskId: task.id },
      { status: 'DISMISSED', dismissedAt: new Date(), dismissalReason: 'Tarefa de documentação.' }
    );
    await alert(project.id, { taskId: task.id });
    await alert(project.id, { taskId: other.id });

    const history = await viewer.agent.get(
      `/api/projects/${project.id}/traceability/alerts?status=ALL&taskId=${task.id}`
    );
    const both = await viewer.agent.get(
      `/api/projects/${project.id}/traceability/alerts?taskId=${task.id}&issueId=1`
    );

    expect(history.status).toBe(200);
    expect(history.body.status).toBe('ALL');
    expect(history.body.alerts.map((item) => item.status).sort()).toEqual([
      'DISMISSED',
      'OPEN',
      'RESOLVED'
    ]);
    expect(history.body.pagination.total).toBe(3);
    expect(both.status).toBe(400);
  });
});

describe('PR #26 inconsistência nos artefatos (TF-REV-008, RF39, RF40)', () => {
  it('IND-03 cada PR e issue traz a inconsistência atual; o filtro é do servidor e o resumo conta por situação', async () => {
    const project = await createProject(prisma);
    const viewer = await register(project.id);
    const openPr = await createPullRequest(prisma, project.id, {
      number: 41,
      state: 'closed',
      mergedAtGithub: new Date('2026-10-10T12:00:00.000Z'),
      createdAtGithub: new Date('2026-10-09T12:00:00.000Z')
    });
    const resolvedIssue = await createIssue(prisma, project.id, {
      number: 42,
      state: 'closed',
      createdAtGithub: new Date('2026-10-08T12:00:00.000Z')
    });
    const cleanPr = await createPullRequest(prisma, project.id, {
      number: 43,
      state: 'open',
      createdAtGithub: new Date('2026-10-07T12:00:00.000Z')
    });
    await createCommit(prisma, project.id, { date: new Date('2026-10-06T12:00:00.000Z') });
    await alert(
      project.id,
      { pullRequestId: openPr.id },
      {
        status: 'RESOLVED',
        resolvedAt: new Date('2026-10-12T12:00:00.000Z'),
        detectedAt: new Date('2026-10-11T12:00:00.000Z')
      }
    );
    const current = await alert(
      project.id,
      { pullRequestId: openPr.id },
      {
        detectedAt: new Date('2026-10-13T12:00:00.000Z')
      }
    );
    await alert(
      project.id,
      { issueId: resolvedIssue.id },
      {
        status: 'RESOLVED',
        resolvedAt: new Date('2026-10-14T12:00:00.000Z')
      }
    );

    const all = await viewer.agent.get(`/api/projects/${project.id}/artifacts`);
    const open = await viewer.agent.get(`/api/projects/${project.id}/artifacts?inconsistency=OPEN`);
    const invalid = await viewer.agent.get(
      `/api/projects/${project.id}/artifacts?inconsistency=ALL`
    );

    expect(all.status).toBe(200);
    const byKey = new Map(all.body.artifacts.map((item) => [`${item.type}:${item.id}`, item]));
    expect(byKey.get(`pull_request:${openPr.id}`).inconsistency).toEqual({
      alertId: current.id,
      status: 'OPEN',
      detectedAt: '2026-10-13T12:00:00.000Z',
      resolvedAt: null,
      dismissedAt: null
    });
    expect(byKey.get(`issue:${resolvedIssue.id}`).inconsistency).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: '2026-10-14T12:00:00.000Z'
    });
    expect(byKey.get(`pull_request:${cleanPr.id}`).inconsistency).toBeNull();
    expect(all.body.artifacts.find((item) => item.type === 'commit').inconsistency).toBeNull();
    expect(all.body.summary.inconsistencies).toEqual({ open: 1, dismissed: 0, resolved: 1 });
    expect(open.body.artifacts.map((item) => item.id)).toEqual([openPr.id]);
    expect(open.body.filters.inconsistency).toBe('OPEN');
    expect(open.body.summary).toMatchObject({
      total: 1,
      inconsistencies: { open: 1, dismissed: 0, resolved: 1 }
    });
    expect(invalid.status).toBe(400);
  });
});
