import { describe, expect, it } from 'vitest';
import {
  calculateFlowTaskHistory,
  taskStatusDistribution
} from '../../src/modules/indicators/calculators/flow-task.calculator.js';
import { calculateTaskCurrent } from '../../src/modules/indicators/calculators/task-current.calculator.js';

const day = (number) => new Date(`2026-09-${String(number).padStart(2, '0')}T00:00:00Z`);
const period = {
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  startInclusive: day(1),
  endExclusive: new Date('2026-10-01T00:00:00Z')
};
const asOf = new Date('2026-10-02T00:00:00Z');
const dateKey = (date) => date.toISOString().slice(0, 10);
const task = (id, createdAt, status) => ({
  id,
  title: `Task ${id}`,
  createdAt,
  status,
  deadline: null,
  responsibleUser: null
});
const move = (taskId, date, fromStatus, toStatus, id) => ({
  id,
  taskId,
  movedAt: day(date),
  fromStatus,
  toStatus
});

describe('Flow + Task calculators', () => {
  it('uses first completion for lead/cycle, final eligible completion for throughput and last entry for aging', () => {
    const tasks = [
      task(1, day(1), 'CONCLUIDO'),
      task(2, day(2), 'EM_ANDAMENTO'),
      task(3, day(2), 'EM_ANDAMENTO'),
      task(4, day(2), 'CONCLUIDO')
    ];
    const movements = [
      move(1, 2, 'A_FAZER', 'EM_ANDAMENTO', 1),
      move(1, 3, 'EM_ANDAMENTO', 'CONCLUIDO', 2),
      move(1, 5, 'CONCLUIDO', 'EM_ANDAMENTO', 3),
      move(1, 6, 'EM_ANDAMENTO', 'CONCLUIDO', 4),
      move(2, 3, 'A_FAZER', 'EM_ANDAMENTO', 5),
      move(3, 3, 'A_FAZER', 'EM_ANDAMENTO', 6),
      move(3, 4, 'EM_ANDAMENTO', 'A_FAZER', 7),
      move(3, 8, 'A_FAZER', 'EM_ANDAMENTO', 8)
    ];
    const flow = calculateFlowTaskHistory({ tasks, movements, period, asOf, dateKey });
    expect(flow.lead).toEqual({ value: 2, eligibleCount: 1, excludedCount: 1 });
    expect(flow.cycle).toEqual({ value: 1, eligibleCount: 1, excludedCount: 1 });
    expect(flow.throughput).toMatchObject({ value: 1, excludedCount: 1 });
    expect(flow.throughput.points.find((point) => point.date === '2026-09-06').value).toBe(1);
    expect(flow.aging).toMatchObject({ value: 2, excludedCount: 0 });
    expect(flow.aging.items.map(({ taskId }) => taskId)).toEqual([2, 3]);
    expect(flow.aging.items[1].enteredInProgressAt).toBe(day(8).toISOString());
    expect(flow.cumulative).toMatchObject({ eligibleCount: 3, excludedCount: 1 });
    expect(flow.cumulative.points.slice(0, 3)).toEqual([
      { date: '2026-09-01', todo: 1, inProgress: 0, done: 0 },
      { date: '2026-09-02', todo: 2, inProgress: 1, done: 0 },
      { date: '2026-09-03', todo: 0, inProgress: 2, done: 1 }
    ]);
  });

  it('preserves first start across reentry, median and excludes missing start', () => {
    const tasks = [
      task(1, day(1), 'CONCLUIDO'),
      task(2, day(1), 'CONCLUIDO'),
      task(3, day(1), 'CONCLUIDO')
    ];
    const movements = [
      move(1, 1, 'A_FAZER', 'EM_ANDAMENTO', 1),
      move(1, 2, 'EM_ANDAMENTO', 'A_FAZER', 2),
      move(1, 5, 'A_FAZER', 'EM_ANDAMENTO', 3),
      move(1, 8, 'EM_ANDAMENTO', 'CONCLUIDO', 4),
      move(2, 2, 'A_FAZER', 'CONCLUIDO', 5),
      move(3, 2, 'A_FAZER', 'EM_ANDAMENTO', 6),
      move(3, 4, 'EM_ANDAMENTO', 'CONCLUIDO', 7)
    ];
    const flow = calculateFlowTaskHistory({ tasks, movements, period, asOf, dateKey });
    expect(flow.lead).toEqual({ value: 3, eligibleCount: 3, excludedCount: 0 });
    expect(flow.cycle).toEqual({ value: 4.5, eligibleCount: 2, excludedCount: 1 });
    expect(flow.throughput.value).toBe(3);
  });

  it('does not invent the first completion when the observed chain starts already done', () => {
    const tasks = [task(1, day(1), 'CONCLUIDO')];
    const movements = [
      move(1, 2, 'CONCLUIDO', 'EM_ANDAMENTO', 1),
      move(1, 3, 'EM_ANDAMENTO', 'CONCLUIDO', 2)
    ];
    const flow = calculateFlowTaskHistory({ tasks, movements, period, asOf, dateKey });
    expect(flow.lead).toEqual({ value: null, eligibleCount: 0, excludedCount: 1 });
    expect(flow.cycle).toEqual({ value: null, eligibleCount: 0, excludedCount: 1 });
    expect(flow.throughput.value).toBe(1);
  });

  it('separates the first-completion cohort from a later valid throughput period', () => {
    const tasks = [task(1, day(1), 'CONCLUIDO')];
    const movements = [
      move(1, 2, 'A_FAZER', 'CONCLUIDO', 1),
      move(1, 4, 'CONCLUIDO', 'A_FAZER', 2),
      move(1, 7, 'A_FAZER', 'CONCLUIDO', 3)
    ];
    const laterPeriod = { ...period, startDate: '2026-09-05', startInclusive: day(5) };
    const flow = calculateFlowTaskHistory({ tasks, movements, period: laterPeriod, asOf, dateKey });
    expect(flow.lead).toEqual({ value: null, eligibleCount: 0, excludedCount: 0 });
    expect(flow.throughput.value).toBe(1);
    expect(flow.throughput.points.find((point) => point.date === '2026-09-07').value).toBe(1);
  });

  it('keeps null and explicit zero effort distinct and preserves unknown statuses', () => {
    const current = calculateTaskCurrent(
      {
        total: 4n,
        wip: 1n,
        overdue: 1n,
        unassigned: 2n,
        withoutEstimate: 1n,
        withEstimate: 3n,
        estimatedHours: 7,
        withActual: 3n,
        actualHours: 8,
        comparable: 2n,
        completedComparable: 1n,
        completedWithEstimate: 1n,
        differenceHours: 1,
        above: 1n,
        below: 1n
      },
      [
        { status: 'A_FAZER', _count: { _all: 2 } },
        { status: 'LEGACY', _count: { _all: 2 } }
      ]
    );
    expect(current).toMatchObject({
      total: 4,
      withoutEstimate: 1,
      withEstimate: 3,
      actualHours: 8,
      comparable: 2,
      statuses: { A_FAZER: 2, unknownCount: 2 }
    });
    expect(taskStatusDistribution([])).toEqual({
      A_FAZER: 0,
      EM_ANDAMENTO: 0,
      CONCLUIDO: 0,
      unknownCount: 0
    });
  });
});
