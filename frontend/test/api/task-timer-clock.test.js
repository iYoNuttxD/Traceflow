// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: http }));
import { tasksApi, kanbanApi } from '../../src/features/tasks/api/tasks.api.js';
import { runningTimerSeconds } from '../../src/features/tasks/utils/timer-clock.js';

const start = '2026-10-20T12:00:00.000Z';
const timer = () => ({ id: 9, startedAt: start, serverNow: start });
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('task timer transport anchors', () => {
  it.each([
    ['get', () => tasksApi.get(42)],
    ['get', () => tasksApi.list(7)],
    ['post', () => tasksApi.create(7, {})],
    ['put', () => tasksApi.update(42, {})],
    ['get', () => kanbanApi.getBoard(7)],
    ['patch', () => kanbanApi.moveTask(42, {})]
  ])('anchors the raw %s response before a deferred render', async (method, request) => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
    const running = timer();
    const response = { data: { columns: { EM_ANDAMENTO: [{ runningTimer: running }] } } };
    http[method].mockResolvedValueOnce(response);
    expect(await request()).toBe(response);
    monotonic.mockReturnValue(3100);
    expect(runningTimerSeconds(running)).toBe(3);
    expect(running).toEqual(timer());
  });

  it.each([
    ['get', () => tasksApi.timeEntries(42)],
    ['post', () => tasksApi.startTimer(42)]
  ])(
    'anchors data-only %s responses once, without counting the same snapshot twice',
    async (method, request) => {
      const monotonic = vi.spyOn(performance, 'now').mockReturnValue(100);
      const running = timer();
      const data = { entry: running, running, effort: { running } };
      http[method].mockResolvedValue({ data });
      expect(await request()).toBe(data);
      monotonic.mockReturnValue(5100);
      expect(await request()).toBe(data);
      expect(runningTimerSeconds(running)).toBe(5);
    }
  );
});
