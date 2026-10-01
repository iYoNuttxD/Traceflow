import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateFlowTaskHistory } from '../../src/modules/indicators/calculators/flow-task.calculator.js';
import { flowHealthIndicators } from '../../src/modules/indicators/health/health.data.js';
import {
  buildProjectHealth,
  healthWindow
} from '../../src/modules/indicators/health/health.policy.js';
import { healthRepository } from '../../src/modules/indicators/health/health.repository.js';

const database = vi.hoisted(() => ({
  task: { findMany: vi.fn() },
  taskMovement: { findMany: vi.fn() }
}));
vi.mock('../../src/database/prismaClient.js', () => ({
  prisma: { $transaction: (read) => read(database) }
}));

const date = (value) => new Date(`${value}T00:00:00Z`);
const asOf = date('2026-09-30');
const window = healthWindow(
  { startInclusive: date('2026-09-10'), endExclusive: date('2026-09-20'), timeZone: 'UTC' },
  asOf
);
function fixture() {
  const tasks = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    title: `Task ${index + 1}`,
    status: 'CONCLUIDO',
    createdAt: date('2026-08-30')
  }));
  const movements = tasks.flatMap((task, index) => [
    {
      id: index * 2 + 1,
      taskId: task.id,
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      movedAt: date('2026-09-01')
    },
    {
      id: index * 2 + 2,
      taskId: task.id,
      fromStatus: 'EM_ANDAMENTO',
      toStatus: 'CONCLUIDO',
      movedAt: date(index < 3 ? '2026-09-05' : index < 6 ? '2026-09-15' : '2026-09-25')
    }
  ]);
  return { tasks, movements };
}

beforeEach(() => vi.clearAllMocks());

describe('health flow facts and duration-only calculation', () => {
  it('retains known completions after the historical window without reducing FLOW coverage', async () => {
    const input = fixture();
    database.task.findMany.mockResolvedValue(input.tasks);
    database.taskMovement.findMany.mockImplementation(({ where }) =>
      input.movements.filter((movement) => movement.movedAt < where.movedAt.lt)
    );
    const facts = await healthRepository.flow(42, asOf, false);
    expect(database.taskMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 42, movedAt: { lt: asOf } } })
    );
    const rows = flowHealthIndicators(facts, window, asOf);
    expect(rows.current).toEqual([
      { metricId: 'I20', value: 16, state: 'AVAILABLE', eligibleCount: 3, excludedCount: 0 },
      { metricId: 'I21', value: 14, state: 'AVAILABLE', eligibleCount: 3, excludedCount: 0 }
    ]);
    expect(rows.previous.map((row) => row.value)).toEqual([6, 4]);
    const health = buildProjectHealth(
      new Map(rows.current.map((row) => [row.metricId, row])),
      new Map(rows.previous.map((row) => [row.metricId, row]))
    );
    expect(health.dimensions.find((dimension) => dimension.id === 'FLOW')).toMatchObject({
      coverage: 100,
      assessedSignals: ['I20', 'I21']
    });
  });

  it('preserves full-calculator duration formulas and exclusions in both windows', () => {
    const facts = fixture();
    facts.tasks.push({ id: 8, status: 'CONCLUIDO', createdAt: date('2026-08-30') });
    // An observed completion with no start remains an excluded cycle sample.
    facts.movements = facts.movements.filter((movement) => movement.id !== 7);
    for (const period of Object.values(window)) {
      const full = calculateFlowTaskHistory({
        ...facts,
        period,
        asOf,
        dateKey: (value) => value.toISOString().slice(0, 10)
      });
      expect(calculateFlowTaskHistory({ ...facts, period, asOf, durationsOnly: true })).toEqual({
        lead: full.lead,
        cycle: full.cycle
      });
    }
    expect(flowHealthIndicators(facts, window, asOf).current[1]).toMatchObject({
      state: 'PARTIAL',
      eligibleCount: 2,
      excludedCount: 2
    });
  });

  it('never uses movements at or after asOf, even when the requested window reaches the future', () => {
    const facts = fixture();
    for (const cutoff of [asOf, date('2026-10-01')]) {
      facts.movements.at(-1).movedAt = cutoff;
      const period = { ...window.current, endExclusive: date('2026-10-02') };
      const result = calculateFlowTaskHistory({ ...facts, period, asOf, durationsOnly: true });
      expect(result.lead).toEqual({ value: 16, eligibleCount: 3, excludedCount: 1 });
      expect(result.cycle).toEqual({ value: 14, eligibleCount: 3, excludedCount: 1 });
    }
  });

  it('summarizes arbitrarily long health periods without reading civil dates or building daily series', () => {
    const period = {
      startInclusive: date('1000-01-01'),
      endExclusive: asOf,
      get startDate() {
        throw new Error('Daily series must not be expanded');
      },
      get endDate() {
        throw new Error('Daily series must not be expanded');
      }
    };
    const rows = flowHealthIndicators(fixture(), { current: period, previous: period }, asOf);
    expect(rows.current[0]).toMatchObject({ state: 'AVAILABLE', eligibleCount: 7 });
    expect(rows.previous).toEqual(rows.current);
  });
});
