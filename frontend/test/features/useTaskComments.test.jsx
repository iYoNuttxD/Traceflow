import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn()
}));
const eventMocks = vi.hoisted(() => ({
  connectionState: 'connected',
  reconnectSequence: 0,
  listener: null,
  subscribe: vi.fn((_types, listener) => {
    eventMocks.listener = listener;
    return () => {
      if (eventMocks.listener === listener) eventMocks.listener = null;
    };
  })
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => apiMocks);
vi.mock('../../src/features/projects/index.js', () => ({
  useProjectEvents: () => ({
    connectionState: eventMocks.connectionState,
    reconnectSequence: eventMocks.reconnectSequence,
    subscribe: eventMocks.subscribe
  })
}));

import { useTaskComments } from '../../src/features/tasks/hooks/useTaskComments.js';

function comment(id, overrides = {}) {
  return {
    id,
    taskId: 42,
    content: `Comentário ${id}`,
    editedAt: null,
    createdAt: `2026-08-29T12:${String(id).padStart(2, '0')}:00.000Z`,
    author: { id: 10, name: 'Autora' },
    deletedAt: null,
    deletionActorType: null,
    canEdit: true,
    canDelete: true,
    ...overrides
  };
}

function response(comments, { taskId = 42, hasMore = false, nextCursor = null } = {}) {
  return {
    taskId,
    comments,
    permissions: { canComment: true, canModerate: false },
    pagination: { limit: 30, hasMore, nextCursor }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function renderLoadedHook() {
  const rendered = renderHook(({ taskId }) => useTaskComments({ taskId }), {
    initialProps: { taskId: 42 }
  });
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

function emit(type, incoming, taskId = incoming.taskId) {
  act(() => {
    eventMocks.listener?.({ type, projectId: 7, taskId, data: { comment: incoming } });
  });
}

describe('useTaskComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.connectionState = 'connected';
    eventMocks.reconnectSequence = 0;
    eventMocks.listener = null;
    apiMocks.getTaskComments.mockResolvedValue(response([comment(2), comment(1)]));
    apiMocks.createTaskComment.mockResolvedValue({ comment: comment(3) });
    apiMocks.updateTaskComment.mockResolvedValue({
      comment: comment(2, {
        content: 'Comentário editado',
        editedAt: '2026-08-29T13:00:00.000Z'
      })
    });
    apiMocks.deleteTaskComment.mockResolvedValue({
      comment: comment(2, {
        content: null,
        deletedAt: '2026-08-29T14:00:00.000Z',
        deletionActorType: 'AUTHOR',
        canEdit: false,
        canDelete: false
      })
    });
  });

  afterEach(() => vi.useRealTimers());

  it('aplica create, edit e delete locais sem GET posterior e preserva falhas reais', async () => {
    const { result } = await renderLoadedHook();

    await act(async () => expect(await result.current.addComment('Comentário 3')).toBe(true));
    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);

    await act(async () =>
      expect(await result.current.editComment(2, 'Comentário editado')).toBe(true)
    );
    expect(result.current.comments.find(({ id }) => id === 2)).toMatchObject({
      content: 'Comentário editado',
      editedAt: '2026-08-29T13:00:00.000Z'
    });

    await act(async () => expect(await result.current.removeComment(2)).toBe(true));
    expect(result.current.comments.find(({ id }) => id === 2)).toMatchObject({
      content: null,
      deletionActorType: 'AUTHOR',
      canEdit: false,
      canDelete: false
    });
    expect(apiMocks.getTaskComments).toHaveBeenCalledOnce();

    apiMocks.createTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao criar.' } }
    });
    await act(async () => expect(await result.current.addComment('falha')).toBe(false));
    expect(result.current.error).toBe('Falha real ao criar.');

    apiMocks.updateTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao editar.' } }
    });
    await act(async () => expect(await result.current.editComment(1, 'falha')).toBe(false));
    expect(result.current.error).toBe('Falha real ao editar.');

    apiMocks.deleteTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao excluir.' } }
    });
    await act(async () => expect(await result.current.removeComment(1)).toBe(false));
    expect(result.current.error).toBe('Falha real ao excluir.');
    expect(apiMocks.getTaskComments).toHaveBeenCalledOnce();
  });

  it('carrega histórico por cursor, deduplica a borda e encerra em hasMore false', async () => {
    apiMocks.getTaskComments
      .mockResolvedValueOnce(
        response([comment(3), comment(2)], { hasMore: true, nextCursor: 'cursor-2' })
      )
      .mockResolvedValueOnce(response([comment(2), comment(1)]));
    const { result } = await renderLoadedHook();

    await act(async () => expect(await result.current.loadOlder()).toBe(true));

    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(new Set(result.current.comments.map(({ id }) => id)).size).toBe(3);
    expect(result.current.hasOlder).toBe(false);
    expect(apiMocks.getTaskComments).toHaveBeenLastCalledWith(
      42,
      { limit: 30, before: 'cursor-2' },
      { signal: expect.any(AbortSignal) }
    );
    await act(async () => expect(await result.current.loadOlder()).toBe(false));
    expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(2);
  });

  it('ignora histórico pendente após mutation mais recente', async () => {
    const older = deferred();
    apiMocks.getTaskComments
      .mockResolvedValueOnce(
        response([comment(2), comment(1)], { hasMore: true, nextCursor: 'cursor-1' })
      )
      .mockReturnValueOnce(older.promise);
    const { result } = await renderLoadedHook();

    let olderPromise;
    await act(async () => {
      olderPromise = result.current.loadOlder();
      await Promise.resolve();
    });
    expect(result.current.loadingOlder).toBe(true);

    await act(async () => expect(await result.current.addComment('Comentário 3')).toBe(true));
    await act(async () => {
      older.resolve(response([comment(0, { content: 'Obsoleto' })]));
      await olderPromise;
    });

    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(result.current.loadingOlder).toBe(false);
    expect(result.current.error).toBe('');
    expect(apiMocks.createTaskComment).toHaveBeenCalledOnce();
  });

  it('mescla create/edit/delete SSE por id, ignora echo e não ressuscita tombstone', async () => {
    const { result } = await renderLoadedHook();
    const remote = comment(4, { author: { id: 20, name: 'Colega' } });

    emit('task.comment.created', remote);
    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 4]);
    emit('task.comment.created', remote);
    expect(result.current.comments.filter(({ id }) => id === 4)).toHaveLength(1);

    emit(
      'task.comment.updated',
      comment(4, {
        content: 'Atualizado remotamente',
        editedAt: '2026-08-29T13:30:00.000Z',
        author: { id: 20, name: 'Colega' }
      })
    );
    expect(result.current.comments.find(({ id }) => id === 4)?.content).toBe(
      'Atualizado remotamente'
    );

    emit(
      'task.comment.deleted',
      comment(4, {
        content: null,
        deletedAt: '2026-08-29T14:30:00.000Z',
        deletionActorType: 'MODERATION',
        canEdit: false,
        canDelete: false
      })
    );
    emit(
      'task.comment.updated',
      comment(4, {
        content: 'Evento atrasado',
        editedAt: '2026-08-29T13:45:00.000Z'
      })
    );
    expect(result.current.comments.find(({ id }) => id === 4)).toMatchObject({
      content: null,
      deletionActorType: 'MODERATION'
    });
    expect(apiMocks.getTaskComments).toHaveBeenCalledOnce();
  });

  it('reconcilia uma vez após reabrir o stream e recovery repete somente GET', async () => {
    const rendered = await renderLoadedHook();
    apiMocks.getTaskComments.mockRejectedValueOnce(new Error('reconnect indisponível'));
    eventMocks.reconnectSequence = 1;
    rendered.rerender({ taskId: 42 });

    await waitFor(() => expect(rendered.result.current.syncError).not.toBe(''));
    expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(2);

    apiMocks.getTaskComments.mockResolvedValueOnce(response([comment(3), comment(2), comment(1)]));
    await act(async () => expect(await rendered.result.current.retryRefresh()).toBe(true));

    expect(rendered.result.current.syncError).toBe('');
    expect(rendered.result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(3);
    expect(apiMocks.createTaskComment).not.toHaveBeenCalled();
  });

  it('encerra loading quando a reconciliação substitui a carga inicial pendente', async () => {
    const initial = deferred();
    apiMocks.getTaskComments
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(response([comment(3)]));
    const rendered = renderHook(({ taskId }) => useTaskComments({ taskId }), {
      initialProps: { taskId: 42 }
    });
    expect(rendered.result.current.loading).toBe(true);

    eventMocks.reconnectSequence = 1;
    rendered.rerender({ taskId: 42 });
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    expect(rendered.result.current.comments.map(({ id }) => id)).toEqual([3]);

    await act(async () => {
      initial.resolve(response([comment(1)]));
      await Promise.resolve();
    });
    expect(rendered.result.current.comments.map(({ id }) => id)).toEqual([3]);
  });

  it('invalida REST e eventos da task anterior ao trocar de task', async () => {
    const taskA = deferred();
    apiMocks.getTaskComments
      .mockReturnValueOnce(taskA.promise)
      .mockResolvedValueOnce(
        response([comment(8, { taskId: 43, content: 'Task B' })], { taskId: 43 })
      );
    const rendered = renderHook(({ taskId }) => useTaskComments({ taskId }), {
      initialProps: { taskId: 42 }
    });

    rendered.rerender({ taskId: 43 });
    await waitFor(() => expect(rendered.result.current.comments[0]?.content).toBe('Task B'));
    emit('task.comment.created', comment(9, { content: 'Evento Task A' }), 42);

    await act(async () => {
      taskA.resolve(response([comment(7, { content: 'Task A obsoleta' })]));
      await Promise.resolve();
    });
    expect(rendered.result.current.comments.map(({ content }) => content)).toEqual(['Task B']);
    expect(rendered.result.current.error).toBe('');
  });

  it('não dispara GET temporal após 60 segundos, focus ou visibilitychange', async () => {
    await renderLoadedHook();
    vi.useFakeTimers();

    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(apiMocks.getTaskComments).toHaveBeenCalledOnce();
  });
});
