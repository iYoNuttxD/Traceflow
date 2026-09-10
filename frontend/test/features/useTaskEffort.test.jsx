import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    const { rerender } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(1));

    bus.reconnectSequence = 1;
    rerender();

    await waitFor(() => expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(2));
  });

  it('evento de outra tarefa não altera o estado desta', async () => {
    const { result } = renderHook(() => useTaskEffort({ taskId: 42 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit('task.time_entry.started', runningEntry(), effort({ running: runningEntry() }), 77);
    expect(result.current.running).toBeNull();
  });
});
