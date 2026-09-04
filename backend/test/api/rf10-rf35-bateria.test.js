import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
const password = 'SenhaSegura123';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, name = 'Pessoa artificial') {
  const agent = request.agent(app);
  const username = `u${email
    .split('@')[0]
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 29)}`;
  const response = await agent.post('/api/auth/register').send({ name, username, email, password });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  const csrf = response.body.csrfToken;
  return {
    agent,
    userId: response.body.user.id,
    csrf,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

function projectBody(name) {
  return {
    name,
    responsibleTeam: 'Equipe'
  };
}

async function createProject(session, name = 'Projeto Bateria') {
  const response = await session.mutate('post', '/api/projects').send(projectBody(name));
  return response.body.project;
}

async function createMilestone(session, projectId, overrides = {}) {
  return session
    .mutate('post', `/api/projects/${projectId}/milestones`)
    .send({ title: 'Entrega parcial', dueDate: '2026-08-10', ...overrides });
}

async function createSprint(session, projectId, overrides = {}) {
  const milestoneId =
    overrides.milestoneId ?? (await createMilestone(session, projectId)).body.milestone.id;
  return session.mutate('post', `/api/projects/${projectId}/sprints`).send({
    name: 'Sprint 1',
    objective: 'Identidade e acesso',
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    ...overrides,
    milestoneId
  });
}

describe('forma completa da sprint criada (S1-04 A1)', () => {
  it('o corpo devolve projeto, nome, objetivo, inicio, fim e status', async () => {
    const owner = await register('bateria-a1@example.invalid');
    const project = await createProject(owner);

    const created = await createSprint(owner, project.id);
    expect(created.status).toBe(201);
    expect(created.body.sprint).toMatchObject({
      projectId: project.id,
      name: 'Sprint 1',
      objective: 'Identidade e acesso',
      status: 'PLANEJADA'
    });
    expect(created.body.sprint.startDate).toBe('2026-08-01T00:00:00.000Z');
    expect(created.body.sprint.endDate).toBe('2026-08-14T00:00:00.000Z');
  });
});

describe('sprint cancelada libera as datas (I03, refinamento de 24/08)', () => {
  it('aceita cadastrar outra sprint sobre o periodo de uma cancelada', async () => {
    const owner = await register('bateria-i03@example.invalid');
    const project = await createProject(owner);
    const primeira = await createSprint(owner, project.id, { name: 'Sprint abortada' });
    const sprintId = primeira.body.sprint.id;

    const cancelada = await owner
      .mutate('patch', `/api/sprints/${sprintId}/status`)
      .send({ status: 'CANCELADA' });
    expect(cancelada.status).toBe(200);

    const segunda = await createSprint(owner, project.id, { name: 'Sprint substituta' });
    expect(segunda.status).toBe(201);
    expect(segunda.body.sprint.startDate).toBe('2026-08-01T00:00:00.000Z');

    const terceira = await createSprint(owner, project.id, { name: 'Sprint intrusa' });
    expect(terceira.status).toBe(409);
    expect(terceira.body.code).toBe('SPRINT_OVERLAP');
    expect(terceira.body.message).toContain('Sprint substituta');
  });
});

describe('exclusao recusada antes de qualquer leitura (I06)', () => {
  it('mantem o 404 opaco para id inexistente antes de recusar exclusao', async () => {
    const owner = await register('bateria-i06@example.invalid');
    await createProject(owner);

    const response = await owner.mutate('delete', '/api/sprints/999999').send();
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('marco nao congela junto com a sprint (I14, ADR-011 D04)', () => {
  it('edita titulo e prazo de um marco cuja unica sprint esta encerrada', async () => {
    const owner = await register('bateria-i14@example.invalid');
    const project = await createProject(owner);
    const milestone = (await createMilestone(owner, project.id)).body.milestone;
    const sprintId = (await createSprint(owner, project.id, { milestoneId: milestone.id })).body
      .sprint.id;

    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });
    const concluida = await owner
      .mutate('patch', `/api/sprints/${sprintId}/status`)
      .send({ status: 'CONCLUIDA' });
    expect(concluida.status).toBe(200);

    const updated = await owner
      .mutate('put', `/api/milestones/${milestone.id}`)
      .send({ title: 'Entrega replanejada', dueDate: '2026-09-30' });
    expect(updated.status).toBe(200);
    expect(updated.body.milestone.title).toBe('Entrega replanejada');
    expect(updated.body.milestone.dueDate).toBe('2026-09-30T00:00:00.000Z');
  });
});

describe('corte congelado e estavel (I30)', () => {
  it('duas consultas de evolucao da sprint encerrada devolvem o mesmo cutoff', async () => {
    const owner = await register('bateria-i30@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CONCLUIDA' });

    const primeira = await owner.agent.get(`/api/sprints/${sprintId}/progress`);
    const segunda = await owner.agent.get(`/api/sprints/${sprintId}/progress`);
    expect(primeira.status).toBe(200);
    expect(primeira.body.frozen).toBe(true);
    expect(segunda.body.cutoff).toBe(primeira.body.cutoff);
    const { completedAt } = await prisma.sprint.findUnique({ where: { id: sprintId } });
    expect(primeira.body.cutoff).toBe(completedAt.toISOString());
  });
});

describe('headers de resposta do modulo (ASVS 14.3.2 e 4.1.1)', () => {
  it('cronograma responde com no-store e JSON com charset', async () => {
    const owner = await register('bateria-headers@example.invalid');
    const project = await createProject(owner);
    await createSprint(owner, project.id);

    const response = await owner.agent.get(`/api/projects/${project.id}/schedule`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/application\/json; charset=utf-8/);
  });

  it('erro do modulo tambem sai com no-store', async () => {
    const owner = await register('bateria-headers-erro@example.invalid');
    await createProject(owner);
    const response = await owner.agent.get('/api/sprints/999999');
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('assassinos dos sobreviventes da bateria de mutacao', () => {
  it('a janela do cronograma inclui o proprio dia de `to` (I08)', async () => {
    const owner = await register('bateria-m13@example.invalid');
    const project = await createProject(owner);
    const milestone = (
      await createMilestone(owner, project.id, { title: 'Prazo na borda', dueDate: '2026-08-10' })
    ).body.milestone;
    await createSprint(owner, project.id, {
      name: 'Sprint da borda',
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      milestoneId: milestone.id
    });

    const response = await owner.agent.get(
      `/api/projects/${project.id}/schedule?from=2026-08-01&to=2026-08-10`
    );
    expect(response.status).toBe(200);
    expect(response.body.sprints.map((sprint) => sprint.name)).toContain('Sprint da borda');
    expect(response.body.milestones.map((m) => m.title)).toContain('Prazo na borda');
  });

  it('concluir a sprint nao reescreve a participacao de quem saiu antes', async () => {
    const owner = await register('bateria-m17@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = (
      await owner.mutate('post', `/api/projects/${project.id}/tasks`).send({ title: 'Volatil' })
    ).body.task;

    await owner.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds: [task.id] });
    await owner.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds: [] });

    const removida = await prisma.sprintTask.findFirst({
      where: { sprintId, taskId: task.id, removedAt: { not: null } }
    });
    expect(removida.exitStatus).toBe('A_FAZER');

    await owner.mutate('patch', `/api/tasks/${task.id}/status`).send({ status: 'CONCLUIDO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CONCLUIDA' });

    const depois = await prisma.sprintTask.findFirst({ where: { id: removida.id } });
    expect(depois.exitStatus).toBe('A_FAZER');
    expect(depois.closedAt).toBeNull();
    expect(depois.removedAt.toISOString()).toBe(removida.removedAt.toISOString());
  });

  it('a transicao de status gera exatamente um AuditEvent', async () => {
    const owner = await register('bateria-m33@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });

    const eventos = await prisma.auditEvent.findMany({
      where: { action: 'SPRINT_STATUS_CHANGED', resourceId: String(sprintId) }
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].actorUserId).toBe(owner.userId);
  });
});
