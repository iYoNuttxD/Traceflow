import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisibilityAwarePolling } from '../../src/shared/index.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function PollingHarness({ callback, enabled = true }) {
  useVisibilityAwarePolling({ enabled, intervalMs: 5000, callback });
  return null;
}

describe('useVisibilityAwarePolling', () => {
  let visibility = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('revalida somente visível, atualiza imediatamente no retorno e limpa no unmount', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<PollingHarness callback={callback} />);

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(callback).toHaveBeenCalledTimes(1);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(callback).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(callback).toHaveBeenCalledTimes(2);

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(callback).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('não inicia outro ciclo enquanto a callback anterior está em voo', async () => {
    const pending = deferred();
    const callback = vi.fn(() => pending.promise);
    render(<PollingHarness callback={callback} />);

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(callback).toHaveBeenCalledOnce();

    await act(async () => pending.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
