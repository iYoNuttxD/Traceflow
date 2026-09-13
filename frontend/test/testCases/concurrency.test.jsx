import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestCases } from '../../src/features/testCases/hooks/useTestCases.js';
import { useCaseRead } from '../../src/features/testCases/hooks/useCaseRead.js';
import { deferred, listing, memberData, testCase, execution } from './fixtures.js';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  history: vi.fn(),
  executions: vi.fn(),
  execution: vi.fn(),
  members: vi.fn()
}));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({ testCasesApi: mocks }));
vi.mock('../../src/features/members/members.api.js', () => ({
  membersApi: { list: mocks.members }
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.members.mockResolvedValue(memberData);
  mocks.list.mockResolvedValue(listing);
});

describe('S1-07 current-context authority', () => {
  it('rejects old project results even when transport ignores AbortSignal', async () => {
    const old = deferred();
    mocks.list
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ...listing, items: [{ ...testCase, id: 30, projectId: 2 }] });
    const { result, rerender } = renderHook(({ id }) => useTestCases(id), {
      initialProps: { id: 1 }
    });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.catalog.items[0]?.id).toBe(30));
    await act(async () => old.resolve(listing));
    expect(result.current.catalog.items[0].id).toBe(30);
  });
  it('filter change rejects old load-more and starts from page one', async () => {
    const old = deferred();
    const { result } = renderHook(() => useTestCases(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.list
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ...listing, items: [{ ...testCase, id: 40, status: 'INATIVO' }] });
    act(() => {
      void result.current.load(2);
    });
    act(() => result.current.changeFilter('status', 'INATIVO'));
    await waitFor(() => expect(result.current.catalog.items[0]?.id).toBe(40));
    await act(async () => old.resolve({ ...listing, items: [{ ...testCase, id: 20 }], page: 2 }));
    expect(result.current.catalog.items.map((x) => x.id)).toEqual([40]);
    expect(mocks.list).toHaveBeenLastCalledWith(
      1,
      expect.objectContaining({ page: 1, status: 'INATIVO' }),
      expect.anything()
    );
  });
  it('search invalidates immediately during debounce and only latest query commits', async () => {
    vi.useFakeTimers();
    try {
      const old = deferred();
      mocks.list.mockReturnValueOnce(old.promise).mockResolvedValue({ ...listing, items: [] });
      const { result } = renderHook(() => useTestCases(1));
      act(() => result.current.changeFilter('search', 'old'));
      await act(async () => old.resolve(listing));
      expect(result.current.catalog.items).toEqual([]);
      act(() => result.current.changeFilter('search', 'new'));
      await act(async () => vi.advanceTimersByTimeAsync(300));
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(mocks.list).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ search: 'new' }),
        expect.anything()
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['create', 'edit', 'execute', 'delete'])(
    'confirmed %s invalidates older list reads and keeps its receipt after refresh failure',
    async (kind) => {
      const old = deferred();
      const { result } = renderHook(() => useTestCases(1));
      await waitFor(() => expect(result.current.loading).toBe(false));
      mocks.list.mockReturnValueOnce(old.promise).mockRejectedValueOnce(new Error('refresh'));
      act(() => {
        void result.current.load(2);
      });
      act(() =>
        result.current.confirmed(
          kind,
          kind === 'execute' ? execution : { ...testCase, title: 'Saved' },
          15
        )
      );
      await waitFor(() => expect(result.current.warning).toMatch(/Não foi possível atualizar/));
      await act(async () => old.resolve({ ...listing, items: [{ ...testCase, title: 'Stale' }] }));
      if (kind === 'delete') expect(result.current.catalog.items).toEqual([]);
      else if (kind === 'execute')
        expect(result.current.catalog.items[0].latestExecution.id).toBe(execution.id);
      else expect(result.current.catalog.items[0].title).toBe('Saved');
    }
  );
  it('appends pages with stable ID deduplication', async () => {
    const { result } = renderHook(() => useTestCases(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    mocks.list.mockResolvedValueOnce({
      ...listing,
      page: 2,
      items: [testCase, { ...testCase, id: 20 }]
    });
    await act(async () => result.current.load(2));
    expect(result.current.catalog.items.map((x) => x.id)).toEqual([15, 20]);
  });
  it.each(['detail', 'execution', 'history', 'executions'])(
    'rejects out-of-order %s across case/execution identities',
    async (kind) => {
      const old = deferred();
      const value =
        kind === 'detail' || kind === 'execution'
          ? { id: 2 }
          : { items: [{ id: 2 }], nextCursor: null };
      mocks[kind].mockReturnValueOnce(old.promise).mockResolvedValueOnce(value);
      const { result, rerender } = renderHook(({ id }) => useCaseRead(kind, id), {
        initialProps: { id: 1 }
      });
      rerender({ id: 2 });
      await waitFor(() => expect(result.current.data).toEqual(value));
      await act(async () => old.resolve({ id: 1, items: [{ id: 1 }] }));
      expect(result.current.data).toEqual(value);
    }
  );
  it('cursor stream appends without duplicate history and resets on case switch', async () => {
    mocks.history
      .mockResolvedValueOnce({ items: [{ id: 1 }], nextCursor: 'a' })
      .mockResolvedValueOnce({ items: [{ id: 1 }, { id: 2 }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ id: 3 }], nextCursor: null });
    const { result, rerender } = renderHook(({ id }) => useCaseRead('history', id), {
      initialProps: { id: 1 }
    });
    await waitFor(() => expect(result.current.data?.nextCursor).toBe('a'));
    await act(async () => result.current.load('a'));
    expect(result.current.data.items).toEqual([{ id: 1 }, { id: 2 }]);
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.data?.items).toEqual([{ id: 3 }]));
  });
});
