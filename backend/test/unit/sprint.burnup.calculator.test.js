import { describe, expect, it } from 'vitest';
import { buildSprintBurnup } from '../../src/modules/sprints/sprint.burnup.calculator.js';

const at = (day, hour = 0) =>
  new Date(`2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`);
const sprint = (extra = {}) => ({
  startedAt: at(1),
  burnupCoverageStartedAt: at(1),
  endDate: at(7),
  status: 'EM_ANDAMENTO',
  ...extra
});
const event = (id, taskKey, type, day, extra = {}) => ({
  id,
  taskKey,
  type,
  occurredAt: at(day, 12),
  previousPoints: null,
  newPoints: null,
  fromStatus: null,
  toStatus: null,
  ...extra
});

describe('Sprint Burnup', () => {
  it('replays baseline, add, estimate increase/decrease, removal and completion in UTC days', () => {
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 3, toStatus: 'A_FAZER' }),
      event(2, 2, 'BASELINE_TASK', 1, { newPoints: 7, toStatus: 'A_FAZER' }),
      event(3, 3, 'TASK_ADDED', 2, { newPoints: 4, toStatus: 'A_FAZER' }),
      event(4, 1, 'STATUS_CHANGED', 2, { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO' }),
      event(5, 2, 'ESTIMATE_CHANGED', 3, { previousPoints: 7, newPoints: 9 }),
      event(6, 3, 'STATUS_CHANGED', 3, { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO' }),
      event(7, 1, 'TASK_REMOVED', 4, { previousPoints: 3, fromStatus: 'CONCLUIDO' }),
      event(8, 2, 'ESTIMATE_CHANGED', 5, { previousPoints: 9, newPoints: 6 })
    ];
    const result = buildSprintBurnup({ sprint: sprint(), events, cutoff: at(6) });
    expect(result.state).toBe('AVAILABLE');
    expect(result.points.slice(0, 5)).toEqual([
      { date: '2026-09-01', scope: 10, completed: 0 },
      { date: '2026-09-02', scope: 14, completed: 3 },
      { date: '2026-09-03', scope: 16, completed: 7 },
      { date: '2026-09-04', scope: 13, completed: 4 },
      { date: '2026-09-05', scope: 10, completed: 4 }
    ]);
  });

  it('tracks reopening, recompletion and estimate changes after completion without double counting', () => {
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 3, toStatus: 'A_FAZER' }),
      event(2, 1, 'ESTIMATE_CHANGED', 2, { previousPoints: 3, newPoints: 5 }),
      event(3, 1, 'STATUS_CHANGED', 2, { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO' }),
      event(4, 1, 'STATUS_CHANGED', 3, { fromStatus: 'CONCLUIDO', toStatus: 'EM_ANDAMENTO' }),
      event(5, 1, 'STATUS_CHANGED', 4, { fromStatus: 'EM_ANDAMENTO', toStatus: 'CONCLUIDO' }),
      event(6, 1, 'ESTIMATE_CHANGED', 5, { previousPoints: 5, newPoints: 7 })
    ];
    const points = buildSprintBurnup({ sprint: sprint(), events, cutoff: at(6) }).points;
    expect(points.map((row) => row.completed).slice(0, 5)).toEqual([0, 5, 0, 5, 7]);
    expect(points.map((row) => row.scope).slice(0, 5)).toEqual([3, 5, 5, 5, 7]);
  });

  it('keeps null distinct from zero and reports incomplete days', () => {
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: null, toStatus: 'A_FAZER' }),
      event(2, 1, 'ESTIMATE_CHANGED', 2, { previousPoints: null, newPoints: 0 }),
      event(3, 1, 'ESTIMATE_CHANGED', 3, { previousPoints: 0, newPoints: 4 }),
      event(4, 1, 'ESTIMATE_CHANGED', 4, { previousPoints: 4, newPoints: null })
    ];
    const result = buildSprintBurnup({ sprint: sprint(), events, cutoff: at(6) });
    expect(result.state).toBe('PARTIAL');
    expect(result.limitations).toContain('BURNUP_ESTIMATE_UNKNOWN');
    expect(result.points.slice(0, 4).map((row) => row.scope)).toEqual([null, 0, 4, null]);
  });

  it('starts a legacy active Sprint at its captured anchor and never backdates the missing days', () => {
    const result = buildSprintBurnup({
      sprint: sprint({ burnupCoverageStartedAt: at(3) }),
      events: [event(1, 1, 'BASELINE_TASK', 3, { newPoints: 5, toStatus: 'A_FAZER' })],
      cutoff: at(6)
    });
    expect(result.state).toBe('PARTIAL');
    expect(result.coverage).toMatchObject({ startedAt: at(3).toISOString(), complete: false });
    expect(result.points[0]).toMatchObject({ date: '2026-09-03', scope: 5 });
  });

  it('keeps old Sprint unavailable and empty covered Sprint without data', () => {
    expect(buildSprintBurnup({ sprint: sprint({ burnupCoverageStartedAt: null }) })).toMatchObject({
      state: 'UNAVAILABLE',
      points: []
    });
    expect(buildSprintBurnup({ sprint: sprint(), events: [], cutoff: at(6) })).toMatchObject({
      state: 'NO_DATA',
      points: []
    });
  });

  it('ignores post-closure events and sorts tied timestamps by persisted id', () => {
    const events = [
      event(2, 1, 'STATUS_CHANGED', 2, { fromStatus: 'A_FAZER', toStatus: 'CONCLUIDO' }),
      event(1, 1, 'BASELINE_TASK', 2, { newPoints: 5, toStatus: 'A_FAZER' }),
      event(3, 1, 'ESTIMATE_CHANGED', 4, { previousPoints: 5, newPoints: 7 })
    ];
    const closed = sprint({ status: 'CONCLUIDA', closedAt: at(3) });
    const before = buildSprintBurnup({ sprint: closed, events, cutoff: at(6) });
    const after = buildSprintBurnup({
      sprint: closed,
      events: [...events].reverse(),
      cutoff: at(6)
    });
    expect(before).toEqual(after);
    expect(before.points[1]).toMatchObject({ scope: 5, completed: 5 });
    expect(before.points[2]).toMatchObject({ scope: 5, completed: 5 });
  });

  it('does not publish a curve when the event chain contradicts its previous value', () => {
    const result = buildSprintBurnup({
      sprint: sprint(),
      events: [
        event(1, 1, 'BASELINE_TASK', 1, { newPoints: 3, toStatus: 'A_FAZER' }),
        event(2, 1, 'ESTIMATE_CHANGED', 2, { previousPoints: 4, newPoints: 5 })
      ],
      cutoff: at(6)
    });
    expect(result).toMatchObject({
      state: 'UNAVAILABLE',
      points: [],
      limitations: ['BURNUP_EVENT_SEQUENCE_INCONSISTENT']
    });
  });
});
