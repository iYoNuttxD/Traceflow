import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sprint: {
    findProjectById: vi.fn(),
    findById: vi.fn(),
    findByProject: vi.fn(),
    createWithinProjectLock: vi.fn(),
    updateWithinProjectLock: vi.fn(),
    transitionWithinSprintLock: vi.fn(),
    mutateScopeWithinSprintLock: vi.fn(),
    findTasksBySprint: vi.fn(),
    scheduleData: vi.fn()
  },
  milestone: {
    findById: vi.fn(),
    findByProject: vi.fn(),
    createWithinProjectLock: vi.fn(),
    updateWithinProjectLock: vi.fn(),
    deleteWithinProjectLock: vi.fn()
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
  completedAt: null,
  milestoneId: null
};

let lockedSprints = [];
let lockedMilestones = [];
let lockedStatusSprint = null;
let lockedTasks = [];
let lockedMilestoneSprints = [];
let capturedTransition = null;
let scopeSnapshot = null;
let capturedPlan = null;

beforeEach(() => {
  vi.clearAllMocks();
  lockedSprints = [];
  lockedStatusSprint = null;
  lockedTasks = [];
  lockedMilestoneSprints = [];
  capturedTransition = null;
  capturedPlan = null;
  scopeSnapshot = { sprint: baseSprint, participations: [], tasks: [], activeElsewhere: [] };

  mocks.sprint.findProjectById.mockResolvedValue({ id: projectId });
  mocks.milestone.findById.mockResolvedValue({ id: 7, projectId, title: 'Marco' });
  lockedMilestones = [{ id: 7 }];
  mocks.sprint.createWithinProjectLock.mockImplementation(async (id, data, _audit, validate) => {
    await validate({ sprints: lockedSprints, sprint: null, milestones: lockedMilestones });
    return { ...baseSprint, ...data, projectId: id };
  });
  mocks.sprint.updateWithinProjectLock.mockImplementation(
    async (id, _projectId, data, _audit, validate) => {
      await validate({
        sprints: lockedSprints,
        sprint: lockedSprints.find((sprint) => sprint.id === id) ?? null,
        milestones: lockedMilestones
      });
      return { ...baseSprint, ...data, id };
    }
  );
  mocks.sprint.transitionWithinSprintLock.mockImplementation(
    async (id, _projectId, buildChange) => {
      const atual = { ...(lockedStatusSprint ?? baseSprint), id };
      capturedTransition = await buildChange({
        sprint: atual,
        sprints: lockedSprints.length ? lockedSprints : [atual],
        tasks: lockedTasks,
        milestoneSprints: lockedMilestoneSprints
      });
      return {
        sprint: { ...atual, ...capturedTransition.data },
        returnedToBacklog: capturedTransition.backlog?.taskIds.length ?? 0,
        milestoneCompleted: capturedTransition.milestone
          ? { id: capturedTransition.milestone.id, title: 'Marco', status: 'CONCLUIDO' }
          : null
      };
    }
  );
  mocks.sprint.mutateScopeWithinSprintLock.mockImplementation(
    async (_id, _projectId, _ids, buildPlan) => {
      capturedPlan = await buildPlan(scopeSnapshot);
      return [];
    }
  );
});

const participacao = (taskId, overrides = {}) => ({
  id: taskId * 100,
  projectId,
  sprintId: 10,
  taskId,
  taskTitleSnapshot: `T${taskId}`,
  addedAt: new Date('2026-08-02T00:00:00.000Z'),
  addedAfterStart: false,
  carriedFromSprintId: null,
  removedAt: null,
  removalReason: null,
  exitStatus: null,
  closedAt: null,
  ...overrides
});

const tarefa = (id, overrides = {}) => ({
  id,
  projectId,
  sprintId: null,
  status: 'A_FAZER',
  title: `T${id}`,
  ...overrides
});

describe('ordem das datas', () => {
  it('rejeita inicio igual ao fim', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        milestoneId: 7,
        startDate: '2026-08-01',
        endDate: '2026-08-01'
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'SPRINT_DATE_RANGE_INVALID' });
  });

  it('rejeita inicio posterior ao fim com codigo estavel', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        milestoneId: 7,
        startDate: '2026-08-15',
        endDate: '2026-08-01'
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'SPRINT_DATE_RANGE_INVALID' });
  });

  it('rejeita formato de data invalido', async () => {
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S',
        milestoneId: 7,
        startDate: '2026-13-45',
        endDate: '2026-08-01'
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('preserva o instante informado, com offset', async () => {
    const sprint = await sprintService.createSprint(projectId, {
      name: 'S',
      milestoneId: 7,
      startDate: '2026-08-01T23:59:59-03:00',
      endDate: '2026-08-15'
    });
    expect(sprint.startDate.toISOString()).toBe('2026-08-02T02:59:59.000Z');
  });

  it('interpreta data de calendario como inicio do dia em UTC', async () => {
    const sprint = await sprintService.createSprint(projectId, {
      name: 'S',
      milestoneId: 7,
      startDate: '2026-08-01',
      endDate: '2026-08-15'
    });
    expect(sprint.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it.each([
    ['2026-08-01T00:00:00+14:00', '2026-07-31T10:00:00.000Z', 'para o dia anterior'],
    ['2026-08-01T23:00:00-11:00', '2026-08-02T10:00:00.000Z', 'para o dia seguinte'],
    ['2026-08-01T12:00:00+05:30', '2026-08-01T06:30:00.000Z', 'com offset de meia hora']
  ])('preserva %s, que cruza o dia %s', async (entrada, esperado) => {
    const sprint = await sprintService.createSprint(projectId, {
      name: 'S',
      milestoneId: 7,
      startDate: entrada,
      endDate: '2026-09-30'
    });
    expect(sprint.startDate.toISOString()).toBe(esperado);
  });

  it('trata Z e +00:00 como o mesmo instante', async () => {
    const comZ = await sprintService.createSprint(projectId, {
      name: 'S',
      milestoneId: 7,
      startDate: '2026-08-01T09:00:00Z',
      endDate: '2026-08-15'
    });
    const comOffset = await sprintService.createSprint(projectId, {
      name: 'S',
      milestoneId: 7,
      startDate: '2026-08-01T09:00:00+00:00',
      endDate: '2026-08-15'
    });
    expect(comZ.startDate.toISOString()).toBe(comOffset.startDate.toISOString());
  });

  it('valida a ordem considerando o campo nao alterado na edicao', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    lockedSprints = [baseSprint];
    await expect(sprintService.updateSprint(10, { startDate: '2026-09-01' })).rejects.toMatchObject(
      { code: 'SPRINT_DATE_RANGE_INVALID' }
    );
  });

  it('completa a janela parcial com o registro travado, nao com o lido antes', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    lockedSprints = [{ ...baseSprint, startDate: new Date('2026-08-20T00:00:00.000Z') }];
    await expect(sprintService.updateSprint(10, { endDate: '2026-08-15' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'SPRINT_DATE_RANGE_INVALID'
    });
  });

  it('aceita a janela parcial quando o registro travado a mantem coerente', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    lockedSprints = [baseSprint];
    await expect(sprintService.updateSprint(10, { endDate: '2026-08-20' })).resolves.toBeDefined();
  });

  it('recusa janela completa invalida sem abrir a transacao', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    await expect(
      sprintService.updateSprint(10, { startDate: '2026-09-01', endDate: '2026-08-01' })
    ).rejects.toMatchObject({ code: 'SPRINT_DATE_RANGE_INVALID' });
    expect(mocks.sprint.updateWithinProjectLock).not.toHaveBeenCalled();
  });

  it('trata sprint ausente do retrato travado como inexistente', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    lockedSprints = [];
    await expect(sprintService.updateSprint(10, { name: 'Novo' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SPRINT_NOT_FOUND'
    });
  });

  it('propaga 404 quando o repository nao encontra a linha para travar', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    mocks.sprint.updateWithinProjectLock.mockResolvedValue(null);
    await expect(sprintService.updateSprint(10, { name: 'Novo' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SPRINT_NOT_FOUND'
    });
  });
});

describe('marco da sprint', () => {
  const criar = (overrides = {}) => ({
    name: 'Sprint 1',
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    milestoneId: 7,
    ...overrides
  });

  beforeEach(() => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    mocks.milestone.findById.mockResolvedValue({ id: 7, projectId, title: 'Marco' });
    lockedSprints = [];
    lockedMilestones = [{ id: 7 }];
  });

  it('exige marco na criacao', async () => {
    const semMarco = criar();
    delete semMarco.milestoneId;
    await expect(sprintService.createSprint(projectId, semMarco)).rejects.toMatchObject({
      statusCode: 400,
      code: 'SPRINT_MILESTONE_REQUIRED'
    });
  });

  it('grava o marco informado', async () => {
    const sprint = await sprintService.createSprint(projectId, criar());
    expect(sprint.milestoneId).toBe(7);
  });

  it('rejeita marco inexistente', async () => {
    mocks.milestone.findById.mockResolvedValue(null);
    await expect(sprintService.createSprint(projectId, criar())).rejects.toMatchObject({
      statusCode: 404,
      code: 'MILESTONE_NOT_FOUND'
    });
  });

  it('rejeita marco de outro projeto que o ator enxerga', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(true);
    mocks.milestone.findById.mockResolvedValue({ id: 7, projectId: 99, title: 'Alheio' });
    await expect(
      sprintService.createSprint(projectId, criar(), { actorUserId: 3 })
    ).rejects.toMatchObject({ statusCode: 400, code: 'SPRINT_MILESTONE_PROJECT_MISMATCH' });
  });

  it('responde como marco inexistente quando o ator nao enxerga o projeto', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(false);
    mocks.milestone.findById.mockResolvedValue({ id: 7, projectId: 99, title: 'Alheio' });
    await expect(
      sprintService.createSprint(projectId, criar(), { actorUserId: 3 })
    ).rejects.toMatchObject({ statusCode: 404, code: 'MILESTONE_NOT_FOUND' });
  });

  it('recusa quando o marco sumiu do retrato travado', async () => {
    lockedMilestones = [];
    await expect(sprintService.createSprint(projectId, criar())).rejects.toMatchObject({
      statusCode: 404,
      code: 'MILESTONE_NOT_FOUND'
    });
  });

  it('aceita desvincular o marco na edicao', async () => {
    lockedSprints = [baseSprint];
    const sprint = await sprintService.updateSprint(10, { milestoneId: null });
    expect(sprint.milestoneId).toBeNull();
    expect(mocks.milestone.findById).not.toHaveBeenCalled();
  });

  it('encolher a janela nao consulta marcos', async () => {
    lockedSprints = [baseSprint];
    await expect(
      sprintService.updateSprint(10, { startDate: '2026-08-02', endDate: '2026-08-05' })
    ).resolves.toBeDefined();
  });
});

describe('sobreposicao de janelas', () => {
  const existente = {
    ...baseSprint,
    id: 99,
    name: 'Sprint anterior',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-15T00:00:00.000Z')
  };

  it('rejeita janela que cruza sprint do mesmo projeto', async () => {
    lockedSprints = [existente];
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S2',
        milestoneId: 7,
        startDate: '2026-08-14',
        endDate: '2026-08-28'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SPRINT_OVERLAP' });
  });

  it('aceita janela que comeca no instante em que a anterior termina', async () => {
    lockedSprints = [existente];
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S2',
        milestoneId: 7,
        startDate: '2026-08-15',
        endDate: '2026-08-29'
      })
    ).resolves.toBeDefined();
  });

  it('ignora a propria sprint ao editar', async () => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, id: 99 });
    lockedSprints = [existente];
    await expect(sprintService.updateSprint(99, { name: 'Renomeada' })).resolves.toBeDefined();
  });

  it('rejeita edicao que passa a cruzar outra sprint', async () => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
    lockedSprints = [existente, { ...baseSprint, id: 10 }];
    await expect(
      sprintService.updateSprint(10, { startDate: '2026-08-10', endDate: '2026-08-20' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SPRINT_OVERLAP' });
  });

  it('aceita janela sobre o periodo de uma sprint cancelada', async () => {
    lockedSprints = [{ ...existente, status: 'CANCELADA' }];
    await expect(
      sprintService.createSprint(projectId, {
        name: 'S2',
        milestoneId: 7,
        startDate: '2026-08-05',
        endDate: '2026-08-12'
      })
    ).resolves.toBeDefined();
  });
});

describe('unicidade de nome', () => {
  it('converte violacao P2002 do Prisma em conflito 409', async () => {
    mocks.sprint.createWithinProjectLock.mockRejectedValue({ code: 'P2002' });
    await expect(
      sprintService.createSprint(projectId, {
        name: 'Sprint 1',
        milestoneId: 7,
        startDate: '2026-08-01',
        endDate: '2026-08-14'
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SPRINT_NAME_IN_USE' });
  });

  it('aceita o mesmo nome em projeto diferente', async () => {
    mocks.sprint.findProjectById.mockResolvedValue({ id: 2 });
    mocks.milestone.findById.mockResolvedValue({ id: 7, projectId: 2, title: 'Marco' });
    await expect(
      sprintService.createSprint(2, {
        name: 'Sprint 1',
        milestoneId: 7,
        startDate: '2026-08-01',
        endDate: '2026-08-14'
      })
    ).resolves.toBeDefined();
  });
});

describe('maquina de estados da sprint', () => {
  const comStatus = (status) => {
    const sprint = { ...baseSprint, status };
    mocks.sprint.findById.mockResolvedValue(sprint);
    lockedStatusSprint = sprint;
    return sprint;
  };

  it.each([
    ['PLANEJADA', 'EM_ANDAMENTO'],
    ['PLANEJADA', 'CANCELADA'],
    ['EM_ANDAMENTO', 'CONCLUIDA'],
    ['EM_ANDAMENTO', 'CANCELADA']
  ])('permite %s -> %s', async (from, to) => {
    comStatus(from);
    await expect(sprintService.updateSprintStatus(10, to)).resolves.toBeDefined();
  });

  it.each([
    ['PLANEJADA', 'CONCLUIDA'],
    ['EM_ANDAMENTO', 'PLANEJADA'],
    ['CONCLUIDA', 'EM_ANDAMENTO'],
    ['CANCELADA', 'PLANEJADA'],
    ['CONCLUIDA', 'CANCELADA']
  ])('rejeita %s -> %s', async (from, to) => {
    comStatus(from);
    await expect(sprintService.updateSprintStatus(10, to)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_INVALID_TRANSITION'
    });
  });

  it('grava startedAt ao entrar em EM_ANDAMENTO', async () => {
    comStatus('PLANEJADA');
    await sprintService.updateSprintStatus(10, 'EM_ANDAMENTO');
    expect(capturedTransition.data.startedAt).toBeInstanceOf(Date);
  });

  it('grava completedAt ao entrar em CONCLUIDA', async () => {
    comStatus('EM_ANDAMENTO');
    await sprintService.updateSprintStatus(10, 'CONCLUIDA');
    expect(capturedTransition.data.completedAt).toBeInstanceOf(Date);
  });

  it('nao congela participacoes ao iniciar', async () => {
    comStatus('PLANEJADA');
    await sprintService.updateSprintStatus(10, 'EM_ANDAMENTO');
    expect(capturedTransition.freezeAt).toBeNull();
  });

  it.each(['CONCLUIDA', 'CANCELADA'])('congela participacoes ao entrar em %s', async (status) => {
    comStatus('EM_ANDAMENTO');
    await sprintService.updateSprintStatus(10, status);
    expect(capturedTransition.freezeAt).toBeInstanceOf(Date);
  });

  it.each(['CONCLUIDA', 'CANCELADA'])(
    'recusa a transicao quando o registro travado ja esta %s',
    async (status) => {
      mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: 'PLANEJADA' });
      lockedStatusSprint = { ...baseSprint, status };
      await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).rejects.toMatchObject({
        statusCode: 409,
        code: 'SPRINT_INVALID_TRANSITION'
      });
    }
  );

  it('aceita a transicao que so o registro travado permite', async () => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: 'PLANEJADA' });
    lockedStatusSprint = { ...baseSprint, status: 'EM_ANDAMENTO' };
    await expect(sprintService.updateSprintStatus(10, 'CONCLUIDA')).resolves.toBeDefined();
  });

  it('propaga 404 quando o repository nao encontra a linha para travar', async () => {
    comStatus('PLANEJADA');
    mocks.sprint.transitionWithinSprintLock.mockResolvedValue(null);
    await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).rejects.toMatchObject({
      statusCode: 404,
      code: 'SPRINT_NOT_FOUND'
    });
  });

  it('usa o mesmo instante para completedAt e para o congelamento', async () => {
    comStatus('EM_ANDAMENTO');
    await sprintService.updateSprintStatus(10, 'CONCLUIDA');
    expect(capturedTransition.freezeAt.getTime()).toBe(
      capturedTransition.data.completedAt.getTime()
    );
  });

  describe('sprint unica em andamento', () => {
    it('recusa iniciar quando outra ja esta em andamento', async () => {
      comStatus('PLANEJADA');
      lockedSprints = [
        { ...baseSprint, id: 10, status: 'PLANEJADA' },
        { ...baseSprint, id: 11, name: 'Sprint 2', status: 'EM_ANDAMENTO' }
      ];
      await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).rejects.toMatchObject({
        statusCode: 409,
        code: 'SPRINT_ALREADY_ACTIVE'
      });
    });

    it('nomeia a sprint que bloqueia', async () => {
      comStatus('PLANEJADA');
      lockedSprints = [
        { ...baseSprint, id: 10, status: 'PLANEJADA' },
        { ...baseSprint, id: 11, name: 'Sprint 2', status: 'EM_ANDAMENTO' }
      ];
      await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).rejects.toThrow(
        /Sprint 2/
      );
    });

    it('aceita iniciar quando so ha sprints planejadas e encerradas', async () => {
      comStatus('PLANEJADA');
      lockedSprints = [
        { ...baseSprint, id: 10, status: 'PLANEJADA' },
        { ...baseSprint, id: 11, status: 'CONCLUIDA' },
        { ...baseSprint, id: 12, status: 'CANCELADA' }
      ];
      await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).resolves.toBeDefined();
    });

    it('decide pelo retrato travado, e nao pela leitura anterior', async () => {
      mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status: 'PLANEJADA' });
      lockedStatusSprint = { ...baseSprint, status: 'PLANEJADA' };
      lockedSprints = [
        { ...baseSprint, id: 10, status: 'PLANEJADA' },
        { ...baseSprint, id: 11, name: 'Sprint 2', status: 'EM_ANDAMENTO' }
      ];
      await expect(sprintService.updateSprintStatus(10, 'EM_ANDAMENTO')).rejects.toMatchObject({
        code: 'SPRINT_ALREADY_ACTIVE'
      });
    });
  });

  describe('devolucao ao backlog', () => {
    const tarefas = [
      { id: 1, title: 'A', status: 'CONCLUIDO', sprintId: 10 },
      { id: 2, title: 'B', status: 'EM_ANDAMENTO', sprintId: 10 },
      { id: 3, title: 'C', status: 'A_FAZER', sprintId: 10 }
    ];

    it.each(['CONCLUIDA', 'CANCELADA'])(
      'devolve as pendentes ao encerrar em %s',
      async (status) => {
        comStatus('EM_ANDAMENTO');
        lockedTasks = tarefas;
        const resultado = await sprintService.updateSprintStatus(10, status);
        expect(capturedTransition.backlog.taskIds).toEqual([2, 3]);
        expect(resultado.returnedToBacklog).toBe(2);
      }
    );

    it('nao devolve a tarefa concluida', async () => {
      comStatus('EM_ANDAMENTO');
      lockedTasks = tarefas;
      await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.backlog.taskIds).not.toContain(1);
    });

    it('registra historico de sprint para cada devolucao', async () => {
      comStatus('EM_ANDAMENTO');
      lockedTasks = tarefas;
      await sprintService.updateSprintStatus(10, 'CONCLUIDA', { actorUserId: 7 });
      expect(capturedTransition.backlog.historyEntries).toEqual([
        { projectId, taskId: 2, actorUserId: 7, field: 'SPRINT', fromValue: '10', toValue: null },
        { projectId, taskId: 3, actorUserId: 7, field: 'SPRINT', fromValue: '10', toValue: null }
      ]);
    });

    it('nao devolve nada ao iniciar', async () => {
      comStatus('PLANEJADA');
      lockedTasks = tarefas;
      await sprintService.updateSprintStatus(10, 'EM_ANDAMENTO');
      expect(capturedTransition.backlog).toBeNull();
    });

    it('ignora tarefa cujo ponteiro ja aponta para outra sprint', async () => {
      comStatus('EM_ANDAMENTO');
      lockedTasks = [{ id: 4, title: 'D', status: 'A_FAZER', sprintId: 99 }];
      await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.backlog.taskIds).toEqual([]);
    });
  });

  describe('conclusao automatica do marco', () => {
    const comMarco = (status) => {
      const sprint = { ...baseSprint, status, milestoneId: 7 };
      mocks.sprint.findById.mockResolvedValue(sprint);
      lockedStatusSprint = sprint;
      return sprint;
    };

    it('conclui o marco quando esta era a ultima sprint pendente', async () => {
      comMarco('EM_ANDAMENTO');
      lockedMilestoneSprints = [
        { id: 10, status: 'EM_ANDAMENTO', milestoneId: 7 },
        { id: 11, status: 'CONCLUIDA', milestoneId: 7 }
      ];
      const resultado = await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.milestone).toEqual({ id: 7, status: 'CONCLUIDO' });
      expect(resultado.milestoneCompleted).toMatchObject({ id: 7 });
    });

    it('nao conclui o marco com outra sprint ainda aberta', async () => {
      comMarco('EM_ANDAMENTO');
      lockedMilestoneSprints = [
        { id: 10, status: 'EM_ANDAMENTO', milestoneId: 7 },
        { id: 11, status: 'PLANEJADA', milestoneId: 7 }
      ];
      await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.milestone).toBeNull();
    });

    it('ignora sprint cancelada na conta', async () => {
      comMarco('EM_ANDAMENTO');
      lockedMilestoneSprints = [
        { id: 10, status: 'EM_ANDAMENTO', milestoneId: 7 },
        { id: 11, status: 'CANCELADA', milestoneId: 7 }
      ];
      await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.milestone).toEqual({ id: 7, status: 'CONCLUIDO' });
    });

    it('nao conclui o marco ao cancelar a ultima sprint', async () => {
      comMarco('EM_ANDAMENTO');
      lockedMilestoneSprints = [{ id: 10, status: 'EM_ANDAMENTO', milestoneId: 7 }];
      await sprintService.updateSprintStatus(10, 'CANCELADA');
      expect(capturedTransition.milestone).toBeNull();
    });

    it('nao toca em marco nenhum quando a sprint nao tem marco', async () => {
      comStatus('EM_ANDAMENTO');
      lockedMilestoneSprints = [];
      await sprintService.updateSprintStatus(10, 'CONCLUIDA');
      expect(capturedTransition.milestone).toBeNull();
    });
  });
});

describe('bloqueios de estado terminal', () => {
  it.each(['CONCLUIDA', 'CANCELADA'])('bloqueia edicao de sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    lockedSprints = [{ ...baseSprint, id: 10, status }];
    await expect(sprintService.updateSprint(10, { name: 'Novo' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_LOCKED'
    });
  });

  it.each(['CONCLUIDA', 'CANCELADA'])('bloqueia acrescimo em sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    scopeSnapshot = {
      sprint: { ...baseSprint, status },
      participations: [],
      tasks: [tarefa(1)],
      activeElsewhere: []
    };
    await expect(sprintService.replaceTasks(10, [1])).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_SCOPE_LOCKED'
    });
  });

  it.each(['CONCLUIDA', 'CANCELADA'])('bloqueia REMOCAO em sprint %s', async (status) => {
    mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
    scopeSnapshot = {
      sprint: { ...baseSprint, status },
      participations: [participacao(7)],
      tasks: [tarefa(7, { sprintId: 10 })],
      activeElsewhere: []
    };
    await expect(sprintService.replaceTasks(10, [], { actorUserId: 3 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_SCOPE_LOCKED'
    });
  });
});

describe('exclusao de sprint', () => {
  it.each(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])(
    'recusa exclusao de sprint %s',
    async (status) => {
      mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
      await expect(sprintService.deleteSprint(10)).rejects.toMatchObject({
        statusCode: 405,
        code: 'SPRINT_DELETE_NOT_SUPPORTED'
      });
    }
  );

  it('recusa antes de qualquer leitura, sem consultar a sprint', async () => {
    await expect(sprintService.deleteSprint(999)).rejects.toMatchObject({
      statusCode: 405
    });
    expect(mocks.sprint.findById).not.toHaveBeenCalled();
  });
});

describe('substituicao do conjunto de tarefas', () => {
  beforeEach(() => {
    mocks.sprint.findById.mockResolvedValue(baseSprint);
  });

  it('rejeita tarefa de outro projeto que o ator enxerga, com erro informativo', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(true);
    scopeSnapshot.tasks = [tarefa(5, { projectId: 99 })];
    await expect(sprintService.replaceTasks(10, [5], { actorUserId: 3 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'TASK_SPRINT_PROJECT_MISMATCH'
    });
    expect(mocks.authorization.actorSeesProject).toHaveBeenCalledWith(99, 3);
  });

  it('responde como ID inexistente quando o ator nao enxerga o projeto da tarefa', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(false);
    scopeSnapshot.tasks = [tarefa(5, { projectId: 99 })];
    await expect(sprintService.replaceTasks(10, [5], { actorUserId: 3 })).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND'
    });
  });

  it('sem actorUserId trata a tarefa alheia como inexistente', async () => {
    mocks.authorization.actorSeesProject.mockResolvedValue(false);
    scopeSnapshot.tasks = [tarefa(5, { projectId: 99 })];
    await expect(sprintService.replaceTasks(10, [5])).rejects.toMatchObject({
      statusCode: 404,
      code: 'TASK_NOT_FOUND'
    });
    expect(mocks.authorization.actorSeesProject).toHaveBeenCalledWith(99, undefined);
  });

  it('rejeita a operacao inteira quando um ID nao existe', async () => {
    scopeSnapshot.tasks = [tarefa(5)];
    await expect(sprintService.replaceTasks(10, [5, 6])).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('recusa conjunto acima do limite de dominio antes de abrir a transacao', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    await expect(sprintService.replaceTasks(10, ids)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SPRINT_TASK_LIMIT_REACHED'
    });
    expect(mocks.sprint.mutateScopeWithinSprintLock).not.toHaveBeenCalled();
  });

  it('gera historico SPRINT para entradas e saidas', async () => {
    scopeSnapshot = {
      sprint: baseSprint,
      participations: [participacao(7)],
      tasks: [tarefa(5), tarefa(7, { sprintId: 10 })],
      activeElsewhere: []
    };
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });

    expect(capturedPlan.attachTaskIds).toEqual([5]);
    expect(capturedPlan.detachTaskIds).toEqual([7]);
    expect(capturedPlan.historyEntries).toEqual([
      { projectId, taskId: 7, actorUserId: 3, field: 'SPRINT', fromValue: '10', toValue: null },
      { projectId, taskId: 5, actorUserId: 3, field: 'SPRINT', fromValue: null, toValue: '10' }
    ]);
  });

  it('congela o status de saida de quem deixa a sprint', async () => {
    scopeSnapshot = {
      sprint: baseSprint,
      participations: [participacao(7)],
      tasks: [tarefa(7, { sprintId: 10, status: 'EM_ANDAMENTO' })],
      activeElsewhere: []
    };
    await sprintService.replaceTasks(10, [], { actorUserId: 3 });

    expect(capturedPlan.close).toEqual([
      { id: 700, at: expect.any(Date), reason: 'REMOVIDA', exitStatus: 'EM_ANDAMENTO' }
    ]);
  });

  it('registra a sprint de origem e fecha a participacao anterior no carry-over', async () => {
    scopeSnapshot = {
      sprint: baseSprint,
      participations: [],
      tasks: [tarefa(5, { sprintId: 42, status: 'EM_ANDAMENTO' }), tarefa(6)],
      activeElsewhere: [participacao(5, { id: 555, sprintId: 42 })]
    };
    await sprintService.replaceTasks(10, [5, 6], { actorUserId: 3 });

    expect(capturedPlan.historyEntries).toEqual([
      { projectId, taskId: 5, actorUserId: 3, field: 'SPRINT', fromValue: '42', toValue: '10' },
      { projectId, taskId: 6, actorUserId: 3, field: 'SPRINT', fromValue: null, toValue: '10' }
    ]);
    expect(capturedPlan.close).toEqual([
      { id: 555, at: expect.any(Date), reason: 'MOVIDA', exitStatus: 'EM_ANDAMENTO' }
    ]);
    expect(capturedPlan.open[0]).toMatchObject({ taskId: 5, carriedFromSprintId: 42 });
    expect(capturedPlan.open[1]).toMatchObject({ taskId: 6, carriedFromSprintId: null });
  });

  describe.each([
    ['congelada primeiro', ['congelada', 'viva']],
    ['viva primeiro', ['viva', 'congelada']]
  ])('participacao congelada e viva na mesma tarefa (%s)', (_rotulo, ordem) => {
    const congelada = participacao(5, {
      id: 400,
      sprintId: 40,
      closedAt: new Date('2026-07-31T00:00:00.000Z'),
      exitStatus: 'EM_ANDAMENTO'
    });
    const viva = participacao(5, { id: 500, sprintId: 50 });
    const porRotulo = { congelada, viva };

    beforeEach(() => {
      scopeSnapshot = {
        sprint: baseSprint,
        participations: [],
        tasks: [tarefa(5, { sprintId: 50, status: 'A_FAZER' })],
        activeElsewhere: ordem.map((rotulo) => porRotulo[rotulo])
      };
    });

    it('fecha a participacao viva e nao toca na congelada', async () => {
      await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
      expect(capturedPlan.close).toEqual([
        { id: 500, at: expect.any(Date), reason: 'MOVIDA', exitStatus: 'A_FAZER' }
      ]);
    });

    it('registra a sprint viva como origem do carry-over', async () => {
      await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
      expect(capturedPlan.open[0]).toMatchObject({ taskId: 5, carriedFromSprintId: 50 });
      expect(capturedPlan.historyEntries[0]).toMatchObject({ fromValue: '50', toValue: '10' });
    });
  });

  it('usa a sprint encerrada como origem quando nao ha participacao viva', async () => {
    scopeSnapshot = {
      sprint: baseSprint,
      participations: [],
      tasks: [tarefa(5)],
      activeElsewhere: [
        participacao(5, {
          id: 400,
          sprintId: 40,
          closedAt: new Date('2026-07-31T00:00:00.000Z'),
          exitStatus: 'EM_ANDAMENTO'
        })
      ]
    };
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });

    expect(capturedPlan.close).toEqual([]);
    expect(capturedPlan.open[0]).toMatchObject({ taskId: 5, carriedFromSprintId: 40 });
  });

  it('nao gera historico quando o conjunto nao muda', async () => {
    scopeSnapshot = {
      sprint: baseSprint,
      participations: [participacao(5)],
      tasks: [tarefa(5, { sprintId: 10 })],
      activeElsewhere: []
    };
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
    expect(capturedPlan.historyEntries).toEqual([]);
  });

  it('marca inclusao posterior ao inicio da sprint', async () => {
    scopeSnapshot = {
      sprint: { ...baseSprint, status: 'EM_ANDAMENTO', startedAt: new Date('2026-08-02') },
      participations: [],
      tasks: [tarefa(5)],
      activeElsewhere: []
    };
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
    expect(capturedPlan.open[0]).toMatchObject({ taskId: 5, addedAfterStart: true });
  });

  it('nao marca inclusao posterior em sprint que ainda nao comecou', async () => {
    scopeSnapshot.tasks = [tarefa(5)];
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });
    expect(capturedPlan.open[0]).toMatchObject({ taskId: 5, addedAfterStart: false });
  });

  it('reabre a participacao com o instante da nova entrada e preserva a classificacao', async () => {
    const anterior = participacao(5, {
      removedAt: new Date('2026-08-05'),
      removalReason: 'REMOVIDA',
      exitStatus: 'A_FAZER',
      addedAfterStart: true
    });
    scopeSnapshot = {
      sprint: { ...baseSprint, status: 'EM_ANDAMENTO', startedAt: new Date('2026-08-02') },
      participations: [anterior],
      tasks: [tarefa(5)],
      activeElsewhere: []
    };
    await sprintService.replaceTasks(10, [5], { actorUserId: 3 });

    expect(capturedPlan.open[0]).toMatchObject({
      id: anterior.id,
      taskId: 5,
      addedAt: expect.any(Date),
      addedAfterStart: true
    });
    expect(capturedPlan.open[0].addedAt.getTime()).toBeGreaterThan(anterior.addedAt.getTime());
  });
});

describe('marcos', () => {
  const marco = (overrides = {}) => ({
    id: 1,
    projectId,
    status: 'PENDENTE',
    title: 'Fundacao',
    dueDate: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides
  });
  const criar = (overrides = {}) => ({ title: 'M', dueDate: '2026-08-10', ...overrides });

  let lockedSprintCount = 0;

  beforeEach(() => {
    mocks.milestone.findById.mockResolvedValue(marco());
    lockedSprintCount = 0;

    mocks.milestone.createWithinProjectLock.mockImplementation(
      async (_p, data, _audit, validate) => {
        await validate({ milestone: null, sprintCount: lockedSprintCount });
        return { id: 1, projectId, ...data };
      }
    );
    mocks.milestone.updateWithinProjectLock.mockImplementation(
      async (id, _p, data, _audit, validate) => {
        await validate({
          milestone: await mocks.milestone.findById(id),
          sprintCount: lockedSprintCount
        });
        return { id, projectId, ...data };
      }
    );
    mocks.milestone.deleteWithinProjectLock.mockImplementation(async (id, _p, _audit, validate) => {
      await validate({
        milestone: await mocks.milestone.findById(id),
        sprintCount: lockedSprintCount
      });
      return { id };
    });
  });

  it('exige titulo na criacao', async () => {
    await expect(
      sprintService.createMilestone(projectId, { dueDate: '2026-08-10' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('exige prazo na criacao', async () => {
    await expect(sprintService.createMilestone(projectId, { title: 'M' })).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('recusa sprintId no corpo, em vez de descarta-lo em silencio', async () => {
    await expect(
      sprintService.createMilestone(projectId, criar({ sprintId: 10 }))
    ).resolves.toMatchObject({ title: 'M' });
    expect(mocks.milestone.createWithinProjectLock.mock.calls[0][1]).not.toHaveProperty('sprintId');
  });

  it('aceita prazo em qualquer data do projeto', async () => {
    await expect(
      sprintService.createMilestone(projectId, criar({ dueDate: '2027-01-31' }))
    ).resolves.toBeDefined();
  });

  it('alterna o status entre PENDENTE e CONCLUIDO', async () => {
    const milestone = await sprintService.updateMilestoneStatus(1, 'CONCLUIDO');
    expect(milestone.status).toBe('CONCLUIDO');
  });

  it.each(['CONCLUIDA', 'CANCELADA'])(
    'permite editar o marco com sprint %s no projeto',
    async (status) => {
      mocks.sprint.findById.mockResolvedValue({ ...baseSprint, status });
      await expect(sprintService.updateMilestone(1, { title: 'X' })).resolves.toBeDefined();
      await expect(sprintService.updateMilestoneStatus(1, 'CONCLUIDO')).resolves.toBeDefined();
    }
  );

  it('exclui marco sem sprints', async () => {
    await expect(sprintService.deleteMilestone(1)).resolves.toEqual({ id: 1 });
  });

  it('recusa excluir marco com sprints, dizendo quantas', async () => {
    lockedSprintCount = 3;
    await expect(sprintService.deleteMilestone(1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'MILESTONE_HAS_SPRINTS'
    });
    await expect(sprintService.deleteMilestone(1)).rejects.toThrow(/3 sprint/);
  });

  it('rejeita status fora do enum', async () => {
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
    sprintTasks: [
      {
        addedAt: new Date('2026-08-02T00:00:00.000Z'),
        addedAfterStart: false,
        carriedFromSprintId: null,
        exitStatus: null,
        task: {
          id: 1,
          title: 'T1',
          status: 'A_FAZER',
          priority: 'ALTA',
          deadline: new Date('2026-08-20T00:00:00.000Z'),
          responsibleUserId: 4,
          sprintId: 10
        }
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
    expect(sprint.durationInDays).toBe(13);
    expect(sprint.taskCount).toBe(1);
    expect(sprint.tasks[0].deadlineOutsideWindow).toBe(true);
  });

  it('minimiza o DTO de tarefa: sem descricao e sem e-mail', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    expect(Object.keys(schedule.sprints[0].tasks[0]).sort()).toEqual([
      'addedAfterStart',
      'carriedFromSprintId',
      'deadline',
      'deadlineOutsideWindow',
      'estimatedEffort',
      'id',
      'priority',
      'responsibleUserId',
      'status',
      'title'
    ]);
  });

  it('expoe o marco na sprint, e nao a sprint no marco', async () => {
    const schedule = await sprintService.getSchedule(projectId, {});
    expect(schedule.sprints[0]).toHaveProperty('milestoneId');
    expect(schedule.milestones[0]).not.toHaveProperty('sprintId');
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
