import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createIssue, createProject, createTask } from '../fixtures/factories.js';

let app;
let prisma;
let sequence = 0;
const password = 'SenhaSegura123';
const CLOSED_AT = new Date('2099-01-10T09:30:00.000Z');
const SECRET_ISSUE = 'Issue confidencial do PR26';
const SECRET_TASK = 'Tarefa confidencial do PR26';

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
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa PR26 ${sequence}`,
    username: `pr26leitura${sequence}`,
    email: `pr26-leitura-${sequence}@example.invalid`,
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

async function scenario() {
  const project = await createProject(prisma, {
    githubOwner: 'traceflow',
    githubRepo: `repo-pr26-${(sequence += 1)}`
  });
  await createIssue(prisma, project.id, {
    state: 'closed',
    closedAtGithub: CLOSED_AT,
    title: SECRET_ISSUE
  });
  await createTask(prisma, project.id, { title: SECRET_TASK });
  const { traceabilityAlertRepository } =
    await import('../../src/modules/traceability/traceability-alert.repository.js');
  await traceabilityAlertRepository.reconcileProject(project.id, { dryRun: false });
  const alert = await prisma.traceabilityAlert.findFirst({ where: { projectId: project.id } });
  return { project, alert };
}

function encoded(id) {
  return [...String(id)]
    .map((digit) => `%${digit.charCodeAt(0).toString(16).toUpperCase()}`)
    .join('');
}

function partlyEncoded(id) {
  const text = String(id);
  return `${text.slice(0, -1)}%${text.at(-1).charCodeAt(0).toString(16).toUpperCase()}`;
}

function reads(projectSegment, alertId) {
  const base = `/api/projects/${projectSegment}/traceability`;
  return [
    ['lista', `${base}/alerts`],
    ['resumo', `${base}/alerts/summary`],
    ['detalhe', `${base}/alerts/${alertId}`],
    ['tarefas sem vínculo técnico', `${base}/tasks-without-technical-links`]
  ];
}

function opaque(response) {
  return { status: response.status, code: response.body.code, message: response.body.message };
}

async function notFoundBaseline(agent) {
  return opaque(await agent.get('/api/projects/999999999/traceability/alerts'));
}

function expectNoSecret(response) {
  const body = JSON.stringify(response.body);
  expect(body).not.toContain(SECRET_ISSUE);
  expect(body).not.toContain(SECRET_TASK);
}

describe('PR26 TF-REV-001: leituras de alertas com membership ativa', () => {
  it('L-01 a L-04 os quatro papéis leem as quatro rotas, com permissions do próprio papel', async () => {
    const { project, alert } = await scenario();
    const expected = {
      VIEWER: { canLink: false, canManage: false },
      MEMBER: { canLink: true, canManage: false },
      MANAGER: { canLink: true, canManage: true },
      OWNER: { canLink: true, canManage: true }
    };
    for (const role of Object.keys(expected)) {
      const { agent } = await register(role, project.id);
      for (const [name, path] of reads(project.id, alert.id)) {
        const response = await agent.get(path);
        expect(response.status, `${role} ${name}`).toBe(200);
        if (name !== 'tarefas sem vínculo técnico')
          expect(response.body.permissions, `${role} ${name}`).toEqual(expected[role]);
      }
    }
  });

  it('L-05 a L-08 não membro recebe o 404 opaco do middleware nas quatro rotas', async () => {
    const { project, alert } = await scenario();
    const { agent } = await register();
    const baseline = await notFoundBaseline(agent);
    expect(baseline).toEqual({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Recurso não encontrado.'
    });
    for (const [name, path] of reads(project.id, alert.id)) {
      const response = await agent.get(path);
      expect(opaque(response), name).toEqual(baseline);
      expectNoSecret(response);
    }
  });

  it('L-09 a L-12 ID codificado não entrega as quatro leituras ao não membro', async () => {
    const { project, alert } = await scenario();
    const { agent } = await register();
    const baseline = await notFoundBaseline(agent);
    for (const segment of [encoded(project.id), partlyEncoded(project.id)]) {
      for (const [name, path] of reads(segment, alert.id)) {
        const response = await agent.get(path);
        expect(opaque(response), `${segment} ${name}`).toEqual(baseline);
        expectNoSecret(response);
      }
    }
  });

  it('L-13 a L-16 membership removida e projeto excluído recebem 404, também com ID codificado', async () => {
    const { project, alert } = await scenario();
    const removed = await register('MEMBER', project.id);
    const owner = await register('OWNER', project.id);
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: removed.user.id } },
      data: { isActive: false }
    });
    const baseline = await notFoundBaseline(removed.agent);
    for (const segment of [String(project.id), encoded(project.id)]) {
      for (const [name, path] of reads(segment, alert.id)) {
        const response = await removed.agent.get(path);
        expect(opaque(response), `removida ${segment} ${name}`).toEqual(baseline);
        expectNoSecret(response);
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    for (const segment of [String(project.id), encoded(project.id)]) {
      for (const [name, path] of reads(segment, alert.id)) {
        const response = await owner.agent.get(path);
        expect(opaque(response), `excluído ${segment} ${name}`).toEqual(baseline);
        expectNoSecret(response);
      }
    }
  });

  it('L-17 o serviço recusa sozinho a membership inativa e o projeto excluído, sem depender do middleware', async () => {
    const { project, alert } = await scenario();
    const removed = await register('MEMBER', project.id);
    const owner = await register('OWNER', project.id);
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: removed.user.id } },
      data: { isActive: false }
    });
    const { traceabilityAlertService: service } =
      await import('../../src/modules/traceability/traceability-alert.service.js');
    const calls = (actorUserId) => [
      ['lista', () => service.list(project.id, {}, { actorUserId })],
      ['índice', () => service.index(project.id, {}, { actorUserId })],
      ['resumo', () => service.summary(project.id, { actorUserId })],
      ['detalhe', () => service.get(project.id, alert.id, { actorUserId })],
      [
        'tarefas sem vínculo técnico',
        () => service.listUnlinkedTasks(project.id, {}, { actorUserId })
      ]
    ];
    const refused = { statusCode: 404, code: 'RESOURCE_NOT_FOUND' };

    for (const [name, call] of calls(owner.user.id))
      await expect(call(), `ativa ${name}`).resolves.toBeTruthy();
    for (const [name, call] of calls(removed.user.id))
      await expect(call(), `inativa ${name}`).rejects.toMatchObject(refused);
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    for (const [name, call] of calls(owner.user.id))
      await expect(call(), `excluído ${name}`).rejects.toMatchObject(refused);
  });
});
