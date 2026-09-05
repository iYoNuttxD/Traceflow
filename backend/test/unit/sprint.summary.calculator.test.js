import { describe, expect, it } from 'vitest';
import { buildSprintHistoricalSummary } from '../../src/modules/sprints/sprint.summary.calculator.js';

const sprint = {
  status: 'CONCLUIDA',
  startedAt: new Date('2026-09-01'),
  planningSnapshotAt: new Date('2026-09-01'),
  closedAt: new Date('2026-09-04')
};
const row = {
  removedAt: null,
  plannedAtStart: true,
  pointsAtPlanning: 5,
  pointsAtClose: 13,
  exitStatus: 'CONCLUIDO'
};
describe('Sprint historical display summary', () => {
  it('separates planning, closing points and a planned participation removed after start', () => {
    const result = buildSprintHistoricalSummary(sprint, [
      row,
      { ...row, removedAt: new Date('2026-09-02'), pointsAtPlanning: 3 }
    ]);
    expect(result).toMatchObject({
      plannedTasks: 2,
      plannedPoints: 8,
      totalTasks: 1,
      completedTasks: 1,
      totalPoints: 13,
      completedPoints: 13,
      percentage: 100
    });
  });
  it.each(['PLANEJADA', 'EM_ANDAMENTO'])('does not freeze %s', (status) => {
    expect(buildSprintHistoricalSummary({ ...sprint, status }, [row])).toBeNull();
  });
  it('returns unknown legacy values without taking current Task effort/status', () => {
    const legacy = {
      ...sprint,
      planningSnapshotAt: null,
      closedAt: null,
      updatedAt: new Date('2026-09-05')
    };
    const result = buildSprintHistoricalSummary(legacy, [
      {
        ...row,
        pointsAtClose: null,
        exitStatus: null,
        task: { estimatedEffort: 99, status: 'CONCLUIDO' }
      }
    ]);
    expect(result).toMatchObject({
      plannedTasks: null,
      plannedPoints: null,
      totalPoints: null,
      completedPoints: null,
      completedTasks: null,
      percentage: null,
      cutoff: '2026-09-05T00:00:00.000Z'
    });
    expect(result.historicalLimitations).toEqual([
      'LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE',
      'LEGACY_CLOSING_POINTS_UNAVAILABLE',
      'LEGACY_CLOSING_STATUS_UNAVAILABLE',
      'LEGACY_CLOSING_CUTOFF_UNAVAILABLE'
    ]);
  });
  it('distinguishes genuine zero points and an empty closing scope from missing historical points', () => {
    expect(buildSprintHistoricalSummary(sprint)).toMatchObject({
      totalTasks: 0,
      totalPoints: 0,
      percentage: null,
      historicalLimitations: []
    });
    expect(buildSprintHistoricalSummary(sprint, [{ ...row, pointsAtClose: 0 }])).toMatchObject({
      totalTasks: 1,
      completedTasks: 1,
      totalPoints: 0,
      completedPoints: 0,
      percentage: null,
      historicalLimitations: []
    });
  });
});
