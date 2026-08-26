// Bateria RF10/RF35 (docs/issues/RF10_RF35_PROMPT_TESTES.md) — casos que a
// auditoria da Fase 1 encontrou sem prova no caminho HTTP: a forma completa da
// sprint criada (A1), a liberacao das datas pela cancelada (I03), o 405 antes
// de qualquer leitura (I06), o marco que nao congela junto com a sprint (I14),
// a estabilidade do corte congelado (I30) e os headers anti-cache e de charset
// (ASVS 14.3.2 / 4.1.1). Mesmo harness do schedule-contracts: app real, MySQL
// de teste, sessao e CSRF verdadeiros.
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
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, name = 'Pessoa artificial') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name, email, password });
  const csrf = response.body.csrfToken;
  return {
    agent,
    userId: response.body.user.id,
    csrf,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

function projectBody(name) {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return {
    name,
    responsibleTeam: 'Equipe',
    githubOwner: 'fake-owner',
    githubRepo: slug,
    githubUrl: `https://github.com/fake-owner/${slug}`
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
    // Cada campo do criterio A1, um a um — `toMatchObject` parcial deixaria um
    // campo sumir do contrato sem nenhum teste reclamar.
    expect(created.body.sprint).toMatchObject({
      projectId: project.id,
      name: 'Sprint 1',
      objective: 'Identidade e acesso',
      status: 'PLANEJADA'
    });
    // Datas de calendario viram o inicio do dia em UTC (ADR-010 D05).
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

    // Mesmo periodo exato: sem o filtro de canceladas, isto seria 409 OVERLAP.
    const segunda = await createSprint(owner, project.id, { name: 'Sprint substituta' });
    expect(segunda.status).toBe(201);
    expect(segunda.body.sprint.startDate).toBe('2026-08-01T00:00:00.000Z');

    // E a regra continua mordendo entre sprints vivas: uma terceira sobre o
    // mesmo periodo conflita com a substituta, nao com a cancelada.
    const terceira = await createSprint(owner, project.id, { name: 'Sprint intrusa' });
    expect(terceira.status).toBe(409);
    expect(terceira.body.code).toBe('SPRINT_OVERLAP');
    expect(terceira.body.message).toContain('Sprint substituta');
  });
});

describe('exclusao recusada antes de qualquer leitura (I06)', () => {
  it('responde 405 ate para id inexistente — nunca 404', async () => {
    const owner = await register('bateria-i06@example.invalid');
    await createProject(owner);

    // Se a rota consultasse a sprint antes de recusar, um id inexistente
    // viraria 404 — e um atacante poderia usar o par 404/405 para sondar quais
    // ids existem. O 405 incondicional e o que o teste do service (linha 815)
    // afirma por dentro; aqui a mesma precedencia e provada pela borda HTTP.
    const response = await owner.mutate('delete', '/api/sprints/999999').send();
    expect(response.status).toBe(405);
    expect(response.body.code).toBe('SPRINT_DELETE_NOT_SUPPORTED');
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

    // A sprint terminou; o marco segue vivo e editavel enquanto o projeto
    // existir. Congela-lo junto transformaria uma data de planejamento em
    // registro imutavel que ninguem decidiu congelar.
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
    // O corte e o encerramento, nao o momento da consulta: as duas leituras
    // falam do mesmo instante, senao a sprint "encerrada" ainda envelheceria.
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
    // `no-store` esta implementado em shared/security/headers.js e documentado
    // no API_CONTRACTS ha eras — mas nenhum teste o afirmava. Se um refactor
    // de middleware o derrubar, dados de projeto passam a ser cacheaveis por
    // proxies e navegadores sem ninguem notar.
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
  // M13: sem o dia extra de `nextUtcDay`, "ate 10/08" excluiria o proprio dia
  // 10 — e nenhum teste da suite percebia. O evento que existe SO no dia `to`
  // e o que mata a mutacao.
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
    // A sprint comeca exatamente no dia `to`; o marco vence nele.
    expect(response.body.sprints.map((sprint) => sprint.name)).toContain('Sprint da borda');
    expect(response.body.milestones.map((m) => m.title)).toContain('Prazo na borda');
  });

  // M17: o congelamento do encerramento so pode tocar as participacoes VIVAS.
  // A que saiu antes ja congelou o proprio registro na saida — sobrescreve-lo
  // com o status atual da tarefa reescreveria o periodo encerrado (I19/D04).
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

    // A tarefa evolui DEPOIS da saida; o registro da sprint nao pode segui-la.
    await owner.mutate('patch', `/api/tasks/${task.id}/status`).send({ status: 'CONCLUIDO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CONCLUIDA' });

    const depois = await prisma.sprintTask.findFirst({ where: { id: removida.id } });
    expect(depois.exitStatus).toBe('A_FAZER');
    // Quem saiu antes nao "fecha com a sprint": `closedAt` pertence ao
    // congelamento das participacoes VIVAS, e na removida permanece nulo. A
    // mutacao que remove o filtro gravaria o instante do encerramento aqui.
    expect(depois.closedAt).toBeNull();
    expect(depois.removedAt.toISOString()).toBe(removida.removedAt.toISOString());
  });

  // M33: a transicao de status ficou fora do teste "um AuditEvent por
  // mutacao" — remover a auditoria dela nao derrubava teste nenhum (ASVS
  // 16.3.3). Aqui a trilha da transicao vira contrato.
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
