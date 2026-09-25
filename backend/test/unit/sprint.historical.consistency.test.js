import { describe, expect, it } from 'vitest';
import { buildSprintBurndown } from '../../src/modules/sprints/sprint.burndown.calculator.js';
import { buildSprintBurnup } from '../../src/modules/sprints/sprint.burnup.calculator.js';
import { buildSprintHistoricalProjection } from '../../src/modules/sprints/sprint.historical.projection.js';

const at = (day, hour = 12) => new Date(Date.UTC(2026, 8, day, hour));
const sprint = (extra = {}) => ({
  startedAt: at(1, 0),
  burnupCoverageStartedAt: at(1, 0),
  endDate: at(12, 0),
  status: 'EM_ANDAMENTO',
  ...extra
});
const event = (id, taskKey, type, day, extra = {}) => ({
  id,
  taskKey,
  type,
  occurredAt: at(day),
  previousPoints: null,
  newPoints: null,
  fromStatus: null,
  toStatus: null,
  ...extra
});

function comparable(sprintValue, events, cutoff = at(11)) {
  const projection = buildSprintHistoricalProjection({ sprint: sprintValue, events, cutoff });
  const burndown = buildSprintBurndown({ sprint: sprintValue, projection, cutoff });
  const burnup = buildSprintBurnup({ sprint: sprintValue, projection, cutoff });
  expect(burndown.days).toHaveLength(burnup.points.length);
  for (let index = 0; index < projection.points.length; index += 1) {
    const point = projection.points[index];
    expect(burndown.days[index].date).toBe(point.date);
    expect(burnup.points[index].date).toBe(point.date);
    expect(burndown.days[index].remaining).toBe(point.remaining);
    if (point.scope === null) continue;
    expect(point.scope).toBeGreaterThanOrEqual(0);
    expect(point.completed).toBeGreaterThanOrEqual(0);
    expect(point.remaining).toBeGreaterThanOrEqual(0);
    expect(point.completed).toBeLessThanOrEqual(point.scope);
    expect(point.scope - point.completed).toBeCloseTo(point.remaining, 9);
  }
  return { projection, burndown, burnup };
}

describe('Sprint historical projection shared by I45 and I46', () => {
  it('tracks completion, reopen, estimate after reopen and recompletion', () => {
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 4, toStatus: 'EM_ANDAMENTO' }),
      event(2, 2, 'BASELINE_TASK', 1, { newPoints: 6, toStatus: 'EM_ANDAMENTO' }),
      event(3, 1, 'STATUS_CHANGED', 2, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO'
      }),
      event(4, 1, 'STATUS_CHANGED', 3, {
        fromStatus: 'CONCLUIDO',
        toStatus: 'EM_ANDAMENTO'
      }),
      event(5, 1, 'ESTIMATE_CHANGED', 4, { previousPoints: 4, newPoints: 5 }),
      event(6, 1, 'STATUS_CHANGED', 5, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO'
      }),
      event(7, 1, 'ESTIMATE_CHANGED', 6, { previousPoints: 5, newPoints: 7 })
    ];
    const { projection } = comparable(sprint(), events);
    expect(projection.state).toBe('AVAILABLE');
    expect(
      projection.points
        .slice(0, 6)
        .map(({ scope, completed, remaining }) => [scope, completed, remaining])
    ).toEqual([
      [10, 0, 10],
      [10, 4, 6],
      [10, 0, 10],
      [11, 0, 11],
      [11, 5, 6],
      [13, 7, 6]
    ]);
  });

  it('handles add, remove, fractional estimates and completed Task removal', () => {
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 0.5, toStatus: 'A_FAZER' }),
      event(2, 1, 'ESTIMATE_CHANGED', 2, { previousPoints: 0.5, newPoints: 1.5 }),
      event(3, 2, 'TASK_ADDED', 3, { newPoints: 2.5, toStatus: 'CONCLUIDO' }),
      event(4, 2, 'TASK_REMOVED', 4, { previousPoints: 2.5 }),
      event(5, 1, 'ESTIMATE_CHANGED', 5, { previousPoints: 1.5, newPoints: 0.5 }),
      event(6, 1, 'TASK_REMOVED', 6, { previousPoints: 0.5 })
    ];
    const { projection } = comparable(sprint(), events);
    expect(
      projection.points
        .slice(0, 6)
        .map(({ scope, completed, remaining }) => [scope, completed, remaining])
    ).toEqual([
      [0.5, 0, 0.5],
      [1.5, 0, 1.5],
      [4, 2.5, 1.5],
      [1.5, 0, 1.5],
      [0.5, 0, 0.5],
      [0, 0, 0]
    ]);
  });

  it('uses end-of-day status and deterministic timestamp/id order', () => {
    const events = [
      event(6, 1, 'STATUS_CHANGED', 4, {
        fromStatus: 'CONCLUIDO',
        toStatus: 'EM_ANDAMENTO',
        occurredAt: at(4, 14)
      }),
      event(2, 1, 'ESTIMATE_CHANGED', 2, { previousPoints: 3, newPoints: 5 }),
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 3, toStatus: 'EM_ANDAMENTO' }),
      event(3, 1, 'STATUS_CHANGED', 2, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO',
        occurredAt: at(2, 13)
      }),
      event(4, 1, 'STATUS_CHANGED', 3, {
        fromStatus: 'CONCLUIDO',
        toStatus: 'EM_ANDAMENTO',
        occurredAt: at(3, 13)
      }),
      event(5, 1, 'STATUS_CHANGED', 3, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO',
        occurredAt: at(3, 14)
      }),
      event(7, 1, 'STATUS_CHANGED', 4, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO',
        occurredAt: at(4, 15)
      }),
      event(8, 1, 'STATUS_CHANGED', 4, {
        fromStatus: 'CONCLUIDO',
        toStatus: 'EM_ANDAMENTO',
        occurredAt: at(4, 16)
      })
    ];
    const { projection } = comparable(sprint(), events);
    expect(projection.points[1]).toMatchObject({ scope: 5, completed: 5, remaining: 0 });
    expect(projection.points[2]).toMatchObject({ scope: 5, completed: 5, remaining: 0 });
    expect(projection.points[3]).toMatchObject({ scope: 5, completed: 0, remaining: 5 });
  });

  it('starts partial coverage at its anchor and leaves legacy without invented history', () => {
    const partial = sprint({ burnupCoverageStartedAt: at(3, 0) });
    const { projection, burndown, burnup } = comparable(partial, [
      event(1, 1, 'BASELINE_TASK', 3, { newPoints: 5, toStatus: 'A_FAZER' })
    ]);
    expect(projection.state).toBe('PARTIAL');
    expect(burndown.days[0].date).toBe('2026-09-03');
    expect(burnup.limitations).toContain('BURNUP_COVERAGE_STARTED_MID_SPRINT');
    expect(buildSprintBurnup({ sprint: sprint({ burnupCoverageStartedAt: null }) })).toMatchObject({
      state: 'UNAVAILABLE',
      points: []
    });
  });

  it('freezes both series at closure and rejects inconsistent event chains', () => {
    const closed = sprint({ status: 'CONCLUIDA', closedAt: at(3, 15) });
    const events = [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 4, toStatus: 'EM_ANDAMENTO' }),
      event(2, 1, 'STATUS_CHANGED', 2, {
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO'
      })
    ];
    const before = comparable(closed, events);
    const after = comparable(closed, [
      ...events,
      event(3, 1, 'ESTIMATE_CHANGED', 4, { previousPoints: 4, newPoints: 9 })
    ]);
    expect(after).toEqual(before);
    const invalid = buildSprintHistoricalProjection({
      sprint: sprint(),
      events: [event(1, 1, 'BASELINE_TASK', 1, { newPoints: -2, toStatus: 'A_FAZER' })]
    });
    expect(invalid).toMatchObject({
      state: 'UNAVAILABLE',
      points: [],
      limitations: ['BURNUP_EVENT_SEQUENCE_INCONSISTENT']
    });
  });
});
