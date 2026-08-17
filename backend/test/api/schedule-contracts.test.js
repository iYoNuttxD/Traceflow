// RF10: contratos, autorizacao, isolamento entre projetos, atomicidade e auditoria
// de sprints, marcos e cronograma.
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

// POST /api/projects exige os campos de repositorio; o slug deriva do nome
// para nao violar a unicidade de githubRepositoryFullName entre projetos.
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

async function createProject(session, name = 'Projeto') {
  const response = await session.mutate('post', '/api/projects').send(projectBody(name));
  return response.body.project;
}

async function createSprint(session, projectId, overrides = {}) {
  const response = await session.mutate('post', `/api/projects/${projectId}/sprints`).send({
    name: 'Sprint 1',
    objective: 'Identidade e acesso',
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    ...overrides
  });
  return response;
}

async function createMilestone(session, projectId, overrides = {}) {
  // Marco exige sprint (ADR-010 D02). Quem já tem uma sprint no teste passa o id;
  // os demais recebem a sua, sem precisar declarar o cronograma inteiro.
  const sprintId = overrides.sprintId ?? (await createSprint(session, projectId)).body.sprint.id;
  return (
    session
      .mutate('post', `/api/projects/${projectId}/milestones`)
      // Dentro da janela [2026-08-01, 2026-08-14) da sprint padrao: a data prevista
      // do marco precisa descrever um periodo de desenvolvimento real.
      .send({ title: 'Entrega parcial', dueDate: '2026-08-10', ...overrides, sprintId })
  );
}

async function createTask(session, projectId, title = 'Tarefa') {
  const response = await session.mutate('post', `/api/projects/${projectId}/tasks`).send({ title });
  return response.body.task;
}

describe('contratos de sprint', () => {
  it('cria, lista, consulta e edita sprint; exclusao e recusada', async () => {
    const owner = await register('sprint-crud@example.invalid');
    const project = await createProject(owner);

    const created = await createSprint(owner, project.id);
    expect(created.status).toBe(201);
    expect(created.body.message).toBe('Sprint cadastrada com sucesso.');
    expect(created.body.sprint).toMatchObject({
      projectId: project.id,
      name: 'Sprint 1',
      status: 'PLANEJADA'
    });
    const sprintId = created.body.sprint.id;

    const list = await owner.agent.get(`/api/projects/${project.id}/sprints`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ total: 1 });
    expect(list.body.sprints).toHaveLength(1);

    const detail = await owner.agent.get(`/api/sprints/${sprintId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.sprint.id).toBe(sprintId);

    const updated = await owner
      .mutate('put', `/api/sprints/${sprintId}`)
      .send({ name: 'Sprint renomeada' });
    expect(updated.status).toBe(200);
    expect(updated.body.sprint.name).toBe('Sprint renomeada');

    const removed = await owner.mutate('delete', `/api/sprints/${sprintId}`).send();
    expect(removed.status).toBe(405);
    expect(removed.body.code).toBe('SPRINT_DELETE_NOT_SUPPORTED');
    expect(await prisma.sprint.count()).toBe(1);
  });

  it('ordena a listagem por data de inicio', async () => {
    const owner = await register('sprint-order@example.invalid');
    const project = await createProject(owner);
    await createSprint(owner, project.id, {
      name: 'Segunda',
      startDate: '2026-09-01',
      endDate: '2026-09-14'
    });
    await createSprint(owner, project.id, {
      name: 'Primeira',
      startDate: '2026-08-01',
      endDate: '2026-08-14'
    });
    const list = await owner.agent.get(`/api/projects/${project.id}/sprints`);
    expect(list.body.sprints.map((sprint) => sprint.name)).toEqual(['Primeira', 'Segunda']);
  });

  it('rejeita nome duplicado no mesmo projeto com 409 e codigo estavel', async () => {
    const owner = await register('sprint-dup@example.invalid');
    const project = await createProject(owner);
    await createSprint(owner, project.id);
    // Janela seguinte, e nao a mesma: com sprints sequenciais, repetir o periodo
    // falharia por sobreposicao antes de chegar na regra de nome.
    const conflict = await createSprint(owner, project.id, {
      startDate: '2026-09-01',
      endDate: '2026-09-14'
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('SPRINT_NAME_IN_USE');
  });

  it('rejeita inicio posterior ao fim', async () => {
    const owner = await register('sprint-range@example.invalid');
    const project = await createProject(owner);
    const response = await createSprint(owner, project.id, {
      startDate: '2026-08-20',
      endDate: '2026-08-01'
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SPRINT_DATE_RANGE_INVALID');
  });

  it('aplica a maquina de estados e bloqueia edicao em estado terminal', async () => {
    const owner = await register('sprint-status@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    const invalid = await owner
      .mutate('patch', `/api/sprints/${sprintId}/status`)
      .send({ status: 'CONCLUIDA' });
    expect(invalid.status).toBe(409);
    expect(invalid.body.code).toBe('SPRINT_INVALID_TRANSITION');

    const started = await owner
      .mutate('patch', `/api/sprints/${sprintId}/status`)
      .send({ status: 'EM_ANDAMENTO' });
    expect(started.status).toBe(200);
    expect(started.body.sprint.startedAt).not.toBeNull();

    const finished = await owner
      .mutate('patch', `/api/sprints/${sprintId}/status`)
      .send({ status: 'CONCLUIDA' });
    expect(finished.body.sprint.completedAt).not.toBeNull();

    const locked = await owner.mutate('put', `/api/sprints/${sprintId}`).send({ name: 'Novo' });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('SPRINT_LOCKED');
  });

  // Sprint nao e excluida em nenhum estado: o cronograma e registro historico do
  // projeto. A rota segue existindo para o 405 nao virar um 404 ambiguo.
  it('recusa exclusao de sprint com e sem tarefas', async () => {
    const owner = await register('sprint-has-tasks@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    const vazia = await owner.mutate('delete', `/api/sprints/${sprintId}`).send();
    expect(vazia.status).toBe(405);
    expect(vazia.body.code).toBe('SPRINT_DELETE_NOT_SUPPORTED');

    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });

    const comTarefa = await owner.mutate('delete', `/api/sprints/${sprintId}`).send();
    expect(comTarefa.status).toBe(405);
    expect(await prisma.sprint.count()).toBe(1);
  });

  // Sprints do mesmo projeto sao sequenciais.
  it('recusa sprint sobreposta e aceita a que emenda na anterior', async () => {
    const owner = await register('sprint-overlap@example.invalid');
    const project = await createProject(owner);
    await createSprint(owner, project.id);

    const sobreposta = await createSprint(owner, project.id, {
      name: 'Sprint 2',
      startDate: '2026-08-10',
      endDate: '2026-08-24'
    });
    expect(sobreposta.status).toBe(409);
    expect(sobreposta.body.code).toBe('SPRINT_OVERLAP');

    // Comecar no instante em que a anterior termina e emenda, nao cruzamento.
    const emenda = await createSprint(owner, project.id, {
      name: 'Sprint 2',
      startDate: '2026-08-14',
      endDate: '2026-08-28'
    });
    expect(emenda.status).toBe(201);
  });

  // "Consultar e depois inserir" nao e validacao: sem o lock, duas criacoes
  // simultaneas leem o mesmo conjunto e ambas passam. Este teste falha se o
  // FOR UPDATE sair do caminho de criacao.
  it('serializa criacoes concorrentes de sprints sobrepostas', async () => {
    const owner = await register('sprint-race-create@example.invalid');
    const project = await createProject(owner);

    const respostas = await Promise.all([
      createSprint(owner, project.id, {
        name: 'A',
        startDate: '2026-08-01',
        endDate: '2026-08-15'
      }),
      createSprint(owner, project.id, { name: 'B', startDate: '2026-08-10', endDate: '2026-08-20' })
    ]);

    const criadas = respostas.filter((resposta) => resposta.status === 201);
    const recusadas = respostas.filter((resposta) => resposta.status === 409);
    expect(criadas).toHaveLength(1);
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].body.code).toBe('SPRINT_OVERLAP');
    expect(await prisma.sprint.count({ where: { projectId: project.id } })).toBe(1);
  });

  // Substituicao concorrente: o delta de cada requisicao e calculado sob o lock,
  // entao o estado final e o payload de um dos dois — nunca a uniao dos dois nem
  // uma composicao que nenhum cliente pediu.
  it('serializa substituicoes concorrentes do escopo', async () => {
    const owner = await register('sprint-race-scope@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const a = await createTask(owner, project.id, 'A');
    const b = await createTask(owner, project.id, 'B');

    await Promise.all([
      owner.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds: [a.id] }),
      owner.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds: [b.id] })
    ]);

    const finais = (await prisma.task.findMany({ where: { sprintId }, select: { id: true } })).map(
      (task) => task.id
    );
    expect([[a.id], [b.id]]).toContainEqual(finais);

    // A participacao ativa acompanha o ponteiro: uma dentro, a outra fechada.
    const ativas = await prisma.sprintTask.findMany({
      where: { sprintId, removedAt: null },
      select: { taskId: true }
    });
    expect(ativas.map((participacao) => participacao.taskId)).toEqual(finais);
  });

  it('recusa edicao que passa a sobrepor outra sprint', async () => {
    const owner = await register('sprint-overlap-edit@example.invalid');
    const project = await createProject(owner);
    const primeira = (await createSprint(owner, project.id)).body.sprint.id;
    await createSprint(owner, project.id, {
      name: 'Sprint 2',
      startDate: '2026-08-14',
      endDate: '2026-08-28'
    });

    const response = await owner
      .mutate('put', `/api/sprints/${primeira}`)
      .send({ endDate: '2026-08-20' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SPRINT_OVERLAP');
  });
});

describe('contratos de marco', () => {
  it('cobre o CRUD completo e a troca de status', async () => {
    const owner = await register('milestone-crud@example.invalid');
    const project = await createProject(owner);

    const created = await createMilestone(owner, project.id);
    expect(created.status).toBe(201);
    expect(created.body.milestone).toMatchObject({ title: 'Entrega parcial', status: 'PENDENTE' });
    const milestoneId = created.body.milestone.id;

    expect((await owner.agent.get(`/api/projects/${project.id}/milestones`)).body.total).toBe(1);
    expect((await owner.agent.get(`/api/milestones/${milestoneId}`)).status).toBe(200);

    const updated = await owner
      .mutate('put', `/api/milestones/${milestoneId}`)
      .send({ title: 'Entrega final' });
    expect(updated.body.milestone.title).toBe('Entrega final');

    const done = await owner
      .mutate('patch', `/api/milestones/${milestoneId}/status`)
      .send({ status: 'CONCLUIDO' });
    expect(done.body.milestone.status).toBe('CONCLUIDO');

    expect((await owner.mutate('delete', `/api/milestones/${milestoneId}`).send()).status).toBe(
      200
    );
    expect(await prisma.milestone.count()).toBe(0);
  });
});

describe('associacao tarefa <-> sprint', () => {
  it('vincula, e idempotente e desvincula pelo lado da tarefa', async () => {
    const owner = await register('task-sprint@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);

    const linked = await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    expect(linked.status).toBe(200);
    expect(linked.body.task.sprintId).toBe(sprintId);
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(1);

    // Idempotente: repetir nao gera novo historico.
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(1);

    const unlinked = await owner.mutate('delete', `/api/tasks/${task.id}/sprint`).send();
    expect(unlinked.body.task.sprintId).toBeNull();
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(2);

    // Idempotente na remocao tambem.
    await owner.mutate('delete', `/api/tasks/${task.id}/sprint`).send();
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(2);
  });

  // O mesmo ator e dono dos DOIS projetos, entao enxerga ambos: aqui o erro informativo
  // e correto e nao vaza nada. Quando o ator nao enxerga o outro projeto a resposta vira
  // 404 indistinguivel — ver os testes de oraculo no bloco de isolamento.
  it('rejeita tarefa e sprint de projetos diferentes', async () => {
    const owner = await register('cross-project@example.invalid');
    const projectA = await createProject(owner, 'Projeto A');
    const projectB = await createProject(owner, 'Projeto B');
    const sprintId = (await createSprint(owner, projectA.id)).body.sprint.id;
    const task = await createTask(owner, projectB.id);

    const response = await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TASK_SPRINT_PROJECT_MISMATCH');
  });

  // Regressao do impasse encontrado em uso real: sprint concluida com tarefa
  // nao podia ser esvaziada nem excluida, e o status nao volta atras.
  it('permite esvaziar e excluir uma sprint concluida', async () => {
    const owner = await register('terminal-escape@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });

    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CONCLUIDA' });

    const blocked = await owner.mutate('delete', `/api/sprints/${sprintId}`).send();
    expect(blocked.status).toBe(405);

    // Esvaziar tambem e recusado: a composicao da sprint encerrada e o registro
    // do periodo, e apaga-la destruiria o que o RF35 mede.
    const emptied = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: [] });
    expect(emptied.status).toBe(409);
    expect(emptied.body.code).toBe('SPRINT_SCOPE_LOCKED');
    expect(await prisma.task.count({ where: { sprintId } })).toBe(1);
    expect(await prisma.sprint.count()).toBe(1);
  });

  it('bloqueia desassociar pelo lado da tarefa em sprint terminal', async () => {
    const owner = await register('terminal-unlink@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CANCELADA' });

    const unlinked = await owner.mutate('delete', `/api/tasks/${task.id}/sprint`).send();
    expect(unlinked.status).toBe(409);
    expect(unlinked.body.code).toBe('SPRINT_SCOPE_LOCKED');
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBe(sprintId);
  });

  it('continua bloqueando ADICIONAR tarefa a sprint terminal pelo lado da sprint', async () => {
    const owner = await register('terminal-add-blocked@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CANCELADA' });

    const response = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: [task.id] });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SPRINT_SCOPE_LOCKED');
  });

  it('bloqueia associacao a sprint terminal', async () => {
    const owner = await register('terminal-link@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'CANCELADA' });

    const response = await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('SPRINT_SCOPE_LOCKED');
  });

  it('substitui o conjunto de forma atomica pelo lado da sprint', async () => {
    const owner = await register('replace-tasks@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const first = await createTask(owner, project.id, 'Primeira');
    const second = await createTask(owner, project.id, 'Segunda');

    const response = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: [first.id, second.id] });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(2);
  });

  // Regressao: a interface lista todas as tarefas do projeto, inclusive as ja
  // alocadas em outra sprint, entao a troca A -> B e alcancavel pelo usuario.
  // Os dois caminhos de associacao precisam gravar a mesma origem.
  it('preserva a sprint de origem no historico ao mover tarefa entre sprints', async () => {
    const owner = await register('sprint-move@example.invalid');
    const project = await createProject(owner);
    // Sprints sequenciais: a segunda comeca quando a primeira termina.
    const origin = (await createSprint(owner, project.id, { name: 'Sprint origem' })).body.sprint;
    const target = (
      await createSprint(owner, project.id, {
        name: 'Sprint destino',
        startDate: '2026-08-14',
        endDate: '2026-08-28'
      })
    ).body.sprint;
    const byTheSprint = await createTask(owner, project.id, 'Movida pela sprint');
    const byTheTask = await createTask(owner, project.id, 'Movida pela tarefa');

    await owner
      .mutate('put', `/api/sprints/${origin.id}/tasks`)
      .send({ taskIds: [byTheSprint.id, byTheTask.id] });

    // Caminho 1: mover pelo lado da sprint de destino.
    const moved = await owner
      .mutate('put', `/api/sprints/${target.id}/tasks`)
      .send({ taskIds: [byTheSprint.id] });
    expect(moved.status).toBe(200);

    // Caminho 2: mover pelo lado da tarefa.
    await owner.mutate('patch', `/api/tasks/${byTheTask.id}/sprint`).send({ sprintId: target.id });

    const entries = await prisma.taskHistoryEntry.findMany({
      where: { field: 'SPRINT', toValue: String(target.id) },
      select: { taskId: true, fromValue: true, toValue: true },
      orderBy: { id: 'asc' }
    });

    expect(entries).toEqual([
      { taskId: byTheSprint.id, fromValue: String(origin.id), toValue: String(target.id) },
      { taskId: byTheTask.id, fromValue: String(origin.id), toValue: String(target.id) }
    ]);
    expect(await prisma.task.count({ where: { sprintId: origin.id } })).toBe(0);
    expect(await prisma.task.count({ where: { sprintId: target.id } })).toBe(2);
  });

  it('nao persiste nenhum vinculo quando um ID no meio da lista e invalido', async () => {
    const owner = await register('atomic-replace@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const first = await createTask(owner, project.id, 'Primeira');
    const second = await createTask(owner, project.id, 'Segunda');

    const response = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: [first.id, 999999, second.id] });
    expect(response.status).toBe(404);
    expect(await prisma.task.count({ where: { sprintId } })).toBe(0);
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(0);
  });

  it('rejeita lista com IDs duplicados e acima do limite', async () => {
    const owner = await register('replace-limits@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    const duplicated = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: [1, 1] });
    expect(duplicated.status).toBe(400);

    const tooMany = await owner
      .mutate('put', `/api/sprints/${sprintId}/tasks`)
      .send({ taskIds: Array.from({ length: 101 }, (_value, index) => index + 1) });
    expect(tooMany.status).toBe(400);
  });
});

describe('cronograma', () => {
  it('apresenta sprints, tarefas, prazos, marcos e tarefas sem sprint', async () => {
    const owner = await register('schedule@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const inside = await createTask(owner, project.id, 'Dentro');
    await owner.mutate('patch', `/api/tasks/${inside.id}/sprint`).send({ sprintId });
    await createTask(owner, project.id, 'Sem sprint');
    // Reaproveita a sprint do teste: criar outra quebraria o `toHaveLength(1)` abaixo.
    await createMilestone(owner, project.id, { sprintId });

    const response = await owner.agent.get(`/api/projects/${project.id}/schedule`);
    expect(response.status).toBe(200);
    expect(response.body.projectId).toBe(project.id);
    expect(response.body.sprints).toHaveLength(1);
    expect(response.body.sprints[0]).toMatchObject({ durationInDays: 14, taskCount: 1 });
    expect(response.body.milestones).toHaveLength(1);
    expect(response.body.unassignedTasks).toHaveLength(1);
    expect(response.body.generatedAt).toMatch(/Z$/);
  });

  it('nao expoe e-mail nem campos alem do DTO minimizado', async () => {
    const owner = await register('schedule-dto@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });

    const body = (await owner.agent.get(`/api/projects/${project.id}/schedule`)).body;
    const payload = JSON.stringify(body);
    expect(payload).not.toContain('@example.invalid');
    expect(Object.keys(body.sprints[0].tasks[0]).sort()).toEqual([
      'deadline',
      'deadlineOutsideWindow',
      'id',
      'priority',
      'responsibleUserId',
      'status',
      'title'
    ]);
  });

  it('rejeita janela com from maior que to', async () => {
    const owner = await register('schedule-range@example.invalid');
    const project = await createProject(owner);
    const response = await owner.agent.get(
      `/api/projects/${project.id}/schedule?from=2026-09-30&to=2026-09-01`
    );
    expect(response.status).toBe(400);
  });

  it('nao devolve calculo de evolucao: isso e RF35', async () => {
    const owner = await register('schedule-no-rf35@example.invalid');
    const project = await createProject(owner);
    await createSprint(owner, project.id);
    const body = (await owner.agent.get(`/api/projects/${project.id}/schedule`)).body;
    expect(body.sprints[0]).not.toHaveProperty('progressPercentage');
    expect(body.sprints[0]).not.toHaveProperty('completedCount');
  });
});

describe('evolucao da sprint (RF35)', () => {
  it('separa escopo planejado de escopo atual e identifica as mudancas', async () => {
    const owner = await register('progress-flow@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const a = await createTask(owner, project.id, 'Planejada e concluida');
    const b = await createTask(owner, project.id, 'Planejada e removida');

    // Escopo do planejamento, antes de iniciar a sprint.
    await owner.mutate('patch', `/api/tasks/${a.id}/sprint`).send({ sprintId });
    await owner.mutate('patch', `/api/tasks/${b.id}/sprint`).send({ sprintId });

    // Iniciar grava startedAt: e este instante que fecha o planejamento.
    await owner.mutate('patch', `/api/sprints/${sprintId}/status`).send({ status: 'EM_ANDAMENTO' });

    // Depois da base: uma entra, uma sai, e a que ficou e concluida.
    const c = await createTask(owner, project.id, 'Entrou depois');
    await owner.mutate('patch', `/api/tasks/${c.id}/sprint`).send({ sprintId });
    await owner.mutate('delete', `/api/tasks/${b.id}/sprint`).send();
    await owner.mutate('patch', `/api/tasks/${a.id}/status`).send({ status: 'CONCLUIDO' });

    const response = await owner.agent.get(`/api/sprints/${sprintId}/progress`);
    expect(response.status).toBe(200);

    const body = response.body;
    expect(body.baseline.kind).toBe('STARTED_AT');
    expect(body.cutoff).toMatch(/Z$/);

    // Planejado = {a, b}: b saiu, mas estava planejada. Atual = {a, c}.
    expect(body.planned).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });
    expect(body.current).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });
    expect(body.scopeChange.added.map((item) => item.taskId)).toEqual([c.id]);
    expect(body.scopeChange.removed.map((item) => item.taskId)).toEqual([b.id]);
  });

  // O criterio central do RF35 corrigido: a Sprint 1 continua afirmando o que
  // aconteceu nela depois que a tarefa seguiu para a Sprint 2 e foi concluida la.
  it('continuidade entre sprints nao reescreve o resultado da sprint encerrada', async () => {
    const owner = await register('progress-carryover@example.invalid');
    const project = await createProject(owner);
    const s1 = (await createSprint(owner, project.id, { name: 'Sprint 1' })).body.sprint.id;
    const s2 = (
      await createSprint(owner, project.id, {
        name: 'Sprint 2',
        startDate: '2026-08-14',
        endDate: '2026-08-28'
      })
    ).body.sprint.id;

    const feita = await createTask(owner, project.id, 'Concluida na Sprint 1');
    const arrastada = await createTask(owner, project.id, 'Continua na Sprint 2');
    await owner.mutate('patch', `/api/tasks/${feita.id}/sprint`).send({ sprintId: s1 });
    await owner.mutate('patch', `/api/tasks/${arrastada.id}/sprint`).send({ sprintId: s1 });

    await owner.mutate('patch', `/api/sprints/${s1}/status`).send({ status: 'EM_ANDAMENTO' });
    await owner.mutate('patch', `/api/tasks/${feita.id}/status`).send({ status: 'CONCLUIDO' });
    await owner.mutate('patch', `/api/sprints/${s1}/status`).send({ status: 'CONCLUIDA' });

    const antes = (await owner.agent.get(`/api/sprints/${s1}/progress`)).body;
    expect(antes.frozen).toBe(true);
    expect(antes.current).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });

    // A tarefa nao concluida continua na sprint seguinte e e concluida la.
    const movida = await owner
      .mutate('patch', `/api/tasks/${arrastada.id}/sprint`)
      .send({ sprintId: s2 });
    expect(movida.status).toBe(200);
    await owner.mutate('patch', `/api/tasks/${arrastada.id}/status`).send({ status: 'CONCLUIDO' });

    const depois = (await owner.agent.get(`/api/sprints/${s1}/progress`)).body;
    expect(depois.planned).toEqual(antes.planned);
    expect(depois.current).toEqual(antes.current);
    expect(depois.cutoff).toBe(antes.cutoff);
    // O status observado na Sprint 1 continua sendo o de la, nao o de hoje.
    expect(depois.carryOver).toEqual([
      { taskId: arrastada.id, toSprintId: s2, exitStatus: 'A_FAZER', at: null }
    ]);

    // A Sprint 2 recebe a tarefa sabendo de onde ela veio.
    const seguinte = (await owner.agent.get(`/api/sprints/${s2}/progress`)).body;
    expect(seguinte.current).toMatchObject({ numerator: 1, denominator: 1 });
    const participacao = await prisma.sprintTask.findFirst({
      where: { sprintId: s2, taskId: arrastada.id },
      select: { carriedFromSprintId: true }
    });
    expect(participacao.carriedFromSprintId).toBe(s1);
  });

  it('sprint nao iniciada tem base aberta e nenhuma mudanca de escopo', async () => {
    const owner = await register('progress-open@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });

    const body = (await owner.agent.get(`/api/sprints/${sprintId}/progress`)).body;
    expect(body.baseline).toEqual({ kind: 'OPEN', at: null });
    expect(body.scopeChange).toEqual({ added: [], removed: [] });
    expect(body.planned).toEqual(body.current);
  });

  it('sprint sem tarefas devolve percentual nulo, nunca zero', async () => {
    const owner = await register('progress-empty@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    const body = (await owner.agent.get(`/api/sprints/${sprintId}/progress`)).body;
    expect(body.current).toEqual({
      numerator: 0,
      denominator: 0,
      percentage: null,
      hasData: false
    });
  });

  // Corte no passado e recusado de proposito: Task.status guarda so o presente.
  it('recusa corte no passado com 400 em vez de responder com dados de agora', async () => {
    const owner = await register('progress-at@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    const response = await owner.agent
      .get(`/api/sprints/${sprintId}/progress`)
      .query({ at: '2026-07-20' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejeita parametro desconhecido na query', async () => {
    const owner = await register('progress-unknown@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const response = await owner.agent
      .get(`/api/sprints/${sprintId}/progress`)
      .query({ inventado: '1' });
    expect(response.status).toBe(400);
  });

  it('exige sessao', async () => {
    expect((await request(app).get('/api/sprints/1/progress')).status).toBe(401);
  });

  // Sprint alheia nao vaza conteudo nem status. O CODIGO, porem, difere: recurso
  // de projeto alheio e barrado pelo middleware (RESOURCE_NOT_FOUND) e recurso
  // inexistente cai no service (SPRINT_NOT_FOUND), porque resolveProjectId nao
  // resolve projeto e o middleware deixa passar
  // (project-authorization.middleware.js:14).
  //
  // Isso e pre-existente e vale para todo o app — /tasks/:id, /requirements/:id,
  // /milestones/:id. Uniformizar muda o contrato publico do RF10 e esta fora do
  // escopo do RF35; registrado no backlog tecnico. O teste fixa o comportamento
  // atual para que qualquer mudanca seja deliberada, e nao um efeito colateral.
  it('nao vaza conteudo de sprint alheia, com a divergencia de codigo fixada', async () => {
    const owner = await register('progress-owner@example.invalid');
    const stranger = await register('progress-stranger@example.invalid');
    const alheio = await createProject(stranger, 'Projeto alheio');
    const sprintAlheia = (await createSprint(stranger, alheio.id)).body.sprint;

    const existente = await owner.agent.get(`/api/sprints/${sprintAlheia.id}/progress`);
    const inexistente = await owner.agent.get('/api/sprints/999999/progress');

    expect(existente.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(existente.body).not.toHaveProperty('planned');
    expect(existente.body).not.toHaveProperty('scopeChange');
    expect(existente.body.code).toBe('RESOURCE_NOT_FOUND');
    expect(inexistente.body.code).toBe('SPRINT_NOT_FOUND');
  });

  it('VIEWER, MEMBER, MANAGER e OWNER leem a evolucao', async () => {
    const owner = await register('progress-roles-owner@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    for (const role of ['VIEWER', 'MEMBER', 'MANAGER']) {
      const membro = await register(`progress-${role.toLowerCase()}@example.invalid`);
      await prisma.projectMembership.create({
        data: { projectId: project.id, userId: membro.userId, role }
      });
      const response = await membro.agent.get(`/api/sprints/${sprintId}/progress`);
      expect(response.status, `papel ${role}`).toBe(200);
    }
    expect((await owner.agent.get(`/api/sprints/${sprintId}/progress`)).status).toBe(200);
  });
});

describe('autenticacao, CSRF e papeis', () => {
  it('exige sessao em leitura e mutacao', async () => {
    expect((await request(app).get('/api/sprints/1')).status).toBe(401);
    expect((await request(app).post('/api/projects/1/sprints').send({})).status).toBe(401);
  });

  it('exige X-CSRF-Token nas mutacoes', async () => {
    const owner = await register('csrf@example.invalid');
    const project = await createProject(owner);
    const response = await owner.agent
      .post(`/api/projects/${project.id}/sprints`)
      .send({ name: 'S', startDate: '2026-08-01', endDate: '2026-08-14' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_INVALID');
  });

  it('VIEWER le e recebe 403 em mutacao; MEMBER escreve', async () => {
    const owner = await register('roles-owner@example.invalid');
    const viewer = await register('roles-viewer@example.invalid');
    const member = await register('roles-member@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: viewer.userId, role: 'VIEWER' }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: member.userId, role: 'MEMBER' }
    });

    expect((await viewer.agent.get(`/api/sprints/${sprintId}`)).status).toBe(200);
    expect(
      (await viewer.mutate('put', `/api/sprints/${sprintId}`).send({ name: 'X' })).status
    ).toBe(403);
    expect(
      (await member.mutate('put', `/api/sprints/${sprintId}`).send({ name: 'Y' })).status
    ).toBe(200);
  });
});

describe('isolamento entre projetos (IDOR/BOLA)', () => {
  it('nao membro recebe 404 em sprint alheia em todos os metodos', async () => {
    const owner = await register('isolation-owner@example.invalid');
    const stranger = await register('isolation-stranger@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;

    expect((await stranger.agent.get(`/api/sprints/${sprintId}`)).status).toBe(404);
    expect(
      (await stranger.mutate('put', `/api/sprints/${sprintId}`).send({ name: 'X' })).status
    ).toBe(404);
    expect(
      (
        await stranger.mutate('patch', `/api/sprints/${sprintId}/status`).send({
          status: 'EM_ANDAMENTO'
        })
      ).status
    ).toBe(404);
    expect((await stranger.mutate('delete', `/api/sprints/${sprintId}`).send()).status).toBe(404);
    expect(
      (await stranger.mutate('put', `/api/sprints/${sprintId}/tasks`).send({ taskIds: [] })).status
    ).toBe(404);
    expect(await prisma.sprint.count()).toBe(1);
  });

  it('nao membro recebe 404 em marco alheio em todos os metodos', async () => {
    const owner = await register('isolation-m-owner@example.invalid');
    const stranger = await register('isolation-m-stranger@example.invalid');
    const project = await createProject(owner);
    const milestoneId = (await createMilestone(owner, project.id)).body.milestone.id;

    expect((await stranger.agent.get(`/api/milestones/${milestoneId}`)).status).toBe(404);
    expect(
      (await stranger.mutate('put', `/api/milestones/${milestoneId}`).send({ title: 'X' })).status
    ).toBe(404);
    expect(
      (
        await stranger.mutate('patch', `/api/milestones/${milestoneId}/status`).send({
          status: 'CONCLUIDO'
        })
      ).status
    ).toBe(404);
    expect((await stranger.mutate('delete', `/api/milestones/${milestoneId}`).send()).status).toBe(
      404
    );
    expect(await prisma.milestone.count()).toBe(1);
  });

  it('nao membro recebe 404 no cronograma alheio', async () => {
    const owner = await register('isolation-s-owner@example.invalid');
    const stranger = await register('isolation-s-stranger@example.invalid');
    const project = await createProject(owner);
    expect((await stranger.agent.get(`/api/projects/${project.id}/schedule`)).status).toBe(404);
  });

  // Regressao: a autorizacao resolve o projeto pela TAREFA, entao qualquer sprintId do
  // sistema chega ao service. Se "existe em outro projeto" respondesse 400 e "nao existe"
  // respondesse 404, bastava iterar o ID para mapear sprints de projetos alheios.
  it('nao distingue sprint alheia de sprint inexistente pelo lado da tarefa', async () => {
    const owner = await register('oracle-task-owner@example.invalid');
    const stranger = await register('oracle-task-stranger@example.invalid');
    const meuProjeto = await createProject(owner, 'Meu projeto');
    const alheio = await createProject(stranger, 'Projeto alheio');
    const minhaTarefa = await createTask(owner, meuProjeto.id);
    const sprintAlheia = (await createSprint(stranger, alheio.id)).body.sprint;

    const existente = await owner
      .mutate('patch', `/api/tasks/${minhaTarefa.id}/sprint`)
      .send({ sprintId: sprintAlheia.id });
    const inexistente = await owner
      .mutate('patch', `/api/tasks/${minhaTarefa.id}/sprint`)
      .send({ sprintId: 999999 });

    expect(existente.status).toBe(404);
    expect(existente.status).toBe(inexistente.status);
    // requestId e por requisicao; o resto do corpo precisa ser byte a byte igual.
    const semRequestId = ({ requestId: _requestId, ...resto }) => resto;
    expect(semRequestId(existente.body)).toEqual(semRequestId(inexistente.body));
    expect(existente.body.code).toBe('SPRINT_NOT_FOUND');
    expect(await prisma.task.count({ where: { sprintId: { not: null } } })).toBe(0);
  });

  it('nao distingue tarefa alheia de tarefa inexistente pelo lado da sprint', async () => {
    const owner = await register('oracle-sprint-owner@example.invalid');
    const stranger = await register('oracle-sprint-stranger@example.invalid');
    const meuProjeto = await createProject(owner, 'Meu projeto');
    const alheio = await createProject(stranger, 'Projeto alheio');
    const minhaSprint = (await createSprint(owner, meuProjeto.id)).body.sprint;
    const tarefaAlheia = await createTask(stranger, alheio.id);

    const existente = await owner
      .mutate('put', `/api/sprints/${minhaSprint.id}/tasks`)
      .send({ taskIds: [tarefaAlheia.id] });
    const inexistente = await owner
      .mutate('put', `/api/sprints/${minhaSprint.id}/tasks`)
      .send({ taskIds: [999999] });

    expect(existente.status).toBe(404);
    expect(existente.status).toBe(inexistente.status);
    const semRequestId = ({ requestId: _requestId, ...resto }) => resto;
    expect(semRequestId(existente.body)).toEqual(semRequestId(inexistente.body));
    expect(existente.body.code).toBe('TASK_NOT_FOUND');
    expect(await prisma.task.count({ where: { sprintId: minhaSprint.id } })).toBe(0);
  });

  it('mantem a autorizacao dos recursos antigos apos estender resolveProjectId', async () => {
    const owner = await register('regression-owner@example.invalid');
    const stranger = await register('regression-stranger@example.invalid');
    const project = await createProject(owner);
    const task = await createTask(owner, project.id);
    const requirement = (
      await owner.mutate('post', `/api/projects/${project.id}/requirements`).send({ title: 'RF' })
    ).body.requirement;

    expect((await stranger.agent.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await stranger.agent.get(`/api/requirements/${requirement.id}`)).status).toBe(404);
    expect((await stranger.agent.get(`/api/projects/${project.id}`)).status).toBe(404);
    expect((await owner.agent.get(`/api/tasks/${task.id}`)).status).toBe(200);
    expect((await owner.agent.get(`/api/requirements/${requirement.id}`)).status).toBe(200);
  });
});

describe('validacao e erros', () => {
  it('retorna 400 com details sem eco do valor recebido', async () => {
    const owner = await register('validation@example.invalid');
    const project = await createProject(owner);
    const response = await owner
      .mutate('post', `/api/projects/${project.id}/sprints`)
      .send({ name: '', startDate: 'nao-e-data', endDate: '2026-08-14' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('nao-e-data');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('rejeita campo desconhecido no body', async () => {
    const owner = await register('strict-body@example.invalid');
    const project = await createProject(owner);
    const response = await owner.mutate('post', `/api/projects/${project.id}/sprints`).send({
      name: 'S',
      startDate: '2026-08-01',
      endDate: '2026-08-14',
      projectId: 999
    });
    expect(response.status).toBe(400);
  });
});

describe('auditoria', () => {
  it('gera exatamente um AuditEvent por mutacao, com ator da sessao', async () => {
    const owner = await register('audit@example.invalid');
    const project = await createProject(owner);
    await prisma.auditEvent.deleteMany();

    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const created = await prisma.auditEvent.findMany({ where: { action: 'SPRINT_CREATED' } });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      actorUserId: owner.userId,
      projectId: project.id,
      resourceType: 'Sprint',
      resourceId: String(sprintId)
    });

    await owner.mutate('put', `/api/sprints/${sprintId}`).send({ name: 'Renomeada' });
    const updated = await prisma.auditEvent.findMany({ where: { action: 'SPRINT_UPDATED' } });
    expect(updated).toHaveLength(1);
    // sprintId precisa sobreviver a allowlist de minimizacao de metadata.
    expect(updated[0].metadataJson).toMatchObject({ sprintId });
  });

  // Regressao: o enum TaskHistoryField ganhou SPRINT e a interface passou a oferecer o
  // filtro, mas taskHistoryQuerySchema nao foi estendido — o campo ficava gravavel e nao
  // filtravel. Este e o unico caminho que responde "quais tarefas entraram ou sairam
  // desta sprint", entao sem ele o criterio de aceite do RF10 fica sem consulta.
  it('permite filtrar o historico de tarefas por field=SPRINT', async () => {
    const owner = await register('history-sprint-filter@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);

    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    await owner.mutate('put', `/api/tasks/${task.id}`).send({ priority: 'ALTA' });

    const filtrado = await owner.agent
      .get(`/api/projects/${project.id}/tasks/history`)
      .query({ field: 'SPRINT' });

    expect(filtrado.status).toBe(200);
    expect(filtrado.body).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ field: 'SPRINT', toValue: String(sprintId) })]
    });

    // O filtro discrimina de fato: outros campos do mesmo projeto ficam de fora.
    const semFiltro = await owner.agent.get(`/api/projects/${project.id}/tasks/history`);
    expect(semFiltro.body.total).toBeGreaterThan(1);
  });

  it('registra o vinculo de sprint na trilha de auditoria', async () => {
    const owner = await register('audit-link@example.invalid');
    const project = await createProject(owner);
    const sprintId = (await createSprint(owner, project.id)).body.sprint.id;
    const task = await createTask(owner, project.id);
    await prisma.auditEvent.deleteMany();

    await owner.mutate('patch', `/api/tasks/${task.id}/sprint`).send({ sprintId });
    const linked = await prisma.auditEvent.findMany({ where: { action: 'TASK_SPRINT_LINKED' } });
    expect(linked).toHaveLength(1);
    expect(linked[0].metadataJson).toMatchObject({ taskId: task.id, sprintId });
  });
});
