import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectHealthSummary } from '../../src/features/indicators/components/ProjectHealthSummary.jsx';
const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock('../../src/features/indicators/api/indicators.api.js', () => ({ indicatorsApi: mocks }));
const health = (score) => ({ data: { projectHealth: { score, status: 'HEALTHY' } } });

describe('overview Health reconciliation', () => {
  it('requests fresh data after confirmed sync and ignores the older response', async () => {
    let resolveOld;
    mocks.dashboard.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    mocks.dashboard.mockResolvedValueOnce(health(82));
    const { rerender } = render(<ProjectHealthSummary projectId={2} refreshVersion={0} />);
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(1));
    const oldSignal = mocks.dashboard.mock.calls[0][2].signal;
    rerender(<ProjectHealthSummary projectId={2} refreshVersion={1} />);
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('value', '82'));
    expect(oldSignal.aborted).toBe(true);
    expect(mocks.dashboard).toHaveBeenLastCalledWith(
      2,
      { view: 'GENERAL', healthOnly: true },
      expect.objectContaining({ fresh: true })
    );
    await act(async () => resolveOld(health(12)));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '82');
  });
});
