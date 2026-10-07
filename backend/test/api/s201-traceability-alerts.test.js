import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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

let app;
let prisma;
let sequence = 0;
const password = 'SenhaSegura123';
const CLOSED_AT = new Date('2099-01-10T09:30:00.000Z');
const VALID_REASON = 'PR de dependência sem tarefa associada.';

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(role, projectId) {
  sequence += 1;
  const email = `s201-api-${sequence}@example.invalid`;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa S2-01 ${sequence}`,
    username: `s201api${sequence}`,
    email,
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

const integrated = () =>
  createProject(prisma, { githubOwner: 'traceflow', githubRepo: `repo-${(sequence += 1)}` });

async function issueAlerts(projectId, count) {
  for (let index = 0; index < count; index += 1)
    await createIssue(prisma, projectId, { state: 'closed', closedAtGithub: CLOSED_AT });
  return reconcileDirect(projectId);
}

async function reconcileDirect(projectId) {
  const { traceabilityAlertRepository } =
    await import('../../src/modules/traceability/traceability-alert.repository.js');
  return traceabilityAlertRepository.reconcileProject(projectId, { dryRun: false });
}

function firstAlert(projectId) {
  return prisma.traceabilityAlert.findFirst({ where: { projectId }, orderBy: { id: 'asc' } });
}

const base = (projectId) => `/api/projects/${projectId}/traceability`;

describe('S2-01 API de alertas: autorização (D8)', () => {
  it('aplica a matriz de papéis em leitura, dispensa e reprocessamento', async () => {
    const project = await integrated();
    await issueAlerts(project.id, 3);
    const [viewer, member, manager, owner, outsider] = await Promise.all([
      register('VIEWER', project.id),
      register('MEMBER', project.id),
      register('MANAGER', project.id),
      register('OWNER', project.id),
      register()
    ]);
    const alerts = await prisma.traceabilityAlert.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' }
    });
    const dismiss = (auth, alert) =>
      auth
        .mutate('post', `${base(project.id)}/alerts/${alert.id}/dismiss`)
        .send({ reason: VALID_REASON });

    expect((await request(app).get(`${base(project.id)}/alerts`)).status).toBe(401);
    expect((await outsider.agent.get(`${base(project.id)}/alerts`)).status).toBe(404);
    expect((await outsider.agent.get(`${base(project.id)}/alerts/summary`)).status).toBe(404);

    const viewerList = await viewer.agent.get(`${base(project.id)}/alerts`);
    expect(viewerList.status).toBe(200);
    expect(viewerList.body.permissions).toEqual({ canLink: false, canManage: false });
    expect((await viewer.agent.get(`${base(project.id)}/alerts/${alerts[0].id}`)).status).toBe(200);
    expect(
      (await viewer.agent.get(`${base(project.id)}/tasks-without-technical-links`)).status
    ).toBe(200);
    expect((await dismiss(viewer, alerts[0])).status).toBe(403);
    expect(
      (await viewer.mutate('post', `${base(project.id)}/alerts/reconcile`).send({})).status
    ).toBe(403);

    const memberList = await member.agent.get(`${base(project.id)}/alerts`);
    expect(memberList.body.permissions).toEqual({ canLink: true, canManage: false });
    expect((await dismiss(member, alerts[0])).status).toBe(403);
    expect(
      (await member.mutate('post', `${base(project.id)}/alerts/reconcile`).send({})).status
    ).toBe(403);

    const managerSummary = await manager.agent.get(`${base(project.id)}/alerts/summary`);
    expect(managerSummary.body.permissions).toEqual({ canLink: true, canManage: true });
    expect((await dismiss(manager, alerts[0])).status).toBe(200);
    expect((await dismiss(owner, alerts[1])).status).toBe(200);
    expect(
      (await manager.mutate('post', `${base(project.id)}/alerts/reconcile`).send({})).status
    ).toBe(200);
    expect(
      (await owner.mutate('post', `${base(project.id)}/alerts/reconcile`).send({})).status
    ).toBe(200);
  });

  it('exige CSRF nas mutações', async () => {
    const project = await integrated();
    await issueAlerts(project.id, 1);
    const manager = await register('MANAGER', project.id);
    const alert = await firstAlert(project.id);

    const withoutToken = await manager.agent
      .post(`${base(project.id)}/alerts/${alert.id}/dismiss`)
      .send({ reason: VALID_REASON });

    expect(withoutToken.status).toBe(403);
    expect((await firstAlert(project.id)).status).toBe('OPEN');
  });

  it('não revela alerta de outro projeto pelo caminho do projeto do ator', async () => {
    const projectA = await integrated();
    const projectB = await integrated();
    await issueAlerts(projectA.id, 1);
    const manager = await register('MANAGER', projectB.id);
    const foreign = await firstAlert(projectA.id);

    const read = await manager.agent.get(`${base(projectB.id)}/alerts/${foreign.id}`);
    const dismissal = await manager
      .mutate('post', `${base(projectB.id)}/alerts/${foreign.id}/dismiss`)
      .send({ reason: VALID_REASON });

    expect(read.status).toBe(404);
    expect(read.body.code).toBe('TRACEABILITY_ALERT_NOT_FOUND');
    expect(JSON.stringify(read.body)).not.toContain(foreign.subjectTitle);
    expect(dismissal.status).toBe(404);
    expect((await firstAlert(projectA.id)).status).toBe('OPEN');
  });
});

describe('S2-01 API de alertas: listagem, filtros, resumo e paginação (CA6)', () => {
  it('pagina com total do projeto e rejeita limite e parâmetro inválidos', async () => {
    const project = await integrated();
    await issueAlerts(project.id, 25);
    const viewer = await register('VIEWER', project.id);
    const page = (query) => viewer.agent.get(`${base(project.id)}/alerts`).query(query);

    const first = await page({ limit: 10 });
    const last = await page({ limit: 10, page: 3 });
    const beyond = await page({ limit: 10, page: 4 });

    expect(first.body.alerts).toHaveLength(10);
    expect(first.body.pagination).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
    expect(last.body.alerts).toHaveLength(5);
    expect(beyond.body.alerts).toEqual([]);
    expect(beyond.body.pagination.total).toBe(25);
    const ids = [
      ...first.body.alerts,
      ...(await page({ limit: 10, page: 2 })).body.alerts,
      ...last.body.alerts
    ].map((alert) => alert.id);
    expect(new Set(ids).size).toBe(25);
    expect((await page({ limit: 101 })).status).toBe(400);
    expect((await page({ order: 'asc' })).status).toBe(400);
    expect((await page({ status: 'ARCHIVED' })).status).toBe(400);
  });

  it('filtra por situação e tipo, com OPEN por padrão, e resume o projeto inteiro', async () => {
    const project = await integrated();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: CLOSED_AT,
      closedAtGithub: CLOSED_AT
    });
    await issueAlerts(project.id, 2);
    const manager = await register('MANAGER', project.id);
    const issues = await prisma.traceabilityAlert.findMany({
      where: { projectId: project.id, type: 'ISSUE_CLOSED_WITHOUT_TASK' }
    });
    await manager
      .mutate('post', `${base(project.id)}/alerts/${issues[0].id}/dismiss`)
      .send({ reason: VALID_REASON });

    const open = await manager.agent.get(`${base(project.id)}/alerts`).query({ limit: 1 });
    const dismissed = await manager.agent
      .get(`${base(project.id)}/alerts`)
      .query({ status: 'DISMISSED' });
    const byType = await manager.agent
      .get(`${base(project.id)}/alerts`)
      .query({ type: 'PULL_REQUEST_MERGED_WITHOUT_TASK' });
    const summary = await manager.agent.get(`${base(project.id)}/alerts/summary`);

    expect(open.body.status).toBe('OPEN');
    expect(open.body.pagination.total).toBe(3);
    expect(dismissed.body.alerts.map((alert) => alert.id)).toEqual([issues[0].id]);
    expect(dismissed.body.alerts[0].dismissal).toMatchObject({
      reason: VALID_REASON,
      by: { id: manager.user.id, name: manager.user.name }
    });
    expect(byType.body.alerts.map((alert) => alert.type)).toEqual([
      'PULL_REQUEST_MERGED_WITHOUT_TASK'
    ]);
    expect(summary.body).toMatchObject({
      projectId: project.id,
      open: {
        total: 3,
        byType: {
          TASK_CONCLUDED_WITHOUT_COMMIT: 1,
          PULL_REQUEST_MERGED_WITHOUT_TASK: 1,
          ISSUE_CLOSED_WITHOUT_TASK: 1
        }
      },
      dismissed: { total: 1 },
      rules: { taskWithoutCommitActive: true }
    });
  });

  it('informa que a regra de tarefa sem commit está inativa sem integração', async () => {
    const project = await createProject(prisma);
    const viewer = await register('VIEWER', project.id);

    const summary = await viewer.agent.get(`${base(project.id)}/alerts/summary`);

    expect(summary.body.rules.taskWithoutCommitActive).toBe(false);
    expect(summary.body.open.total).toBe(0);
  });
});

describe('S2-01 API de alertas: dispensa (D7)', () => {
  it('valida a justificativa com trim e limites de 10 a 500 caracteres', async () => {
    const project = await integrated();
    await issueAlerts(project.id, 2);
    const manager = await register('MANAGER', project.id);
    const [first, second] = await prisma.traceabilityAlert.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' }
    });
    const dismiss = (alert, body) =>
      manager.mutate('post', `${base(project.id)}/alerts/${alert.id}/dismiss`).send(body);

    expect((await dismiss(first, { reason: 'curto 123' })).status).toBe(400);
    expect((await dismiss(first, { reason: `   ${'a'.repeat(9)}   ` })).status).toBe(400);
    expect((await dismiss(first, { reason: 'a'.repeat(501) })).status).toBe(400);
    expect((await dismiss(first, {})).status).toBe(400);
    expect((await dismiss(first, { reason: VALID_REASON, extra: true })).status).toBe(400);
    const accepted = await dismiss(first, { reason: `  ${'b'.repeat(500)}  ` });
    expect(accepted.status).toBe(200);
    expect(accepted.body.alert.dismissal.reason).toBe('b'.repeat(500));
    expect((await dismiss(second, { reason: 'a'.repeat(10) })).status).toBe(200);
  });

  it('é idempotente, recusa alerta resolvido e audita sem conteúdo livre', async () => {
    const project = await integrated();
    await issueAlerts(project.id, 2);
    const manager = await register('MANAGER', project.id);
    const [open, resolved] = await prisma.traceabilityAlert.findMany({
      where: { projectId: project.id },
      orderBy: { id: 'asc' }
    });
    await prisma.traceabilityAlert.update({
      where: { id: resolved.id },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionReason: 'ISSUE_LINKED' }
    });
    const dismiss = (alert, reason) =>
      manager.mutate('post', `${base(project.id)}/alerts/${alert.id}/dismiss`).send({ reason });

    const first = await dismiss(open, VALID_REASON);
    const again = await dismiss(open, 'Outra justificativa qualquer.');
    const conflict = await dismiss(resolved, VALID_REASON);

    expect(first.body).toMatchObject({ changed: true, alert: { status: 'DISMISSED' } });
    expect(again.status).toBe(200);
    expect(again.body.changed).toBe(false);
    expect(again.body.alert.dismissal.reason).toBe(VALID_REASON);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('TRACEABILITY_ALERT_NOT_OPEN');
    const events = await prisma.auditEvent.findMany({
      where: { action: 'TRACEABILITY_ALERT_DISMISSED', projectId: project.id }
    });
    expect(events).toHaveLength(1);
    expect(events[0].metadataJson).toEqual({ alertType: 'ISSUE_CLOSED_WITHOUT_TASK' });
    expect(JSON.stringify(events[0])).not.toContain(VALID_REASON);
  });
});

describe('S2-01 API de alertas: reprocessamento (CA4)', () => {
  it('reprocessar duas vezes não duplica e registra auditoria com contagens', async () => {
    const project = await integrated();
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: CLOSED_AT });
    const manager = await register('MANAGER', project.id);
    const reconcile = () => manager.mutate('post', `${base(project.id)}/alerts/reconcile`).send({});

    const first = await reconcile();
    const second = await reconcile();

    expect(first.body).toEqual({
      projectId: project.id,
      result: { created: 2, resolved: 0, kept: 0 }
    });
    expect(second.body.result).toEqual({ created: 0, resolved: 0, kept: 2 });
    expect(await prisma.traceabilityAlert.count({ where: { projectId: project.id } })).toBe(2);
    const events = await prisma.auditEvent.findMany({
      where: { action: 'TRACEABILITY_ALERTS_RECONCILED', projectId: project.id },
      orderBy: { id: 'asc' }
    });
    expect(events.map((event) => event.metadataJson)).toEqual([
      { created: 2, resolved: 0 },
      { created: 0, resolved: 0 }
    ]);
  });
});

describe('S2-01 API de alertas: DTO e contexto', () => {
  it('detalha alerta de tarefa com PR vinculada, sugestões pendentes e sem dados internos', async () => {
    const project = await integrated();
    const pullRequest = await createPullRequest(prisma, project.id, {
      githubUrl: 'https://github.com/traceflow/repo/pull/7'
    });
    const task = await createTask(prisma, project.id, {
      status: 'CONCLUIDO',
      title: 'Tela de login',
      pullRequestId: pullRequest.id
    });
    const commit = await createCommit(prisma, project.id);
    await prisma.taskCommitSuggestion.create({
      data: { projectId: project.id, taskId: task.id, commitId: commit.id }
    });
    await reconcileDirect(project.id);
    const viewer = await register('VIEWER', project.id);
    const alert = await firstAlert(project.id);

    const detail = await viewer.agent.get(`${base(project.id)}/alerts/${alert.id}`);

    expect(detail.status).toBe(200);
    expect(detail.body.alert).toMatchObject({
      id: alert.id,
      type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
      status: 'OPEN',
      occurredAt: null,
      limitations: ['COMPLETION_TIME_UNAVAILABLE'],
      subject: {
        type: 'TASK',
        id: task.id,
        code: `TASK-${task.id}`,
        title: 'Tela de login',
        available: true,
        githubUrl: null
      },
      context: {
        status: 'CONCLUIDO',
        requirement: null,
        responsible: null,
        pullRequest: {
          id: pullRequest.id,
          number: pullRequest.number,
          title: pullRequest.title,
          githubUrl: 'https://github.com/traceflow/repo/pull/7'
        },
        issueCount: 0,
        pendingCommitSuggestions: 1
      }
    });
    const serialized = JSON.stringify(detail.body);
    for (const internal of ['activeKey', 'dedupeKey', 'email', 'subjectTitle', 'authorUsername'])
      expect(serialized).not.toContain(internal);
  });

  it('mostra o snapshot do sujeito quando a tarefa foi excluída', async () => {
    const project = await integrated();
    const task = await createTask(prisma, project.id, {
      status: 'CONCLUIDO',
      title: 'Relatório mensal'
    });
    await reconcileDirect(project.id);
    const member = await register('MEMBER', project.id);
    expect((await member.mutate('delete', `/api/tasks/${task.id}`).send()).status).toBe(200);

    const resolved = await member.agent
      .get(`${base(project.id)}/alerts`)
      .query({ status: 'RESOLVED' });

    expect(resolved.body.alerts).toEqual([
      expect.objectContaining({
        status: 'RESOLVED',
        resolutionReason: 'TASK_DELETED',
        subject: {
          type: 'TASK',
          id: null,
          code: `TASK-${task.id}`,
          title: 'Relatório mensal',
          available: false,
          githubUrl: null
        }
      })
    ]);
  });
});

describe('S2-01 API RF58: tarefas sem vínculo técnico (CA3)', () => {
  it('lista só tarefas sem commit, sem PR e sem issue, com filtro e paginação', async () => {
    const project = await createProject(prisma);
    const viewer = await register('VIEWER', project.id);
    const bare = await createTask(prisma, project.id, {
      title: 'Sem vínculo',
      status: 'CONCLUIDO'
    });
    const bareTodo = await createTask(prisma, project.id, { title: 'Sem vínculo a fazer' });
    const withIssue = await createTask(prisma, project.id);
    await prisma.taskIssue.create({
      data: { taskId: withIssue.id, issueId: (await createIssue(prisma, project.id)).id }
    });
    const withCommit = await createTask(prisma, project.id);
    await prisma.taskCommit.create({
      data: { taskId: withCommit.id, commitId: (await createCommit(prisma, project.id)).id }
    });
    await createTask(prisma, project.id, {
      pullRequestId: (await createPullRequest(prisma, project.id)).id
    });
    const list = (query = {}) =>
      viewer.agent.get(`${base(project.id)}/tasks-without-technical-links`).query(query);

    const all = await list();
    const done = await list({ status: 'CONCLUIDO' });
    const paged = await list({ limit: 1, page: 2 });

    expect(all.status).toBe(200);
    expect(all.body.tasks.map((task) => task.id).sort()).toEqual([bare.id, bareTodo.id].sort());
    expect(all.body.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
    expect(done.body.tasks).toEqual([
      {
        id: bare.id,
        code: `TASK-${bare.id}`,
        title: 'Sem vínculo',
        status: 'CONCLUIDO',
        responsible: null,
        requirement: null,
        updatedAt: expect.any(String)
      }
    ]);
    expect(paged.body.tasks).toHaveLength(1);
    expect(paged.body.pagination).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect((await list({ status: 'FEITO' })).status).toBe(400);
  });
});
