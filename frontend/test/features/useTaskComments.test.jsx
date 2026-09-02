import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn()
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => apiMocks);

import { useTaskComments } from '../../src/features/tasks/hooks/useTaskComments.js';

function comment(id, overrides = {}) {
  return {
    id,
    taskId: 42,
    content: `Comentário ${id}`,
    editedAt: null,
    createdAt: `2026-08-29T12:00:0${id}.000Z`,
    author: { id: 10, name: 'Autora' },
    deletedAt: null,
    deletionActorType: null,
    canEdit: true,
    canDelete: true,
    ...overrides
  };
}

function response(comments, { taskId = 42, total = comments.length, page = 1 } = {}) {
  return {
    taskId,
    total,
    comments,
    permissions: { canComment: true, canModerate: false },
    pagination: { page, limit: 5, total, totalPages: Math.ceil(total / 5) }
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

describe('useTaskComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('mantém create, edit e delete confirmados quando a revalidação posterior falha', async () => {
    const { result } = await renderLoadedHook();

    apiMocks.getTaskComments.mockRejectedValueOnce(new Error('refresh create'));
    await act(async () => expect(await result.current.addComment('Comentário 3')).toBe(true));
    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);
    await waitFor(() =>
      expect(result.current.syncError).toBe(
        'Alteração concluída, mas não foi possível atualizar os comentários.'
      )
    );

    apiMocks.getTaskComments.mockRejectedValueOnce(new Error('refresh edit'));
    await act(async () =>
      expect(await result.current.editComment(2, 'Comentário editado')).toBe(true)
    );
    expect(result.current.comments.find(({ id }) => id === 2)).toMatchObject({
      content: 'Comentário editado',
      editedAt: '2026-08-29T13:00:00.000Z'
    });
    await waitFor(() => expect(result.current.syncError).not.toBe(''));

    apiMocks.getTaskComments.mockRejectedValueOnce(new Error('refresh delete'));
    await act(async () => expect(await result.current.removeComment(2)).toBe(true));
    expect(result.current.comments.find(({ id }) => id === 2)).toMatchObject({
      content: null,
      deletionActorType: 'AUTHOR',
      canEdit: false,
      canDelete: false
    });
    await waitFor(() => expect(result.current.syncError).not.toBe(''));

    expect(apiMocks.createTaskComment).toHaveBeenCalledOnce();
    expect(apiMocks.updateTaskComment).toHaveBeenCalledOnce();
    expect(apiMocks.deleteTaskComment).toHaveBeenCalledOnce();
  });

  it('preserva falhas reais das três mutations e não inicia refresh', async () => {
    const { result } = await renderLoadedHook();
    const initialReads = apiMocks.getTaskComments.mock.calls.length;

    apiMocks.createTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao criar.' } }
    });
    await act(async () => expect(await result.current.addComment('novo')).toBe(false));
    expect(result.current.error).toBe('Falha real ao criar.');

    apiMocks.updateTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao editar.' } }
    });
    await act(async () => expect(await result.current.editComment(2, 'editado')).toBe(false));
    expect(result.current.error).toBe('Falha real ao editar.');

    apiMocks.deleteTaskComment.mockRejectedValueOnce({
      response: { data: { message: 'Falha real ao excluir.' } }
    });
    await act(async () => expect(await result.current.removeComment(2)).toBe(false));
    expect(result.current.error).toBe('Falha real ao excluir.');

    expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(initialReads);
    expect(result.current.comments.find(({ id }) => id === 2)?.deletedAt).toBeNull();
  });

  it('recupera refresh somente com GET e não repete a mutation', async () => {
    const { result } = await renderLoadedHook();
    apiMocks.getTaskComments.mockRejectedValueOnce(new Error('refresh indisponível'));

    await act(async () => expect(await result.current.addComment('Comentário 3')).toBe(true));
    await waitFor(() => expect(result.current.syncError).not.toBe(''));

    apiMocks.getTaskComments.mockResolvedValueOnce(response([comment(3), comment(2), comment(1)]));
    await act(async () => expect(await result.current.retryRefresh()).toBe(true));

    expect(result.current.syncError).toBe('');
    expect(apiMocks.createTaskComment).toHaveBeenCalledOnce();
    expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(3);
  });

  it('integra páginas antigas por id sem duplicar comentários da borda', async () => {
    apiMocks.getTaskComments
      .mockResolvedValueOnce(response([comment(2), comment(1)], { total: 3 }))
      .mockResolvedValueOnce(
        response([comment(1), comment(0, { content: 'Comentário antigo' })], {
          total: 3,
          page: 2
        })
      );
    const { result } = await renderLoadedHook();

    await act(async () => expect(await result.current.loadOlder()).toBe(true));

    expect(result.current.comments.map(({ id }) => id)).toEqual([0, 1, 2]);
    expect(new Set(result.current.comments.map(({ id }) => id)).size).toBe(3);
    expect(result.current.total).toBe(3);
  });

  it('ignora loadOlder que termina depois de create e refresh mais recentes', async () => {
    const older = deferred();
    const refresh = deferred();
    apiMocks.getTaskComments
      .mockResolvedValueOnce(response([comment(2), comment(1)], { total: 3 }))
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(refresh.promise);
    const { result } = await renderLoadedHook();

    let olderPromise;
    await act(async () => {
      olderPromise = result.current.loadOlder();
      await Promise.resolve();
    });
    expect(result.current.loadingOlder).toBe(true);

    await act(async () => expect(await result.current.addComment('Comentário 3')).toBe(true));
    expect(result.current.loadingOlder).toBe(false);

    await act(async () => {
      refresh.resolve(response([comment(3), comment(2), comment(1)], { total: 3 }));
      await Promise.resolve();
    });
    await act(async () => {
      older.resolve(response([comment(0, { content: 'Obsoleto' })], { total: 99, page: 2 }));
      await olderPromise;
    });

    expect(result.current.comments.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(result.current.total).toBe(3);
    expect(result.current.loadingOlder).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('invalida a resposta pendente ao trocar de task', async () => {
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

    await act(async () => {
      taskA.resolve(response([comment(7, { content: 'Task A obsoleta' })]));
      await Promise.resolve();
    });
    expect(rendered.result.current.comments.map(({ content }) => content)).toEqual(['Task B']);
    expect(rendered.result.current.error).toBe('');
  });
});
