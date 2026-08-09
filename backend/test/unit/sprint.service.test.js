// RF10: invariantes de dominio das sprints, marcos e cronograma.
// Repositories mockados: nenhum acesso real ao banco.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sprint: {
    findProjectById: vi.fn(),
    findById: vi.fn(),
    findByProject: vi.fn(),
    countTasks: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    replaceTasks: vi.fn(),
    findTasksBySprint: vi.fn(),
    findTasksByIds: vi.fn(),
    scheduleData: vi.fn()
  },
  milestone: {
    findById: vi.fn(),
    findByProject: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  authorization: {
    actorSeesProject: vi.fn()
  }
}));

vi.mock('../../src/modules/authorization/index.js', () => ({
  authorizationService: mocks.authorization
}));

vi.mock('../../src/modules/sprints/repositories/sprint.repository.js', () => ({
  sprintRepository: mocks.sprint,
  sprintSelect: {}
}));
vi.mock('../../src/modules/sprints/repositories/milestone.repository.js', () => ({
  milestoneRepository: mocks.milestone,
  milestoneSelect: {}
}));

import { sprintService } from '../../src/modules/sprints/sprint.service.js';

const projectId = 1;
const baseSprint = {
  id: 10,
  projectId,
  name: 'Sprint 1',
  objective: null,
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-14T00:00:00.000Z'),
  status: 'PLANEJADA',
  startedAt: null,
  completedAt: null
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sprint.findProjectById.mockResolvedValue({ id: projectId });
  mocks.sprint.create.mockImplementation(async (_p, data) => ({ ...baseSprint, ...data }));
  mocks.sprint.update.mockImplementation(async (_id, data) => ({ ...baseSprint, ...data }));
});

describe('ordem das datas', () => {
  it('aceita inicio igual ao fim', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        startDate: '2026-08-01',
        endDate: '2026-08-01'
      })
    ).resolves.toBeDefined();
  });

  it('rejeita inicio posterior ao fim com codigo estavel', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        startDate: '2026-08-15',
        endDate: '2026-08-01'
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'SPRINT_DATE_RANGE_INVALID' });
  });

  it('rejeita formato de data invalido', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        startDate: '2026-13-45',
        endDate: '2026-08-01'
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('normaliza datetime com offset para o dia UTC', async () => {
    const sprint = await sprintService.createSprint(projectId, {
      name: 'S',
      startDate: '2026-08-01T23:59:59-03:00',
      endDate: '2026-08-15'
    });
    // 2026-08-01T23:59:59-03:00 e 2026-08-02T02:59:59Z: dia 2 em UTC.
    expect(sprint.startDate.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('valida a ordem considerando o campo nao alterado na edicao', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    await expect(sprintService.updateSprint(10, { startDate: '2026-09-01' })).rejects.toMatchObject(
      { code: 'SPRINT_DATE_RANGE_INVALID' }
    );
  });
});

describe('unicidade de nome', () => {
  it('converte violacao P2002 do Prisma em conflito 409', async () => {
    mocks.sprint.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      sprintService.createSprint(projectId, {
        name: 'Sprint 1',
        startDate: '2026-08-01',
        endDate: '2026-08-14'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SPRINT_NAME_IN_USE' });
  });

  it('aceita o mesmo nome em projeto diferente', async () => {
    mocks.sprint.findProjectById.mockResolvedValue({ id: 2 });
    await expect(
      sprintService.createSprint(2, {
        name: 'Sprint 1',
        startDate: '2026-08-01',
        endDate: '2026-08-14'
      })
    ).resolves.toBeDefined();
  });
});

describe('maquina de estados da sprint', () => {
  it.each([
    ['PLANEJADA', 'EM_ANDAMENTO'],
    ['PLANEJADA', 'CANCELADA'],
    ['EM_ANDAMENTO', 'CONCLUIDA'],
    ['EM_ANDAMENTO', 'CANCELADA']
  ])('permite %s -> %s', async (from, to) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: from });
    await expect(sprintService.updateSprintStatus(10, to)).resolves.toBeDefined();
  });

  it.each([
    ['PLANEJADA', 'CONCLUIDA'],
    ['EM_ANDAMENTO', 'PLANEJADA'],
    ['CONCLUIDA', 'EM_ANDAMENTO'],
    ['CANCELADA', 'PLANEJADA'],
    ['CONCLUIDA', 'CANCELADA']
  ])('rejeita %s -> %s', async (from, to) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: from });
    await expect(sprintService.updateSprintStatus(10, to)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_INVALID_TRANSITION'
    });
  });

  it('grava startedAt ao entrar em EM_ANDAMENTO', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    await sprintService.updateSprintStatus(10, 'EM_ANDAMENTO');
    expect(mocks.sprint.update.mock.calls[0][1].startedAt).toBeInstanceOf(Date);
  });

  it('grava completedAt ao entrar em CONCLUIDA', async () => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: 'EM_ANDAMENTO' });
    await sprintService.updateSprintStatus(10, 'CONCLUIDA');
    expect(mocks.sprint.update.mock.calls[0][1].completedAt).toBeInstanceOf(Date);
  });
});

describe('bloqueios de estado terminal', () => {
  it.each(['CONCLUIDA', 'CANCELADA'])('bloqueia edicao de sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    await expect(sprintService.updateSprint(10, { name: 'Novo' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_LOCKED'
    });
  });

  it.each(['CONCLUIDA', 'CANCELADA'])('bloqueia associacao em sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 1, projectId, sprintId: null }]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([]);
    await expect(sprintService.replaceTasks(10, [1])).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_ASSOCIATION_BLOCKED'
    });
  });

  // Sem isto a sprint ficaria presa: DELETE exige conjunto vazio e estados
  // terminais nao transicionam de volta.
  it.each(['CONCLUIDA', 'CANCELADA'])('permite REMOVER tarefa de sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    mocks.sprint.findTasksByIds.mockResolvedValue([]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([{ id: 7 }]);
    mocks.sprint.replaceTasks.mockResolvedValue([]);

    await expect(sprintService.replaceTasks(10, [], { actorUserId: 3 })).resolves.toMatchObject({
      sprintId: 10
    });

    const payload = mocks.sprint.replaceTasks.mock.calls[0][1];
    expect(payload.toDetach).toEqual([7]);
    expect(payload.toAttach).toEqual([]);
    // A remocao continua rastreavel no historico funcional.
    expect(payload.historyEntries).toEqual([
      { projectId, taskId: 7, actorUserId: 3, field: 'SPRINT', fromValue: '10', toValue: null }
    ]);
  });

  it('rejeita troca que remove uma e adiciona outra em sprint terminal', async () => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: 'CONCLUIDA' });
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId, sprintId: null }]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([{ id: 7 }]);

    await expect(sprintService.replaceTasks(10, [5])).rejects.toMatchObject({
      code: 'SPRINT_ASSOCIATION_BLOCKED'
    });
    expect(mocks.sprint.replaceTasks).not.toHaveBeenCalled();
  });
});

describe('exclusao de sprint', () => {
  it('bloqueia exclusao com tarefas associadas', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    mocks.sprint.countTasks.mockResolvedValue(3);
    await expect(sprintService.deleteSprint(10)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_HAS_TASKS'
    });
    expect(mocks.sprint.delete).not.toHaveBeenCalled();
  });

  it('permite exclusao sem tarefas', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    mocks.sprint.countTasks.mockResolvedValue(0);
    await expect(sprintService.deleteSprint(10)).resolves.toEqual({ id: 10 });
    expect(mocks.sprint.delete).toHaveBeenCalledOnce();
  });

  it('retorna 404 com codigo estavel para sprint inexistente', async () => {
    mocks.sprint.findById.mockResolvedValue(null);
    await expect(sprintService.deleteSprint(999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'SPRINT_NOT_FOUND'
    });
  });
});

describe('substituicao do conjunto de tarefas', () => {
  beforeEach(() => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    mocks.sprint.replaceTasks.mockResolvedValue([]);
  });

  it('rejeita tarefa de outro projeto que o ator enxerga, com erro informativo', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(true);
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId: 99, sprintId: null }]);
    await expect(sprintService.replaceTasks(10, [5], { actorUserId: 3 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'TASK_SPRINT_PROJECT_MISMATCH'
    });
    expect(mocks.authorization.actorSeesProject).toHaveBeenCalledWith(99, 3);
    expect(mocks.sprint.replaceTasks).not.toHaveBeenCalled();
  });

  // Sem isto o par 400/404 enumeraria IDs de tarefa de projetos alheios.
  it('responde como ID inexistente quando o ator nao enxerga o projeto da tarefa', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(false);
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId: 99, sprintId: null }]);
    await expect(sprintService.replaceTasks(10, [5], { actorUserId: 3 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND'
    });
    expect(mocks.sprint.replaceTasks).not.toHaveBeenCalled();
  });

  // Falha fechado: sem ator identificado, nunca revelar a existencia da tarefa.
  it('sem actorUserId trata a tarefa alheia como inexistente', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(false);
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId: 99, sprintId: null }]);
    await expect(sprintService.replaceTasks(10, [5])).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND'
    });
    expect(mocks.authorization.actorSeesProject).toHaveBeenCalledWith(99, undefined);
  });

  it('rejeita a operacao inteira quando um ID nao existe', async () => {
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId, sprintId: null }]);
    await expect(sprintService.replaceTasks(10, [5, 6])).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mocks.sprint.replaceTasks).not.toHaveBeenCalled();
  });

  it('gera historico SPRINT para entradas e saidas', async () => {
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId, sprintId: null }]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([{ id: 7 }]);
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });

    const payload = mocks.sprint.replaceTasks.mock.calls[0][1];
    expect(payload.toAttach).toEqual([5]);
    expect(payload.toDetach).toEqual([7]);
    expect(payload.historyEntries).toEqual([
      { projectId, taskId: 5, actorUserId: 3, field: 'SPRINT', fromValue: null, toValue: '10' },
      { projectId, taskId: 7, actorUserId: 3, field: 'SPRINT', fromValue: '10', toValue: null }
    ]);
  });

  // Regressao: gravar fromValue null numa tarefa que veio de outra sprint
  // apagaria a saida da sprint de origem, e o criterio "tarefas adicionadas ou
  // removidas apos o planejamento sao identificaveis" deixaria de ser verificavel.
  it('registra a sprint de origem quando a tarefa vem de outra sprint', async () => {
    mocks.sprint.findTasksByIds.mockResolvedValue([
      { id: 5, projectId, sprintId: 42 },
      { id: 6, projectId, sprintId: null }
    ]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([]);
    await sprintService.replaceTasks(10, [5, 6], { actorUserId: 3 });

    expect(mocks.sprint.replaceTasks.mock.calls[0][1].historyEntries).toEqual([
      { projectId, taskId: 5, actorUserId: 3, field: 'SPRINT', fromValue: '42', toValue: '10' },
      { projectId, taskId: 6, actorUserId: 3, field: 'SPRINT', fromValue: null, toValue: '10' }
    ]);
  });

  it('nao gera historico quando o conjunto nao muda', async () => {
    mocks.sprint.findTasksByIds.mockResolvedValue([{ id: 5, projectId, sprintId: 10 }]);
    mocks.sprint.findTasksBySprint.mockResolvedValue([{ id: 5 }]);
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
    expect(mocks.sprint.replaceTasks.mock.calls[0][1].historyEntries).toEqual([]);
  });
});

describe('marcos', () => {
  beforeEach(() => {
    mocks.milestone.create.mockImplementation(async (_p, data) => ({ id: 1, projectId, ...data }));
    mocks.milestone.update.mockImplementation(async (_id, data) => ({ id: 1, projectId, ...data }));
  });

  it('exige data prevista na criacao', async () => {
    await expect(sprintService.createMilestone(projectId, { title: 'M' })).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('alterna o status entre PENDENTE e CONCLUIDO', async () => {
    mocks.milestone.findById.mockResolvedValue({ id: 1, projectId, status: 'PENDENTE' });
    const milestone = await sprintService.updateMilestoneStatus(1, 'CONCLUIDO');
    expect(milestone.status).toBe('CONCLUIDO');
  });

  it('rejeita status fora do enum', async () => {
    mocks.milestone.findById.mockResolvedValue({ id: 1, projectId, status: 'PENDENTE' });
    await expect(sprintService.updateMilestoneStatus(1, 'ARQUIVADO')).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('retorna 404 com codigo estavel para marco inexistente', async () => {
    mocks.milestone.findById.mockResolvedValue(null);
    await expect(sprintService.getMilestoneById(999)).rejects.toMatchObject({
      statusCode: 404,
      code: 'MILESTONE_NOT_FOUND'
    });
  });
});

describe('montagem do cronograma', () => {
  const sprintA = {
    ...baseSprint,
    id: 10,
    tasks: [
      {
        id: 1,
        title: 'T1',
        status: 'A_FAZER',
        priority: 'ALTA',
        deadline: new Date('2026-08-20T00:00:00.000Z'),
        responsibleUserId: 4,
        sprintId: 10
      }
    ]
  };

  beforeEach(() => {
    mocks.sprint.scheduleData.mockResolvedValue([
      [sprintA],
      [
        {
          id: 2,
          title: 'Sem sprint com prazo',
          status: 'A_FAZER',
          priority: 'MEDIA',
          deadline: new Date('2026-08-05T00:00:00.000Z'),
          responsibleUserId: null,
          sprintId: null
        },
        {
          id: 3,
          title: 'Sem sprint sem prazo',
          status: 'A_FAZER',
          priority: 'BAIXA',
          deadline: null,
          responsibleUserId: null,
          sprintId: null
        }
      ]
    ]);
    mocks.milestone.findByProject.mockResolvedValue([
      {
        id: 1,
        title: 'M1',
        description: null,
        dueDate: new Date('2026-08-14T00:00:00.000Z'),
        status: 'PENDENTE'
      }
    ]);
  });

  it('sem filtro retorna tudo, inclusive tarefa sem sprint e sem prazo', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    expect(schedule.sprints).toHaveLength(1);
    expect(schedule.unassignedTasks.map((task) => task.id)).toEqual([2, 3]);
    expect(schedule.range).toEqual({ from: null, to: null });
  });

  it('com filtro omite tarefa sem sprint e sem prazo', async () => {
    const schedule = await sprintService.getSchedule(projectId, {
      from: '2026-08-01',
      to: '2026-08-31'
    });
    expect(schedule.unassignedTasks.map((task) => task.id)).toEqual([2]);
  });

  it('exclui sprint que nao intersecta a janela', async () => {
    const schedule = await sprintService.getSchedule(projectId, {
      from: '2026-09-01',
      to: '2026-09-30'
    });
    expect(schedule.sprints).toHaveLength(0);
  });

  it('rejeita janela com from maior que to', async () => {
    await expect(
      sprintService.getSchedule(projectId, { from: '2026-09-30', to: '2026-09-01' })
    ).rejects.toMatchObject({ code: 'SPRINT_DATE_RANGE_INVALID' });
  });

  it('deriva duracao, contagem e prazo fora da janela', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    const [sprint] = schedule.sprints;
    expect(sprint.durationInDays).toBe(14);
    expect(sprint.taskCount).toBe(1);
    expect(sprint.tasks[0].deadlineOutsideWindow).toBe(true);
  });

  it('minimiza o DTO de tarefa: sem descricao, esforco ou e-mail', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    expect(Object.keys(schedule.sprints[0].tasks[0]).sort()).toEqual([
      'deadline',
      'deadlineOutsideWindow',
      'id',
      'priority',
      'responsibleUserId',
      'status',
      'title'
    ]);
  });

  it('nao calcula evolucao: planejado, concluido e percentual sao do RF35', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    const [sprint] = schedule.sprints;
    expect(sprint).not.toHaveProperty('plannedCount');
    expect(sprint).not.toHaveProperty('completedCount');
    expect(sprint).not.toHaveProperty('progressPercentage');
  });

  it('expoe generatedAt em ISO-8601 UTC', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    expect(schedule.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
