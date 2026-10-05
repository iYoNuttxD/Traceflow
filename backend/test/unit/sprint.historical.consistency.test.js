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
  it.each([null, 0])('keeps unknown and explicit zero estimates distinct (%s)', (estimate) => {
    const result = comparable(sprint(), [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 4, toStatus: 'A_FAZER' }),
      event(2, 2, 'BASELINE_TASK', 1, { newPoints: estimate, toStatus: 'A_FAZER' })
    ]);
    if (estimate === null) {
      expect(result.burndown).toMatchObject({
        hasData: false,
        totalPoints: null,
        chartMax: 0,
        historicalState: 'PARTIAL'
      });
      expect(result.burndown.days[0]).toMatchObject({ ideal: null, remaining: null });
      expect(result.burnup.limitations).toContain('BURNUP_ESTIMATE_UNKNOWN');
    } else {
      expect(result.burndown).toMatchObject({ hasData: true, totalPoints: 4, chartMax: 4 });
    }
  });

  it.each([
    [20, 'TASK_ADDED', 40],
    [40, 'TASK_REMOVED', 20]
  ])('preserves the %ih initial reference through %s', (initial, type, current) => {
    const events = [event(1, 1, 'BASELINE_TASK', 1, { newPoints: 20, toStatus: 'A_FAZER' })];
    if (initial === 40)
      events.push(event(2, 2, 'BASELINE_TASK', 1, { newPoints: 20, toStatus: 'A_FAZER' }));
    events.push(event(3, 2, type, 5, { newPoints: 20, previousPoints: 20, toStatus: 'A_FAZER' }));
    const { burndown } = comparable(sprint(), events);
    expect(burndown.totalPoints).toBe(initial);
    expect(burndown.days[0].ideal).toBe(initial);
    expect(burndown.days[4].remaining).toBe(current);
    expect(burndown.chartMax).toBe(40);
    expect(burndown.days.at(-1).ideal).toBe(0);
  });

  it('does not rewrite unknown days after an estimate is entered or removed', () => {
    const { projection, burndown } = comparable(sprint(), [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: null, toStatus: 'A_FAZER' }),
      event(2, 1, 'ESTIMATE_CHANGED', 3, { previousPoints: null, newPoints: 4 }),
      event(3, 1, 'ESTIMATE_CHANGED', 5, { previousPoints: 4, newPoints: 6 }),
      event(4, 1, 'ESTIMATE_CHANGED', 7, { previousPoints: 6, newPoints: null })
    ]);
    expect(projection.points.map((point) => point.scope)).toEqual([
      null,
      null,
      4,
      4,
      6,
      6,
      null,
      null,
      null,
      null,
      null
    ]);
    expect(burndown.days.every((point) => point.ideal === null)).toBe(true);
    expect(burndown.chartMax).toBe(6);
  });

  it('does not restart the nominal ideal clock at a late actual start or at a 180-day truncation', () => {
    const { burndown } = comparable(
      sprint({ startDate: at(1, 0), startedAt: at(3, 0), burnupCoverageStartedAt: at(3, 0) }),
      [event(1, 1, 'BASELINE_TASK', 3, { newPoints: 20, toStatus: 'A_FAZER' })]
    );
    expect(burndown.days[0].ideal).toBe(16);
    const long = sprint({ startDate: at(1, 0), endDate: new Date('2027-09-01') });
    const result = comparable(long, [
      event(1, 1, 'BASELINE_TASK', 1, { newPoints: 20, toStatus: 'A_FAZER' })
    ]);
    expect(result.burndown.days.at(-1).ideal).toBeGreaterThan(0);
  });
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
    // Reverse equal-time records too: id 8 must be applied after id 7.
    const { projection } = comparable(sprint(), [...events].reverse());
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
        occurredAt: at(4, 15)
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
