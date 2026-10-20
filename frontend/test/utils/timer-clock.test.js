// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  observeTimerSnapshots,
  runningTimerSeconds
} from '../../src/features/tasks/utils/timer-clock.js';
import { buildEffortChip } from '../../src/features/tasks/components/effort-summary.js';

const start = '2026-10-20T12:00:00.000Z';
const snapshot = (serverNow = start) => ({ id: 9, startedAt: start, serverNow });
afterEach(() => vi.restoreAllMocks());

describe('server-anchored running timer', () => {
  it.each([11_000, -11_000, 3_600_000])('starts at zero despite browser skew %i ms', (skew) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(start) + skew);
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const running = snapshot();
    observeTimerSnapshots(running);
    expect(runningTimerSeconds(running)).toBe(0);
    expect(buildEffortChip({ runningTimer: running }).value).toBe('00:00:00');
    monotonic.mockReturnValue(1100);
    expect(runningTimerSeconds(running)).toBe(1);
  });

  it('keeps accumulated server time on reopen/reconnect instead of resetting to zero', () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const running = snapshot('2026-10-20T12:01:30.500Z');
    observeTimerSnapshots({ columns: { EM_ANDAMENTO: [{ runningTimer: running }] } });
    monotonic.mockReturnValue(1600);
    expect(runningTimerSeconds(running)).toBe(92);
    const reconnected = snapshot('2026-10-20T12:03:00.000Z');
    expect(runningTimerSeconds(reconnected)).toBe(180);
  });

  it('does not reset on rerender or follow changes to the local wall clock', () => {
    const wall = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(start) + 11_000);
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const running = snapshot();
    observeTimerSnapshots(running);
    monotonic.mockReturnValue(5100);
    observeTimerSnapshots(running);
    wall.mockReturnValue(Date.parse(start) - 3_600_000);
    expect(runningTimerSeconds(running)).toBe(5);
    wall.mockReturnValue(Date.parse(start) + 86_400_000);
    monotonic.mockReturnValue(6100);
    expect(runningTimerSeconds(running)).toBe(6);
  });

  it('counts time between receiving a buffered snapshot and displaying it', () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const running = snapshot();
    observeTimerSnapshots({ effort: { running } });
    monotonic.mockReturnValue(10_100);
    expect(runningTimerSeconds(running)).toBe(10);
  });

  it('preserves completed effort while the resumed session starts at zero', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const chip = buildEffortChip({ runningTimer: snapshot(), actualEffort: 2, estimatedEffort: 4 });
    expect(chip.value).toBe('00:00:00');
    expect(chip.detail).toBe('50%');
    expect(chip.title).toContain('total 2h');
  });

  it('handles null/invalid values and remains compatible with older servers', () => {
    expect(runningTimerSeconds(null)).toBe(0);
    expect(runningTimerSeconds({ startedAt: 'invalid', serverNow: 'invalid' })).toBe(0);
    expect(runningTimerSeconds({ startedAt: start }, Date.parse(start) + 1500)).toBe(1);
    expect(runningTimerSeconds({ startedAt: start }, Date.parse(start) - 1500)).toBe(0);
    expect(observeTimerSnapshots(null)).toBeNull();
    expect(observeTimerSnapshots('test')).toBe('test');
  });
});
