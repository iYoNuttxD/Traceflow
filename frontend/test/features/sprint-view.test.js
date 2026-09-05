import { describe, expect, it } from 'vitest';
import {
  buildSprintSummary,
  filterSprints,
  hasSprintFilters,
  SPRINT_FILTER_DEFAULTS
} from '../../src/features/schedule/components/sprint-view.js';

const sprints = [
  {
    id: 1,
    name: 'Sprint Login',
    objective: 'Autenticação segura',
    status: 'PLANEJADA',
    milestoneId: 10,
    startDate: '2026-09-01T09:00:00.000Z',
    endDate: '2026-09-12T18:00:00.000Z'
  },
  {
    id: 2,
    name: 'Sprint GitHub',
    objective: 'Integração',
    status: 'EM_ANDAMENTO',
    milestoneId: 20,
    startDate: '2026-09-15T09:00:00.000Z',
    endDate: '2026-09-26T18:00:00.000Z'
  },
  { id: 3, name: 'Concluída', status: 'CONCLUIDA', startDate: '2026-08-01', endDate: '2026-08-10' },
  { id: 4, name: 'Cancelada', status: 'CANCELADA', startDate: '2026-10-01', endDate: '2026-10-10' }
];
const scheduleById = {
  1: { tasks: [{ id: 11, status: 'A_FAZER', estimatedEffort: 3 }] },
  2: {
    tasks: [
      { id: 21, status: 'CONCLUIDO', estimatedEffort: 5 },
      { id: 22, status: 'A_FAZER', estimatedEffort: 3 }
    ]
  }
};

describe('sprint view model', () => {
  it('calcula total, planejadas, ativa, concluídas e canceladas com status reais', () => {
    expect(buildSprintSummary(sprints, scheduleById)).toEqual({
      total: 4,
      planned: 1,
      activeCount: 1,
      completed: 1,
      cancelled: 1,
      active: sprints[1],
      activeTasks: { total: 2, done: 1, points: 8, donePoints: 5, percent: 63 }
    });
  });

  it.each([
    ['nome', { search: 'login' }, [1]],
    ['objetivo sem acento', { search: 'autenticacao' }, [1]],
    ['status', { status: 'EM_ANDAMENTO' }, [2]],
    ['marco', { milestoneId: 20 }, [2]],
    ['data inicial por interseção', { startDate: '2026-09-20' }, [2, 4]],
    ['data final por interseção', { endDate: '2026-09-05' }, [1, 3]],
    ['tarefa relacionada', { taskId: 22 }, [2]]
  ])('filtra por %s', (_name, partial, expected) => {
    const filters = { ...SPRINT_FILTER_DEFAULTS, ...partial };
    expect(filterSprints(sprints, filters, scheduleById).map((sprint) => sprint.id)).toEqual(
      expected
    );
  });

  it('combina filtros e detecta quando devem ser limpos', () => {
    const filters = {
      ...SPRINT_FILTER_DEFAULTS,
      search: 'github',
      status: 'EM_ANDAMENTO',
      milestoneId: 20,
      taskId: 21
    };
    expect(filterSprints(sprints, filters, scheduleById)).toEqual([sprints[1]]);
    expect(hasSprintFilters(filters)).toBe(true);
    expect(hasSprintFilters(SPRINT_FILTER_DEFAULTS)).toBe(false);
  });
});
