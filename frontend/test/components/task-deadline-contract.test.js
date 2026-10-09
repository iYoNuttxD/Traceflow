// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isTaskOverdue as frontendOverdue,
  getKanbanSummary
} from '../../src/features/tasks/components/kanban-view.js';
import { isTaskOverdue as backendOverdue } from '../../../backend/src/modules/indicators/policies/task-deadline.policy.js';

describe('Task civil deadline contract: Kanban and analytics', () => {
  it.each([
    ['America/Sao_Paulo', '2026-10-06T02:59:59Z', '2026-10-05', false],
    ['America/Sao_Paulo', '2026-10-06T03:00:00Z', '2026-10-05', true],
    ['America/Sao_Paulo', '2026-10-06T01:00:00Z', '2026-10-04', true],
    ['America/Sao_Paulo', '2026-10-06T01:00:00Z', '2026-10-06', false],
    ['America/New_York', '2026-11-01T05:30:00Z', '2026-10-31', true],
    ['America/New_York', '2026-11-01T06:30:00Z', '2026-11-01', false]
  ])('agrees in %s at %s for deadline %s', (timeZone, instant, deadline, expected) => {
    const now = new Date(instant);
    const task = { deadline: `${deadline}T00:00:00.000Z`, status: 'A_FAZER' };
    expect(frontendOverdue(task, now, timeZone)).toBe(expected);
    expect(backendOverdue({ ...task, referenceDate: now, timeZone })).toBe(expected);
    expect(getKanbanSummary({ columns: { A_FAZER: [task] } }, now, timeZone).overdue).toBe(
      expected ? 1 : 0
    );
    expect(frontendOverdue({ ...task, status: 'CONCLUIDO' }, now, timeZone)).toBe(false);
  });
  it('keeps frozen tasks anchored to the closing instant, not today', () => {
    const task = {
      deadline: '2026-10-05T00:00:00Z',
      status: 'A_FAZER',
      isFrozen: true,
      snapshotAt: '2026-10-06T02:59:59Z'
    };
    expect(frontendOverdue(task, new Date('2026-10-10'), 'America/Sao_Paulo')).toBe(false);
  });
});
