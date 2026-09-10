import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findRunning: vi.fn(),
    listCompletedPage: vi.fn(),
    summarizeCompleted: vi.fn(),
    findById: vi.fn(),
    startAtomic: vi.fn(),
    stopAtomic: vi.fn(),
    createManualAtomic: vi.fn(),
    deleteAtomic: vi.fn()
  },
  taskRepository: { findTaskById: vi.fn() }
}));

vi.mock('../../src/modules/tasks/repositories/task-time-entry.repository.js', () => ({
  taskTimeEntryRepository: mocks.repository
}));
vi.mock('../../src/modules/tasks/task.repository.js', () => ({
  taskRepository: mocks.taskRepository,
  taskInclude: {}
}));

import {
  MANUAL_ENTRY_MAX_HOURS,
  taskTimeEntryService
} from '../../src/modules/tasks/services/task-time-entry.service.js';

const task = { id: 42, projectId: 7, estimatedEffort: 2 };
const member = { actorUserId: 10, membershipRole: 'MEMBER', requestId: 'req-1' };
const other = { actorUserId: 11, membershipRole: 'MEMBER', requestId: 'req-2' };
const manager = { actorUserId: 99, membershipRole: 'MANAGER', requestId: 'req-3' };
const viewer = { actorUserId: 10, membershipRole: 'VIEWER', requestId: 'req-4' };

const storedEntry = (overrides = {}) => ({
  id: 5,
  taskId: 42,
  source: 'TIMER',
  startedAt: new Date('2026-09-06T14:00:00.000Z'),
  endedAt: null,
  durationSeconds: null,
  note: null,
  startedById: 10,
  endedById: null,
  createdAt: new Date('2026-09-06T14:00:00.000Z'),
  startedBy: { id: 10, name: 'Ana' },
  endedBy: null,
  ...overrides
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.taskRepository.findTaskById.mockResolvedValue(task);
  mocks.repository.findRunning.mockResolvedValue(null);
  mocks.repository.listCompletedPage.mockResolvedValue([0, []]);
  mocks.repository.summarizeCompleted.mockResolvedValue({ completedSeconds: 0, completedCount: 0 });
});

describe('taskTimeEntryService — cronômetro', () => {
  it('inicia a sessão com o ator da sessão HTTP, audita e devolve o resumo com a sessão em andamento', async () => {
    mocks.repository.startAtomic.mockResolvedValue({
      outcome: 'STARTED',
      entry: storedEntry(),
      running: storedEntry(),
      completedSeconds: 0,
      completedCount: 0,
      legacySeconds: 0
    });
    const result = await taskTimeEntryService.startTaskTimer(42, member);
    expect(mocks.repository.startAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 7,
        taskId: 42,
        startedById: 10,
        startedAt: expect.any(Date)
      }),
      expect.objectContaining({
        action: 'TASK_TIMER_STARTED',
        resourceType: 'TaskTimeEntry',
        projectId: 7,
        actorUserId: 10,
        metadataJson: { taskId: 42, source: 'TIMER' }
      })
    );
    expect(result.entry).toMatchObject({
      id: 5,
      startedBy: { id: 10, name: 'Ana' },
      canDelete: true
    });
    expect(result.effort).toMatchObject({
      estimatedHours: 2,
      status: 'DENTRO_DO_PREVISTO',
      running: { id: 5, startedBy: { id: 10, name: 'Ana' } }
    });
    // Nenhuma leitura depois do commit: a escrita confirmada não pode virar erro.
    expect(mocks.repository.summarizeCompleted).not.toHaveBeenCalled();
    expect(mocks.repository.findRunning).not.toHaveBeenCalled();
  });

  it('não relê o banco após confirmar lançamento manual ou exclusão', async () => {
    const manualEntry = storedEntry({
      id: 8,
      source: 'MANUAL',
      endedAt: new Date('2026-09-06T15:00:00.000Z'),
      durationSeconds: 3600,
      endedById: 10,
      endedBy: { id: 10, name: 'Ana' }
    });
    mocks.repository.createManualAtomic.mockResolvedValue({
      outcome: 'CREATED',
      entry: manualEntry,
      running: null,
      completedSeconds: 3600,
      completedCount: 1,
      legacySeconds: 0
    });
    const created = await taskTimeEntryService.createManualTaskTimeEntry(42, { hours: 1 }, member);
    expect(created.effort).toMatchObject({ completedCount: 1, actualHours: 1, running: null });

    mocks.repository.findById.mockResolvedValue(manualEntry);
    mocks.repository.deleteAtomic.mockResolvedValue({
      outcome: 'DELETED',
      running: null,
      completedSeconds: 0,
      completedCount: 0,
      legacySeconds: 0
    });
    const removed = await taskTimeEntryService.deleteTaskTimeEntry(42, 8, member);
    expect(removed.effort).toMatchObject({ completedCount: 0, actualHours: 0 });

    expect(mocks.repository.findRunning).not.toHaveBeenCalled();
    expect(mocks.repository.summarizeCompleted).not.toHaveBeenCalled();
  });

  it('esforço herdado antes das sessões continua somando no realizado', async () => {
    // Tarefa que trazia 8h do contrato anterior registra a primeira sessão de 1h.
    mocks.repository.stopAtomic.mockResolvedValue({
      outcome: 'STOPPED',
      entry: storedEntry({
        endedAt: new Date('2026-09-06T15:00:00.000Z'),
        durationSeconds: 3600,
        endedById: 10,
        endedBy: { id: 10, name: 'Ana' }
      }),
      running: null,
      completedSeconds: 3600,
      completedCount: 1,
      legacySeconds: 8 * 3600
    });
    const result = await taskTimeEntryService.stopTaskTimer(42, member);
    expect(result.effort).toMatchObject({
      actualHours: 9,
      completedSeconds: 9 * 3600,
      trackedSeconds: 3600,
      legacyHours: 8,
      completedCount: 1
    });
  });

  it('recusa segunda sessão simultânea com 409 e VIEWER com 403', async () => {
    mocks.repository.startAtomic.mockResolvedValue({
      outcome: 'ALREADY_RUNNING',
      entry: storedEntry()
    });
    await expect(taskTimeEntryService.startTaskTimer(42, member)).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(taskTimeEntryService.startTaskTimer(42, viewer)).rejects.toMatchObject({
      statusCode: 403
    });
    expect(mocks.repository.startAtomic).toHaveBeenCalledTimes(1);
  });

  it('qualquer membro para a sessão; a auditoria leva a duração calculada e o resumo usa os totais recalculados', async () => {
    const stopped = storedEntry({
      endedAt: new Date('2026-09-06T15:30:00.000Z'),
      endedById: 11,
      endedBy: { id: 11, name: 'Bruno' },
      durationSeconds: 5400
    });
    mocks.repository.stopAtomic.mockImplementation(async (taskId, data, buildAudit) => {
      expect(taskId).toBe(42);
      expect(data).toMatchObject({ endedById: 11, endedAt: expect.any(Date) });
      expect(buildAudit(stopped)).toMatchObject({
        action: 'TASK_TIMER_STOPPED',
        resourceId: '5',
        metadataJson: { taskId: 42, source: 'TIMER', durationSeconds: 5400 }
      });
      return {
        outcome: 'STOPPED',
        entry: stopped,
        completedSeconds: 5400,
        completedCount: 1,
        actualEffort: 1.5
      };
    });
    const result = await taskTimeEntryService.stopTaskTimer(42, other);
    expect(result.entry).toMatchObject({
      endedBy: { id: 11, name: 'Bruno' },
      durationSeconds: 5400
    });
    expect(result.effort).toMatchObject({
      actualHours: 1.5,
      usagePercent: 75,
      status: 'PROXIMO_DO_LIMITE',
      running: null
    });
    expect(mocks.repository.summarizeCompleted).not.toHaveBeenCalled();
  });

  it('parar sem sessão em andamento responde 409', async () => {
    mocks.repository.stopAtomic.mockResolvedValue({ outcome: 'NOT_RUNNING' });
    await expect(taskTimeEntryService.stopTaskTimer(42, member)).rejects.toMatchObject({
      statusCode: 409
    });
  });
});

describe('taskTimeEntryService — lançamento manual', () => {
  it('aceita horas decimais com vírgula, deriva o início e atribui início e fim ao ator', async () => {
    mocks.repository.createManualAtomic.mockImplementation(async (data, audit) => ({
      outcome: 'CREATED',
      entry: storedEntry({ ...data, id: 6, source: 'MANUAL', endedBy: { id: 10, name: 'Ana' } }),
      completedSeconds: data.durationSeconds,
      completedCount: 1,
      actualEffort: 1.5,
      audit
    }));
    const result = await taskTimeEntryService.createManualTaskTimeEntry(
      42,
      { hours: '1,5', note: '  esqueci de iniciar  ', occurredAt: '2026-09-05' },
      member
    );
    const [data, audit] = mocks.repository.createManualAtomic.mock.calls[0];
    expect(data).toMatchObject({
      projectId: 7,
      taskId: 42,
      startedById: 10,
      endedById: 10,
      durationSeconds: 5400,
      note: 'esqueci de iniciar',
      endedAt: new Date('2026-09-05T12:00:00.000Z'),
      startedAt: new Date('2026-09-05T10:30:00.000Z')
    });
    expect(audit).toMatchObject({
      action: 'TASK_TIME_ENTRY_CREATED',
      metadataJson: { taskId: 42, source: 'MANUAL', durationSeconds: 5400 }
    });
    expect(result.entry).toMatchObject({ source: 'MANUAL', durationSeconds: 5400 });
    expect(result.effort).toMatchObject({ actualHours: 1.5, status: 'PROXIMO_DO_LIMITE' });
  });

  it('rejeita horas ausentes, zero, negativas, não numéricas e acima do máximo', async () => {
    for (const hours of [undefined, '', 0, -1, 'abc', MANUAL_ENTRY_MAX_HOURS + 0.01]) {
      await expect(
        taskTimeEntryService.createManualTaskTimeEntry(42, { hours }, member)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(mocks.repository.createManualAtomic).not.toHaveBeenCalled();
  });

  it('rejeita data no futuro e data inválida', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    await expect(
      taskTimeEntryService.createManualTaskTimeEntry(42, { hours: 1, occurredAt: future }, member)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      taskTimeEntryService.createManualTaskTimeEntry(42, { hours: 1, occurredAt: 'ontem' }, member)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('taskTimeEntryService — exclusão e listagem', () => {
  it('quem iniciou exclui a própria sessão e MANAGER exclui qualquer uma; outro membro recebe 403', async () => {
    const closed = storedEntry({
      endedAt: new Date('2026-09-06T15:00:00.000Z'),
      durationSeconds: 3600
    });
    mocks.repository.findById.mockResolvedValue(closed);
    mocks.repository.deleteAtomic.mockResolvedValue({
      outcome: 'DELETED',
      completedSeconds: 0,
      completedCount: 0,
      actualEffort: null
    });

    await expect(taskTimeEntryService.deleteTaskTimeEntry(42, 5, other)).rejects.toMatchObject({
      statusCode: 403
    });
    const own = await taskTimeEntryService.deleteTaskTimeEntry(42, 5, member);
    expect(own.effort).toMatchObject({
      actualHours: 0,
      completedCount: 0,
      status: 'DENTRO_DO_PREVISTO'
    });
    await taskTimeEntryService.deleteTaskTimeEntry(42, 5, manager);
    expect(mocks.repository.deleteAtomic).toHaveBeenCalledTimes(2);
    expect(mocks.repository.deleteAtomic).toHaveBeenLastCalledWith(
      42,
      5,
      expect.objectContaining({
        action: 'TASK_TIME_ENTRY_DELETED',
        actorUserId: 99,
        resourceId: '5',
        metadataJson: { taskId: 42, source: 'TIMER', durationSeconds: 3600 }
      })
    );
  });

  it('sessão inexistente ou ID inválido respondem 404/400', async () => {
    mocks.repository.findById.mockResolvedValue(null);
    await expect(taskTimeEntryService.deleteTaskTimeEntry(42, 5, member)).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(taskTimeEntryService.deleteTaskTimeEntry(42, 'x', member)).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('lista com limite padrão 20, pagina e resolve permissões por papel', async () => {
    const rows = Array.from({ length: 20 }, (_, index) =>
      storedEntry({ id: 100 + index, endedAt: new Date(), durationSeconds: 60 })
    );
    mocks.repository.listCompletedPage.mockResolvedValue([21, rows]);
    mocks.repository.summarizeCompleted.mockResolvedValue({
      completedSeconds: 1260,
      completedCount: 21
    });
    mocks.repository.findRunning.mockResolvedValue(storedEntry({ id: 1 }));

    const asMember = await taskTimeEntryService.listTaskTimeEntries(42, {}, member);
    expect(mocks.repository.listCompletedPage).toHaveBeenCalledWith(42, {
      skip: 0,
      take: 20,
      from: undefined,
      to: undefined,
      source: undefined
    });
    expect(asMember.entries).toHaveLength(20);
    expect(asMember.pagination).toEqual({ page: 1, limit: 20, total: 21, totalPages: 2 });
    expect(asMember.running).toMatchObject({ id: 1, canDelete: true });
    expect(asMember.effort).toMatchObject({
      completedSeconds: 1260,
      completedCount: 21,
      running: { id: 1 }
    });
    expect(asMember.permissions).toEqual({ canOperate: true, canModerate: false });

    const asViewer = await taskTimeEntryService.listTaskTimeEntries(42, { limit: 5 }, viewer);
    expect(asViewer.permissions).toEqual({ canOperate: false, canModerate: false });
    expect(asViewer.entries.every((entry) => entry.canDelete === false)).toBe(true);

    for (const query of [{ limit: 101 }, { limit: 0 }, { page: 0 }, { page: 1.5 }]) {
      await expect(
        taskTimeEntryService.listTaskTimeEntries(42, query, member)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('traduz período e origem em limites de dia civil UTC, sem afetar o resumo', async () => {
    mocks.repository.listCompletedPage.mockResolvedValue([1, [storedEntry({ id: 7 })]]);
    mocks.repository.summarizeCompleted.mockResolvedValue({
      completedSeconds: 7200,
      completedCount: 3
    });

    const result = await taskTimeEntryService.listTaskTimeEntries(
      42,
      { page: 2, limit: 10, startDate: '2026-09-01', endDate: '2026-09-02', source: 'MANUAL' },
      member
    );

    expect(mocks.repository.listCompletedPage).toHaveBeenCalledWith(42, {
      skip: 10,
      take: 10,
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-02T23:59:59.999Z'),
      source: 'MANUAL'
    });
    // O resumo é sempre o total da tarefa, independente do recorte da página.
    expect(result.effort).toMatchObject({ completedSeconds: 7200, completedCount: 3 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
  });
});
