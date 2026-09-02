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
let sequencia = 0;
const unico = () => {
  sequencia += 1;
  return `${Date.now()}-${sequencia}`;
};

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

async function registrar(nome = 'Pessoa da campanha') {
  const agent = request.agent(app);
  const identificador = unico();
  const email = `cp-${identificador}@example.invalid`;
  const response = await agent
    .post('/api/auth/register')
    .send({ name: nome, username: `cp-${identificador}`, email, password });
  expect(response.status).toBe(201);
  const verification = await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  expect(verification.status).toBe(200);
  const csrf = response.body.csrfToken;
  return {
    agent,
    email,
    csrf,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', csrf)
  };
}

async function criarProjeto(ator, nome = `Projeto CP ${unico()}`) {
  const response = await ator.mutate('post', '/api/projects').send({
    name: nome,
    responsibleTeam: 'Equipe CP'
  });
  expect(response.status).toBe(201);
  return response.body.project;
}

async function criarMarco(ator, projectId, dados = {}) {
  const response = await ator
    .mutate('post', `/api/projects/${projectId}/milestones`)
    .send({ title: `Marco ${unico()}`, dueDate: '2026-12-20', ...dados });
  expect(response.status).toBe(201);
  return response.body.milestone;
}

const postSprint = (ator, projectId, dados) =>
  ator.mutate('post', `/api/projects/${projectId}/sprints`).send(dados);

async function criarSprint(ator, projectId, milestoneId, dados = {}) {
  const response = await postSprint(ator, projectId, {
    name: `Sprint ${unico()}`,
    startDate: '2026-09-01',
    endDate: '2026-09-15',
    milestoneId,
    ...dados
  });
  expect(response.status).toBe(201);
  return response.body.sprint;
}

async function criarTarefa(ator, projectId, dados = {}) {
  const response = await ator
    .mutate('post', `/api/projects/${projectId}/tasks`)
    .send({ title: `Tarefa ${unico()}`, ...dados });
  expect(response.status).toBe(201);
  return response.body.task;
}

const mudarStatusSprint = (ator, sprintId, status) =>
  ator.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status });

async function transicionar(ator, sprintId, status) {
  const response = await mudarStatusSprint(ator, sprintId, status);
  expect(response.status).toBe(200);
  return response.body;
}

const substituirTarefas = (ator, sprintId, taskIds) =>
  ator.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds });

const associar = (ator, taskId, sprintId) =>
  ator.mutate('patch', `/api/tasks/${taskId}/sprint`).send({ sprintId });

const mover = (ator, taskId, toStatus) =>
  ator.mutate('patch', `/api/tasks/${taskId}/move`).send({ toStatus });

async function quadro(ator, projectId) {
  const response = await ator.agent.get(`/api/projects/${projectId}/kanban`);
  expect(response.status).toBe(200);
  return response.body;
}

async function progresso(ator, sprintId) {
  const response = await ator.agent.get(`/api/sprints/${sprintId}/progress`);
  expect(response.status).toBe(200);
  return response.body;
}

const colunaDe = (board, taskId) =>
  Object.entries(board.columns).find(([, tasks]) => tasks.some((task) => task.id === taskId))?.[0];

async function sprintCongeladaComTarefa(ator, projectId) {
  const marco = await criarMarco(ator, projectId);
  const sprint = await criarSprint(ator, projectId, marco.id);
  const tarefa = await criarTarefa(ator, projectId);
  expect((await associar(ator, tarefa.id, sprint.id)).status).toBe(200);
  await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
  expect((await mover(ator, tarefa.id, 'CONCLUIDO')).status).toBe(200);
  await transicionar(ator, sprint.id, 'CONCLUIDA');
  return { marco, sprint, tarefa };
}

describe('CP — TE: maquina de estados da sprint (RF10)', () => {
  it('CP-TE-01 planejada inicia', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const corpo = await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    expect(corpo.sprint.status).toBe('EM_ANDAMENTO');
  });

  it('CP-TE-02 segunda sprint ativa e recusada mesmo sem sobreposicao', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const primeira = await criarSprint(ator, projeto.id, marco.id);
    const segunda = await criarSprint(ator, projeto.id, marco.id, {
      startDate: '2026-10-01',
      endDate: '2026-10-15'
    });
    await transicionar(ator, primeira.id, 'EM_ANDAMENTO');
    const resposta = await mudarStatusSprint(ator, segunda.id, 'EM_ANDAMENTO');
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_ALREADY_ACTIVE');
  });

  it('CP-TE-03 planejada nao conclui direto', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const resposta = await mudarStatusSprint(ator, sprint.id, 'CONCLUIDA');
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_INVALID_TRANSITION');
  });

  it('CP-TE-04 planejada cancela', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const corpo = await transicionar(ator, sprint.id, 'CANCELADA');
    expect(corpo.sprint.status).toBe('CANCELADA');
  });

  it('CP-TE-05 concluir devolve as pendentes ao backlog', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const t1 = await criarTarefa(ator, projeto.id);
    const t2 = await criarTarefa(ator, projeto.id);
    const t3 = await criarTarefa(ator, projeto.id);
    expect((await substituirTarefas(ator, sprint.id, [t1.id, t2.id, t3.id])).status).toBe(200);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    expect((await mover(ator, t1.id, 'CONCLUIDO')).status).toBe(200);
    const corpo = await transicionar(ator, sprint.id, 'CONCLUIDA');
    expect(corpo.returnedToBacklog).toBe(2);
    const board = await quadro(ator, projeto.id);
    const noQuadro = Object.values(board.columns).flat();
    expect(noQuadro.find((task) => task.id === t2.id).sprintId).toBeNull();
    expect(noQuadro.find((task) => task.id === t3.id).sprintId).toBeNull();
    expect(noQuadro.find((task) => task.id === t1.id).sprintId).toBe(sprint.id);
  });

  it('CP-TE-06 em andamento cancela', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const corpo = await transicionar(ator, sprint.id, 'CANCELADA');
    expect(corpo.sprint.status).toBe('CANCELADA');
  });

  it('CP-TE-07 em andamento nao volta a planejada', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const resposta = await mudarStatusSprint(ator, sprint.id, 'PLANEJADA');
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_INVALID_TRANSITION');
  });

  it('CP-TE-08 concluida e terminal para status e edicao', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const { sprint } = await sprintCongeladaComTarefa(ator, projeto.id);
    const transicao = await mudarStatusSprint(ator, sprint.id, 'EM_ANDAMENTO');
    expect(transicao.status).toBe(409);
    expect(transicao.body.code).toBe('SPRINT_INVALID_TRANSITION');
    const edicao = await ator.mutate('put', `/api/sprints/${sprint.id}`).send({ name: 'Nova' });
    expect(edicao.status).toBe(409);
    expect(edicao.body.code).toBe('SPRINT_LOCKED');
  });

  it('CP-TE-09 cancelada e terminal', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, sprint.id, 'CANCELADA');
    const resposta = await mudarStatusSprint(ator, sprint.id, 'EM_ANDAMENTO');
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_INVALID_TRANSITION');
  });

  it('CP-TE-10 sprint nunca e excluida', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const resposta = await ator.mutate('delete', `/api/sprints/${sprint.id}`);
    expect(resposta.status).toBe(405);
    expect(resposta.body.code).toBe('SPRINT_DELETE_NOT_SUPPORTED');
  });

  it('CP-TE-11 concluir a ultima sprint conclui o marco', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const corpo = await transicionar(ator, sprint.id, 'CONCLUIDA');
    expect(corpo.milestoneCompleted).toMatchObject({ id: marco.id, status: 'CONCLUIDO' });
    const consulta = await ator.agent.get(`/api/milestones/${marco.id}`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.milestone.status).toBe('CONCLUIDO');
  });

  it('CP-TE-30 marco conclui e reabre manualmente', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const concluir = await ator
      .mutate('patch', `/api/milestones/${marco.id}/status`)
      .send({ status: 'CONCLUIDO' });
    expect(concluir.status).toBe(200);
    expect(concluir.body.milestone.status).toBe('CONCLUIDO');
    const reabrir = await ator
      .mutate('patch', `/api/milestones/${marco.id}/status`)
      .send({ status: 'PENDENTE' });
    expect(reabrir.status).toBe(200);
    expect(reabrir.body.milestone.status).toBe('PENDENTE');
  });
});

describe('CP — TD: mover tarefa no quadro (RF08)', () => {
  it('CP-TD-01 tarefa inexistente', async () => {
    const ator = await registrar();
    await criarProjeto(ator);
    const resposta = await mover(ator, 999999, 'EM_ANDAMENTO');
    expect(resposta.status).toBe(404);
  });

  it('CP-TD-02 status invalido lista os permitidos', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const tarefa = await criarTarefa(ator, projeto.id);
    const resposta = await mover(ator, tarefa.id, 'INVALIDO');
    expect(resposta.status).toBe(400);
    expect(resposta.body.message).toMatch(/A_FAZER/);
    expect(resposta.body.message).toMatch(/EM_ANDAMENTO/);
    expect(resposta.body.message).toMatch(/CONCLUIDO/);
  });

  it('CP-TD-03 sprint congelada vence qualquer destino, inclusive a propria coluna', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const { tarefa } = await sprintCongeladaComTarefa(ator, projeto.id);
    const paraOutra = await mover(ator, tarefa.id, 'A_FAZER');
    expect(paraOutra.status).toBe(409);
    expect(paraOutra.body.code).toBe('TASK_SPRINT_LOCKED');
    const paraMesma = await mover(ator, tarefa.id, 'CONCLUIDO');
    expect(paraMesma.status).toBe(409);
    expect(paraMesma.body.code).toBe('TASK_SPRINT_LOCKED');
    const board = await quadro(ator, projeto.id);
    expect(colunaDe(board, tarefa.id)).toBe('CONCLUIDO');
  });

  it('CP-TD-04 mesma coluna sem congelamento', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const tarefa = await criarTarefa(ator, projeto.id);
    const resposta = await mover(ator, tarefa.id, 'A_FAZER');
    expect(resposta.status).toBe(400);
    expect(resposta.body.message).toMatch(/coluna/i);
  });

  it('CP-TD-05 movimento valido reflete no quadro', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const tarefa = await criarTarefa(ator, projeto.id);
    const resposta = await mover(ator, tarefa.id, 'EM_ANDAMENTO');
    expect(resposta.status).toBe(200);
    const board = await quadro(ator, projeto.id);
    expect(colunaDe(board, tarefa.id)).toBe('EM_ANDAMENTO');
    expect(board.totals).toMatchObject({ A_FAZER: 0, EM_ANDAMENTO: 1, CONCLUIDO: 0, total: 1 });
  });

  it('CP-TD-06 todas as seis transicoes validas de coluna', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const tarefa = await criarTarefa(ator, projeto.id);
    const caminho = [
      'EM_ANDAMENTO',
      'CONCLUIDO',
      'EM_ANDAMENTO',
      'A_FAZER',
      'CONCLUIDO',
      'A_FAZER'
    ];
    for (const destino of caminho) {
      const resposta = await mover(ator, tarefa.id, destino);
      expect(resposta.status).toBe(200);
      expect(resposta.body.task.status).toBe(destino);
    }
    const board = await quadro(ator, projeto.id);
    expect(colunaDe(board, tarefa.id)).toBe('A_FAZER');
  });

  it('CP-TD-28 o caminho irmao de status respeita a congelada', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const { tarefa } = await sprintCongeladaComTarefa(ator, projeto.id);
    const resposta = await ator
      .mutate('patch', `/api/tasks/${tarefa.id}/status`)
      .send({ status: 'A_FAZER' });
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('TASK_SPRINT_LOCKED');
  });
});

describe('CP — PE/VL: cadastro e janelas do cronograma (RF10)', () => {
  it('CP-PE-01 sprint sem marco na criacao', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const semCampo = await postSprint(ator, projeto.id, {
      name: 'Sem marco',
      startDate: '2026-09-01',
      endDate: '2026-09-15'
    });
    const comNull = await postSprint(ator, projeto.id, {
      name: 'Marco nulo',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      milestoneId: null
    });
    const malformado = await postSprint(ator, projeto.id, {
      name: 'Marco invalido',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      milestoneId: 'abc'
    });
    expect(semCampo.status).toBe(400);
    expect(semCampo.body.code).toBe('SPRINT_MILESTONE_REQUIRED');
    expect(comNull.status).toBe(400);
    expect(comNull.body.code).toBe('SPRINT_MILESTONE_REQUIRED');
    expect(malformado.status).toBe(400);
    expect(malformado.body.code).toBe('VALIDATION_ERROR');
  });

  it('CP-PE-02 marco de outro projeto visivel ao ator', async () => {
    const ator = await registrar();
    const projetoA = await criarProjeto(ator);
    const projetoB = await criarProjeto(ator);
    const marcoB = await criarMarco(ator, projetoB.id);
    const resposta = await postSprint(ator, projetoA.id, {
      name: 'Cruzada',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      milestoneId: marcoB.id
    });
    expect(resposta.status).toBe(400);
    expect(resposta.body.code).toBe('SPRINT_MILESTONE_PROJECT_MISMATCH');
  });

  it('CP-PE-03 nome repetido no projeto', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    await criarSprint(ator, projeto.id, marco.id, { name: 'Sprint Alfa CP' });
    const resposta = await postSprint(ator, projeto.id, {
      name: 'Sprint Alfa CP',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      milestoneId: marco.id
    });
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_NAME_IN_USE');
  });

  it('CP-PE-04 mesmo nome vale em outro projeto', async () => {
    const ator = await registrar();
    const projetoA = await criarProjeto(ator);
    const projetoB = await criarProjeto(ator);
    const marcoA = await criarMarco(ator, projetoA.id);
    const marcoB = await criarMarco(ator, projetoB.id);
    await criarSprint(ator, projetoA.id, marcoA.id, { name: 'Sprint Alfa CP' });
    await criarSprint(ator, projetoB.id, marcoB.id, { name: 'Sprint Alfa CP' });
  });

  it('CP-VL-05 duracao zero', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const resposta = await postSprint(ator, projeto.id, {
      name: 'Zerada',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      milestoneId: marco.id
    });
    expect(resposta.status).toBe(400);
    expect(resposta.body.code).toBe('SPRINT_DATE_RANGE_INVALID');
  });

  it('CP-VL-06 um dia e valido', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    await criarSprint(ator, projeto.id, marco.id, {
      startDate: '2026-09-01',
      endDate: '2026-09-02'
    });
  });

  it('CP-VL-07 janela semiaberta encosta sem sobrepor', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    await criarSprint(ator, projeto.id, marco.id);
    await criarSprint(ator, projeto.id, marco.id, {
      startDate: '2026-09-15',
      endDate: '2026-09-30'
    });
  });

  it('CP-VL-08 um dia de sobreposicao recusa', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    await criarSprint(ator, projeto.id, marco.id);
    const resposta = await postSprint(ator, projeto.id, {
      name: 'Sobreposta',
      startDate: '2026-09-14',
      endDate: '2026-09-30',
      milestoneId: marco.id
    });
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_OVERLAP');
  });

  it('CP-VL-09 cancelada libera as datas', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const cancelada = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, cancelada.id, 'CANCELADA');
    await criarSprint(ator, projeto.id, marco.id, {
      startDate: '2026-09-05',
      endDate: '2026-09-10'
    });
  });

  it('CP-PE-10 prazo do marco e livre de janelas', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id, { dueDate: '2027-05-01' });
    const edicao = await ator
      .mutate('put', `/api/milestones/${marco.id}`)
      .send({ dueDate: '2020-01-01' });
    expect(edicao.status).toBe(200);
  });

  it('CP-PE-11 marco com sprint nao e excluido', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    await criarSprint(ator, projeto.id, marco.id);
    const resposta = await ator.mutate('delete', `/api/milestones/${marco.id}`);
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('MILESTONE_HAS_SPRINTS');
  });

  it('CP-PE-12 marco sem sprints e excluido de verdade', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const remocao = await ator.mutate('delete', `/api/milestones/${marco.id}`);
    expect(remocao.status).toBe(200);
    const consulta = await ator.agent.get(`/api/milestones/${marco.id}`);
    expect(consulta.status).toBe(404);
    expect(consulta.body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('CP-VL-13/14 o teto de 100 aceita a centesima e recusa a centesima primeira', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const ids = [];
    for (let indice = 0; indice < 101; indice += 1) {
      const tarefa = await criarTarefa(ator, projeto.id);
      ids.push(tarefa.id);
    }
    const cem = await substituirTarefas(ator, sprint.id, ids.slice(0, 100));
    expect(cem.status).toBe(200);
    expect(cem.body.total).toBe(100);
    const payloadExcedente = await substituirTarefas(ator, sprint.id, ids);
    const incremental = await associar(ator, ids[100], sprint.id);
    expect(payloadExcedente.status).toBe(400);

    expect(incremental.status).toBe(409);
    expect(incremental.body.code).toBe('SPRINT_TASK_LIMIT_REACHED');
    const consulta = await ator.agent.get(`/api/sprints/${sprint.id}/tasks`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.total).toBe(100);
  }, 180000);

  it('CP-PE-15 tarefa de outro projeto nao entra', async () => {
    const ator = await registrar();
    const projetoA = await criarProjeto(ator);
    const projetoB = await criarProjeto(ator);
    const marcoA = await criarMarco(ator, projetoA.id);
    const sprintA = await criarSprint(ator, projetoA.id, marcoA.id);
    const tarefaB = await criarTarefa(ator, projetoB.id);
    const resposta = await associar(ator, tarefaB.id, sprintA.id);
    expect(resposta.status).toBe(400);
    expect(resposta.body.code).toBe('TASK_SPRINT_PROJECT_MISMATCH');
  });

  it('CP-PE-16 sprint concluida nao recebe tarefa', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const { sprint } = await sprintCongeladaComTarefa(ator, projeto.id);
    const nova = await criarTarefa(ator, projeto.id);
    const resposta = await associar(ator, nova.id, sprint.id);
    expect(resposta.status).toBe(409);
    expect(resposta.body.code).toBe('SPRINT_SCOPE_LOCKED');
  });

  it('CP-VL-17 o "to" do cronograma inclui o dia inteiro em UTC', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const dentro = await criarTarefa(ator, projeto.id, { deadline: '2026-09-14' });
    const fora = await criarTarefa(ator, projeto.id, { deadline: '2026-09-15' });
    const resposta = await ator.agent.get(
      `/api/projects/${projeto.id}/schedule?from=2026-09-10&to=2026-09-14`
    );
    expect(resposta.status).toBe(200);
    const ids = resposta.body.unassignedTasks.map((task) => task.id);
    expect(ids).toContain(dentro.id);
    expect(ids).not.toContain(fora.id);
    expect(resposta.body.range.to).toBe('2026-09-14');
  });

  it('CP-VL-29 tarefa sem sprint e sem deadline so aparece sem filtro', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const solta = await criarTarefa(ator, projeto.id);
    const semFiltro = await ator.agent.get(`/api/projects/${projeto.id}/schedule`);
    expect(semFiltro.status).toBe(200);
    expect(semFiltro.body.unassignedTasks.map((task) => task.id)).toContain(solta.id);
    const comFiltro = await ator.agent.get(
      `/api/projects/${projeto.id}/schedule?from=2026-09-01&to=2026-09-30`
    );
    expect(comFiltro.status).toBe(200);
    expect(comFiltro.body.unassignedTasks.map((task) => task.id)).not.toContain(solta.id);
  });
});

describe('CP — PE/VL/TE: evolucao por sprint (RF35)', () => {
  it('CP-PE-18 uma de quatro concluidas da 25 por cento', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const ids = [];
    for (let indice = 0; indice < 4; indice += 1) {
      ids.push((await criarTarefa(ator, projeto.id)).id);
    }
    expect((await substituirTarefas(ator, sprint.id, ids)).status).toBe(200);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    expect((await mover(ator, ids[0], 'CONCLUIDO')).status).toBe(200);
    const corpo = await progresso(ator, sprint.id);
    expect(corpo.frozen).toBe(false);
    expect(corpo.cutoff).toBeTruthy();
    expect(corpo.current).toMatchObject({ numerator: 1, denominator: 4, percentage: 25 });
  });

  it('CP-PE-19 sem tarefas o percentual e null, nunca zero', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const corpo = await progresso(ator, sprint.id);
    expect(corpo.current.denominator).toBe(0);
    expect(corpo.current.percentage).toBeNull();
    expect(corpo.current.hasData).toBe(false);
  });

  it('CP-PE-20 inclusao apos o inicio e sinalizada como mudanca de escopo', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const antes = [
      (await criarTarefa(ator, projeto.id)).id,
      (await criarTarefa(ator, projeto.id)).id
    ];
    expect((await substituirTarefas(ator, sprint.id, antes)).status).toBe(200);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const depois = await criarTarefa(ator, projeto.id);
    expect((await associar(ator, depois.id, sprint.id)).status).toBe(200);
    const participacoes = await ator.agent.get(`/api/sprints/${sprint.id}/tasks`);
    expect(participacoes.status).toBe(200);
    const daInclusao = participacoes.body.tasks.find((task) => task.id === depois.id);
    expect(daInclusao.addedAfterStart).toBe(true);
    const corpo = await progresso(ator, sprint.id);
    expect(corpo.planned.denominator).toBe(2);
    expect(corpo.current.denominator).toBe(3);
    expect(corpo.scopeChange.added.map((item) => item.taskId)).toContain(depois.id);
  });

  it('CP-PE-21 remocao apos o inicio preserva o planejado', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const ids = [];
    for (let indice = 0; indice < 3; indice += 1) {
      ids.push((await criarTarefa(ator, projeto.id)).id);
    }
    expect((await substituirTarefas(ator, sprint.id, ids)).status).toBe(200);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    const remocao = await ator.mutate('delete', `/api/tasks/${ids[2]}/sprint`);
    expect(remocao.status).toBe(200);
    const corpo = await progresso(ator, sprint.id);
    expect(corpo.planned.denominator).toBe(3);
    expect(corpo.scopeChange.removed.map((item) => item.taskId)).toContain(ids[2]);
  });

  it('CP-TE-22 encerrada congela e nada a altera depois', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const concluida = await criarTarefa(ator, projeto.id);
    const pendente = await criarTarefa(ator, projeto.id);
    expect((await substituirTarefas(ator, sprint.id, [concluida.id, pendente.id])).status).toBe(
      200
    );
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    expect((await mover(ator, concluida.id, 'CONCLUIDO')).status).toBe(200);
    await transicionar(ator, sprint.id, 'CONCLUIDA');
    const primeira = await progresso(ator, sprint.id);
    expect(primeira.frozen).toBe(true);
    const segunda = await progresso(ator, sprint.id);
    expect(segunda).toEqual(primeira);
    expect((await mover(ator, pendente.id, 'EM_ANDAMENTO')).status).toBe(200);
    const terceira = await progresso(ator, sprint.id);
    expect(terceira).toEqual(primeira);
  });

  it('CP-PE-23 burndown com pontos e sem pontos', async () => {
    const ator = await registrar();
    const projeto = await criarProjeto(ator);
    const marco = await criarMarco(ator, projeto.id);
    const comPontos = await criarSprint(ator, projeto.id, marco.id);
    const t1 = await criarTarefa(ator, projeto.id, { estimatedEffort: 3 });
    const t2 = await criarTarefa(ator, projeto.id, { estimatedEffort: 5 });
    expect((await substituirTarefas(ator, comPontos.id, [t1.id, t2.id])).status).toBe(200);
    await transicionar(ator, comPontos.id, 'EM_ANDAMENTO');
    const medido = await progresso(ator, comPontos.id);
    expect(medido.burndown).toMatchObject({ hasData: true, totalPoints: 8 });

    const semPontos = await criarSprint(ator, projeto.id, marco.id, {
      startDate: '2026-10-01',
      endDate: '2026-10-15'
    });
    const t3 = await criarTarefa(ator, projeto.id);
    expect((await substituirTarefas(ator, semPontos.id, [t3.id])).status).toBe(200);
    const vazio = await progresso(ator, semPontos.id);
    expect(vazio.burndown.hasData).toBe(false);
    expect(vazio.burndown.days).toEqual([]);
  });
});

describe('CP — TD: autorizacao nas tres interfaces', () => {
  async function projetoComViewer() {
    const dona = await registrar('Dona do projeto');
    const projeto = await criarProjeto(dona);
    const marco = await criarMarco(dona, projeto.id);
    const sprint = await criarSprint(dona, projeto.id, marco.id);
    const tarefa = await criarTarefa(dona, projeto.id);
    const leitura = await registrar('Perfil de leitura');
    const usuarioLeitura = await prisma.user.findUnique({ where: { email: leitura.email } });
    await prisma.projectMembership.create({
      data: { projectId: projeto.id, userId: usuarioLeitura.id, role: 'VIEWER' }
    });
    return { dona, projeto, marco, sprint, tarefa, leitura };
  }

  it('CP-TD-24 viewer le quadro, cronograma e progresso', async () => {
    const { projeto, sprint, leitura } = await projetoComViewer();
    expect((await leitura.agent.get(`/api/projects/${projeto.id}/kanban`)).status).toBe(200);
    expect((await leitura.agent.get(`/api/projects/${projeto.id}/schedule`)).status).toBe(200);
    expect((await leitura.agent.get(`/api/sprints/${sprint.id}/progress`)).status).toBe(200);
  });

  it('CP-TD-25 viewer nao escreve em nenhuma das tres', async () => {
    const { projeto, marco, tarefa, leitura } = await projetoComViewer();
    expect((await mover(leitura, tarefa.id, 'EM_ANDAMENTO')).status).toBe(403);
    expect(
      (
        await postSprint(leitura, projeto.id, {
          name: 'Invasora',
          startDate: '2026-11-01',
          endDate: '2026-11-10',
          milestoneId: marco.id
        })
      ).status
    ).toBe(403);
    expect(
      (
        await leitura
          .mutate('patch', `/api/milestones/${marco.id}/status`)
          .send({ status: 'CONCLUIDO' })
      ).status
    ).toBe(403);
  });

  it('CP-TD-26 nao-membro recebe resposta identica a de recurso inexistente', async () => {
    const dona = await registrar('Dona reservada');
    const projeto = await criarProjeto(dona);
    const marco = await criarMarco(dona, projeto.id);
    const sprint = await criarSprint(dona, projeto.id, marco.id);
    const externa = await registrar('Pessoa de fora');

    const progressoReal = await externa.agent.get(`/api/sprints/${sprint.id}/progress`);
    const progressoInexistente = await externa.agent.get('/api/sprints/999999/progress');
    expect(progressoReal.status).toBe(progressoInexistente.status);
    expect(progressoReal.body.code).toBe(progressoInexistente.body.code);
    expect(progressoReal.body.message).toBe(progressoInexistente.body.message);

    const quadroReal = await externa.agent.get(`/api/projects/${projeto.id}/kanban`);
    const quadroInexistente = await externa.agent.get('/api/projects/999999/kanban');
    expect(quadroReal.status).toBe(quadroInexistente.status);
    expect(quadroReal.body.message).toBe(quadroInexistente.body.message);
  });
});

describe('CP — CU: fluxo central do cronograma ao quadro e a evolucao', () => {
  it('CP-CU-27 do planejamento a evolucao congelada', async () => {
    const ator = await registrar('Fluxo central');
    const projeto = await criarProjeto(ator, `Projeto Fluxo ${unico()}`);
    const marco = await criarMarco(ator, projeto.id);
    const sprint = await criarSprint(ator, projeto.id, marco.id);
    const tarefas = [];
    for (let indice = 0; indice < 3; indice += 1) {
      tarefas.push(await criarTarefa(ator, projeto.id));
    }
    expect(
      (
        await substituirTarefas(
          ator,
          sprint.id,
          tarefas.map((task) => task.id)
        )
      ).status
    ).toBe(200);
    await transicionar(ator, sprint.id, 'EM_ANDAMENTO');
    expect((await mover(ator, tarefas[0].id, 'CONCLUIDO')).status).toBe(200);
    expect((await mover(ator, tarefas[1].id, 'CONCLUIDO')).status).toBe(200);

    const parcial = await progresso(ator, sprint.id);
    expect(parcial.current).toMatchObject({ numerator: 2, denominator: 3, percentage: 66.67 });

    const encerramento = await transicionar(ator, sprint.id, 'CONCLUIDA');
    expect(encerramento.returnedToBacklog).toBe(1);
    expect(encerramento.milestoneCompleted).toMatchObject({ id: marco.id });

    const board = await quadro(ator, projeto.id);
    const devolvida = Object.values(board.columns)
      .flat()
      .find((task) => task.id === tarefas[2].id);
    expect(devolvida.sprintId).toBeNull();

    const marcoFinal = await ator.agent.get(`/api/milestones/${marco.id}`);
    expect(marcoFinal.body.milestone.status).toBe('CONCLUIDO');

    const congelado = await progresso(ator, sprint.id);
    expect(congelado.frozen).toBe(true);
    expect(congelado.current).toMatchObject({ numerator: 2, denominator: 3 });

    const recusa = await mover(ator, tarefas[0].id, 'A_FAZER');
    expect(recusa.status).toBe(409);
    expect(recusa.body.code).toBe('TASK_SPRINT_LOCKED');
  }, 60000);
});
