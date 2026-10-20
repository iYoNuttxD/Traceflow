import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getTaskTimeEntries: vi.fn(),
  startTaskTimer: vi.fn(),
  stopTaskTimer: vi.fn(),
  createTaskTimeEntry: vi.fn(),
  deleteTaskTimeEntry: vi.fn()
}));
const bus = vi.hoisted(() => ({ listeners: new Set(), reconnectSequence: 0 }));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => apiMocks);
vi.mock('../../src/features/projects/index.js', () => ({
  useProjectEvents: () => ({
    reconnectSequence: bus.reconnectSequence,
    subscribe: (types, listener) => {
      const subscription = { types: new Set(types), listener };
      bus.listeners.add(subscription);
      return () => bus.listeners.delete(subscription);
    }
  })
}));

import { useTaskEffort } from '../../src/features/tasks/hooks/useTaskEffort.js';

const HOUR = 3600;
const ana = { id: 10, name: 'Ana' };

const runningEntry = (overrides = {}) => ({
  id: 9,
  taskId: 42,
  source: 'TIMER',
  startedAt: '2026-09-10T12:00:00.000Z',
  endedAt: null,
  startedBy: ana,
  canDelete: true,
  ...overrides
});

const closedEntry = (overrides = {}) => ({
  ...runningEntry(),
  endedAt: '2026-09-10T13:00:00.000Z',
  durationSeconds: HOUR,
  endedBy: ana,
  ...overrides
});

const effort = (overrides = {}) => ({
  unit: 'HOURS',
  estimatedHours: 8,
  completedSeconds: 0,
  completedCount: 0,
  actualHours: 0,
  running: null,
  ...overrides
});

const listResponse = (overrides = {}) => ({
  taskId: 42,
  running: null,
  entries: [],
  effort: effort(),
  permissions: { canOperate: true, canModerate: false },
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  ...overrides
});

function emit(type, entry, effortPayload, taskId = 42) {
  act(() => {
    for (const subscription of [...bus.listeners]) {
      if (subscription.types.has(type)) {
        subscription.listener({ type, taskId, data: { entry, effort: effortPayload } });
      }
    }
  });
}

// Promessa que só resolve quando o teste mandar: assim uma resposta pode chegar
// depois de um evento, que é a ordem que a rede não garante.
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  bus.listeners.clear();
  bus.reconnectSequence = 0;
  apiMocks.getTaskTimeEntries.mockResolvedValue(listResponse());
});

describe('useTaskEffort — reconciliação entre respostas HTTP e eventos', () => {
  it('leitura que saiu antes do evento não apaga a sessão já observada', async () => {
    const pending = deferred();
    apiMocks.getTaskTimeEntries.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));

    // O evento de início chega enquanto a leitura inicial ainda está pendente.
    emit('task.time_entry.started', runningEntry(), effort({ running: runningEntry() }));
    expect(result.current.running).toMatchObject({ id: 9 });

    // A leitura antiga responde sem sessão alguma — ela partiu antes do início.
    await act(async () => {
      pending.resolve(listResponse());
      await pending.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.running).toMatchObject({ id: 9 });
  });

  it('resposta atrasada do início não ressuscita a sessão que já foi encerrada', async () => {
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pending = deferred();
    apiMocks.startTaskTimer.mockReturnValueOnce(pending.promise);
    apiMocks.getTaskTimeEntries.mockResolvedValue(
      listResponse({ entries: [closedEntry()], effort: effort({ completedCount: 1 }) })
    );
    let action;
    act(() => {
      action = result.current.start();
    });

    // Início e parada chegam pelo stream antes de a resposta do POST voltar.
    emit('task.time_entry.started', runningEntry(), effort({ running: runningEntry() }));
    emit('task.time_entry.stopped', closedEntry(), effort({ completedCount: 1 }));
    expect(result.current.running).toBeNull();

    await act(async () => {
      pending.resolve({ entry: runningEntry(), effort: effort({ running: runningEntry() }) });
      await action;
    });

    // A resposta velha é descartada e o estado é relido do servidor.
    await waitFor(() => expect(result.current.running).toBeNull());
    expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(2);
  });

  it('resposta que chega depois da troca de tarefa não é aplicada nem devolvida', async () => {
    const { result, rerender } = renderHook(({ taskId }) => useTaskEffort({ taskId }), {
      initialProps: { taskId: 42 }
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const pending = deferred();
    apiMocks.startTaskTimer.mockReturnValueOnce(pending.promise);
    let action;
    act(() => {
      action = result.current.start();
    });

    rerender({ taskId: 77 });

    let resolved;
    await act(async () => {
      pending.resolve({ entry: runningEntry(), effort: effort({ running: runningEntry() }) });
      resolved = await action;
    });

    // A escrita permanece confirmada no servidor, mas não volta para quem saiu.
    expect(resolved).toBeNull();
    expect(result.current.running).toBeNull();
  });

  it('relê a tarefa depois de reconectar, sem depender de replay do stream', async () => {
    const { result, rerender } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(1));

    apiMocks.getTaskTimeEntries.mockResolvedValue(
      listResponse({
        entries: [closedEntry({ id: 31 })],
        effort: effort({ completedSeconds: HOUR, actualHours: 1, completedCount: 1 })
      })
    );
    bus.reconnectSequence = 1;
    rerender();

    await waitFor(() => expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.entries).toEqual([closedEntry({ id: 31 })]));
    expect(result.current.effort).toMatchObject({
      actualHours: 1,
      completedSeconds: HOUR,
      completedCount: 1
    });
  });

  it('leitura em voo não remove o lançamento confirmado depois que ela saiu', async () => {
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A leitura parte antes do lançamento e volta sem conhecê-lo.
    const staleRead = deferred();
    apiMocks.getTaskTimeEntries.mockReturnValueOnce(staleRead.promise);
    act(() => {
      void result.current.reload();
    });

    const created = closedEntry({ id: 31 });
    apiMocks.createTaskTimeEntry.mockResolvedValueOnce({
      entry: created,
      effort: effort({ completedCount: 1, completedSeconds: HOUR, actualHours: 1 })
    });
    await act(async () => {
      await result.current.addManual({ hours: '1' });
    });
    expect(result.current.entries).toHaveLength(1);

    await act(async () => {
      staleRead.resolve(listResponse());
      await staleRead.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([expect.objectContaining({ id: 31 })]);
  });

  it('leitura que termina primeiro não descarta o que a leitura seguinte precisa reaplicar', async () => {
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const first = deferred();
    const second = deferred();
    apiMocks.getTaskTimeEntries.mockReturnValueOnce(first.promise);
    apiMocks.getTaskTimeEntries.mockReturnValueOnce(second.promise);
    act(() => {
      void result.current.reload();
    });
    act(() => {
      void result.current.reload();
    });

    // O início chega pelo stream com as duas leituras ainda em voo.
    emit('task.time_entry.started', runningEntry(), effort({ running: runningEntry() }));
    expect(result.current.running).toMatchObject({ id: 9 });

    // A primeira responde e é descartada; ela não pode levar junto o buffer da segunda.
    await act(async () => {
      first.resolve(listResponse());
      await first.promise;
    });
    await act(async () => {
      second.resolve(listResponse());
      await second.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.running).toMatchObject({ id: 9 });
  });

  it('evento de outra tarefa não altera o estado desta', async () => {
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit('task.time_entry.started', runningEntry(), effort({ running: runningEntry() }), 77);
    expect(result.current.running).toBeNull();
  });
});

afterEach(() => vi.restoreAllMocks());

describe('useTaskEffort — server clock', () => {
  it('starts at zero with an eleven-second browser offset, including stream-first delivery', async () => {
    const startedAt = '2026-10-20T12:00:00.000Z';
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(startedAt) + 11_000);
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const entry = runningEntry({ startedAt });
    const summary = effort({ completedSeconds: HOUR, running: { ...entry, serverNow: startedAt } });
    emit('task.time_entry.started', entry, summary);
    expect(result.current.liveSeconds).toBe(0);
    expect(result.current.running).toBe(entry);
    expect(result.current.running.canDelete).toBe(true);
    expect(result.current.effort.completedSeconds).toBe(HOUR);
    monotonic.mockReturnValue(2100);
    emit('task.time_entry.started', entry, summary);
    expect(result.current.liveSeconds).toBe(2);
  });

  it('reopening a running session preserves its real duration with a skewed browser', async () => {
    const startedAt = '2026-10-20T12:00:00.000Z';
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(startedAt) - 11_000);
    vi.spyOn(performance, 'now').mockReturnValue(100);
    apiMocks.getTaskTimeEntries.mockResolvedValueOnce(
      listResponse({
        running: runningEntry({ startedAt, serverNow: '2026-10-20T12:02:00.000Z' })
      })
    );
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.liveSeconds).toBe(120);
  });
});

it('reconciles a delayed server snapshot with persisted duration when stopped', async () => {
  const startedAt = '2026-10-20T12:00:00.000Z';
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(startedAt) + 11_000);
  const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
  const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const entry = runningEntry({ startedAt, serverNow: startedAt });
  apiMocks.startTaskTimer.mockResolvedValueOnce({ entry, effort: effort({ running: entry }) });
  await act(async () => {
    await result.current.start();
  });
  expect(result.current.liveSeconds).toBe(0);
  monotonic.mockReturnValue(5100);
  const stopped = closedEntry({ startedAt, durationSeconds: 7 });
  apiMocks.stopTaskTimer.mockResolvedValueOnce({
    entry: stopped,
    effort: effort({ completedSeconds: 7, completedCount: 1 })
  });
  await act(async () => {
    await result.current.stop();
  });
  expect(result.current.running).toBeNull();
  expect(result.current.liveSeconds).toBe(0);
  expect(result.current.effort.completedSeconds).toBe(7);
  expect(result.current.entries[0].durationSeconds).toBe(7);
});
