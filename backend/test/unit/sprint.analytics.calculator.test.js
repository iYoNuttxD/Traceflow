import { describe, expect, it } from 'vitest';
import {
  buildSprintAnalyticsFacts,
  buildSprintVelocity
} from '../../src/modules/sprints/sprint.analytics.calculator.js';

const at = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`);

function progress(overrides = {}) {
  return {
    historicalSummary: null,
    historicalLimitations: [],
    current: { numerator: 2, denominator: 3 },
    scopeChange: { added: [{ taskId: 3 }], removed: [{ taskId: 4 }] },
    carryOver: [{ taskId: 4, toSprintId: 2 }],
    effort: { estimatedHours: 14, actualHours: 7, differenceHours: -7 },
    burndown: { hasData: true, days: [{ date: '2026-09-01', remaining: 14 }] },
    ...overrides
  };
}

describe('Sprint analytics facts', () => {
  it('keeps the initial baseline separate from current scope and delivered points', () => {
    const sprint = { status: 'EM_ANDAMENTO', startedAt: at(1), planningSnapshotAt: at(1) };
    const participations = [
      {
        taskId: 1,
        plannedAtStart: true,
        pointsAtPlanning: 5,
        removedAt: null,
        carriedFromSprintId: null
      },
      {
        taskId: 2,
        plannedAtStart: true,
        pointsAtPlanning: 3,
        removedAt: null,
        carriedFromSprintId: null
      },
      {
        taskId: 3,
        plannedAtStart: true,
        pointsAtPlanning: 2,
        removedAt: null,
        carriedFromSprintId: null
      },
      {
        taskId: 4,
        plannedAtStart: false,
        pointsAtPlanning: null,
        removedAt: null,
        carriedFromSprintId: 9
      }
    ];
    const burndownData = [
      { taskId: 1, points: 5, removedAt: null, currentStatus: 'CONCLUIDO' },
      { taskId: 2, points: 3, removedAt: null, currentStatus: 'A_FAZER' },
      { taskId: 3, points: 2, removedAt: null, currentStatus: 'CONCLUIDO' },
      { taskId: 4, points: 4, removedAt: null, currentStatus: 'A_FAZER' }
    ];
    const facts = buildSprintAnalyticsFacts({
      sprint,
      participations,
      burndownData,
      progress: progress()
    });
    expect(facts).toMatchObject({
      plannedPoints: 10,
      currentPoints: 14,
      deliveredPoints: 7,
      plannedTasks: 3,
      deliveredTasks: 2
    });
    expect(facts.incoming).toMatchObject([{ taskId: 4, fromSprintId: 9 }]);
    expect(facts.outgoing).toMatchObject([{ taskId: 4, toSprintId: 2 }]);
  });

  it('uses frozen summary even if live-looking rows later differ', () => {
    const sprint = { status: 'CONCLUIDA', startedAt: at(1), planningSnapshotAt: at(1) };
    const summary = {
      plannedPoints: 10,
      totalPoints: 14,
      completedPoints: 7,
      plannedTasks: 5,
      completedTasks: 3,
      historicalLimitations: []
    };
    const facts = buildSprintAnalyticsFacts({
      sprint,
      participations: [{ taskId: 1, plannedAtStart: true, pointsAtPlanning: 999, removedAt: null }],
      burndownData: [{ taskId: 1, points: 999, removedAt: null, currentStatus: 'CONCLUIDO' }],
      progress: progress({
        historicalSummary: summary,
        current: { numerator: 999 },
        scopeChange: { added: [], removed: [] },
        carryOver: []
      })
    });
    expect(facts).toMatchObject({
      plannedPoints: 10,
      currentPoints: 14,
      deliveredPoints: 7,
      plannedTasks: 5,
      deliveredTasks: 3
    });
  });

  it('filters velocity to complete trustworthy Sprints and reports exclusions/truncation', () => {
    const sprint = (id, status, closedAt) => ({
      id,
      name: `Sprint ${id}`,
      status,
      startedAt: at(1),
      planningSnapshotAt: at(1),
      closedAt,
      completedAt: closedAt,
      updatedAt: closedAt ?? at(10)
    });
    const sprints = [
      sprint(1, 'CONCLUIDA', at(5)),
      sprint(2, 'CANCELADA', at(6)),
      sprint(3, 'CONCLUIDA', at(7)),
      sprint(4, 'EM_ANDAMENTO', null),
      sprint(5, 'CONCLUIDA', at(8))
    ];
    const rows = [
      {
        sprintId: 1,
        removedAt: null,
        plannedAtStart: true,
        pointsAtPlanning: 8,
        pointsAtClose: 8,
        exitStatus: 'CONCLUIDO'
      },
      {
        sprintId: 3,
        removedAt: null,
        plannedAtStart: true,
        pointsAtPlanning: 12,
        pointsAtClose: 12,
        exitStatus: 'CONCLUIDO'
      },
      {
        sprintId: 5,
        removedAt: null,
        plannedAtStart: true,
        pointsAtPlanning: 5,
        pointsAtClose: null,
        exitStatus: 'CONCLUIDO'
      }
    ];
    expect(buildSprintVelocity(sprints, rows, 1)).toEqual({
      points: [
        { sprintId: 3, sprintName: 'Sprint 3', closedAt: at(7).toISOString(), completedPoints: 12 }
      ],
      eligibleCount: 2,
      excludedCount: 1,
      truncatedCount: 1
    });
  });
});
