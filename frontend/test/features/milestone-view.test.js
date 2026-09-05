import { describe, expect, it } from 'vitest';
import {
  buildMilestoneSummary,
  filterMilestones,
  hasMilestoneFilters,
  MILESTONE_FILTER_DEFAULTS,
  milestoneCoveredPeriod,
  milestoneDeadlineHealth,
  sortMilestoneSprints,
  sprintEndsAfterMilestone,
  summarizeMilestoneSprints
} from '../../src/features/schedule/components/milestone-view.js';

const now = new Date('2026-09-03T12:00:00.000Z');
const milestone = (id, title, dueDate, status = 'PENDENTE', description = '') => ({
  id,
  title,
  description,
  dueDate,
  status
});
const sprint = (id, milestoneId, status = 'PLANEJADA', overrides = {}) => ({
  id,
  name: `Sprint ${id}`,
  milestoneId,
  status,
  startDate: `2026-09-${String(id).padStart(2, '0')}T00:00:00.000Z`,
  endDate: `2026-09-${String(id + 4).padStart(2, '0')}T00:00:00.000Z`,
  ...overrides
});

describe('milestoneDeadlineHealth', () => {
  it('separa prazo futuro, atrasado e marco concluido', () => {
    expect(milestoneDeadlineHealth(milestone(1, 'Futuro', '2026-09-04T00:00:00.000Z'), now)).toBe(
      'EM_DIA'
    );
    expect(milestoneDeadlineHealth(milestone(2, 'Atrasado', '2026-09-02T00:00:00.000Z'), now)).toBe(
      'ATRASADO'
    );
    expect(
      milestoneDeadlineHealth(
        milestone(3, 'Concluído', '2026-09-02T00:00:00.000Z', 'CONCLUIDO'),
        now
      )
    ).toBe('CONCLUIDO');
  });
});

describe('buildMilestoneSummary', () => {
  it('calcula total, abertos, concluidos, atrasados e proximo prazo', () => {
    const result = buildMilestoneSummary(
      [
        milestone(1, 'Atrasado', '2026-09-01T00:00:00.000Z'),
        milestone(2, 'Próximo', '2026-09-05T00:00:00.000Z'),
        milestone(3, 'Depois', '2026-09-10T00:00:00.000Z'),
        milestone(4, 'Feito', '2026-08-30T00:00:00.000Z', 'CONCLUIDO')
      ],
      now
    );
    expect(result).toMatchObject({ total: 4, open: 3, completed: 1, overdue: 1 });
    expect(result.nextDeadline.title).toBe('Próximo');
  });

  it('nao inventa proximo prazo quando so ha atrasados ou concluidos', () => {
    const result = buildMilestoneSummary(
      [
        milestone(1, 'Atrasado', '2026-09-01T00:00:00.000Z'),
        milestone(2, 'Feito', '2026-09-10T00:00:00.000Z', 'CONCLUIDO')
      ],
      now
    );
    expect(result.nextDeadline).toBeNull();
  });
});

describe('progresso e periodo coberto', () => {
  it.each([
    ['0/0', [], { total: 0, done: 0, percent: 0 }],
    ['0/N', [sprint(1, 5), sprint(2, 5)], { total: 2, done: 0, percent: 0 }],
    ['parcial', [sprint(1, 5, 'CONCLUIDA'), sprint(2, 5)], { total: 2, done: 1, percent: 50 }],
    [
      'todas concluidas',
      [sprint(1, 5, 'CONCLUIDA'), sprint(2, 5, 'CONCLUIDA')],
      { total: 2, done: 2, percent: 100 }
    ]
  ])('calcula %s sem NaN', (_label, sprints, expected) => {
    expect(summarizeMilestoneSprints(5, sprints)).toMatchObject(expected);
  });

  it('ignora canceladas no progresso, mas preserva o total vinculado', () => {
    const result = summarizeMilestoneSprints(5, [
      sprint(1, 5, 'CONCLUIDA'),
      sprint(2, 5, 'CANCELADA')
    ]);
    expect(result).toMatchObject({ linked: 2, total: 1, done: 1, percent: 100, cancelled: 1 });
  });

  it('deriva o periodo pelas extremidades das Sprints sem persistir datas no marco', () => {
    const period = milestoneCoveredPeriod(5, [
      sprint(2, 5, 'PLANEJADA', {
        startDate: '2026-09-15T00:00:00.000Z',
        endDate: '2026-09-30T00:00:00.000Z'
      }),
      sprint(1, 5, 'CONCLUIDA', {
        startDate: '2026-09-03T00:00:00.000Z',
        endDate: '2026-09-14T00:00:00.000Z'
      })
    ]);
    expect(period.startDate.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(period.endDate.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    expect(milestoneCoveredPeriod(9, [])).toBeNull();
  });

  it('soma somente pontos ja presentes no DTO do cronograma', () => {
    const result = summarizeMilestoneSprints(5, [sprint(1, 5)], {
      1: { tasks: [{ estimatedEffort: 3 }, { estimatedEffort: 5 }] }
    });
    expect(result.points).toBe(8);
  });
});

describe('filterMilestones', () => {
  const milestones = [
    milestone(1, 'Entrega Login', '2026-09-02T00:00:00.000Z', 'PENDENTE', 'Autenticação'),
    milestone(2, 'Integração', '2026-09-10T00:00:00.000Z'),
    milestone(3, 'Release', '2026-09-20T00:00:00.000Z', 'CONCLUIDO')
  ];
  const sprints = [sprint(1, 1), sprint(2, 2)];
  const apply = (overrides) =>
    filterMilestones(milestones, { ...MILESTONE_FILTER_DEFAULTS, ...overrides }, sprints, now);

  it('busca titulo e descricao sem diferenciar acentos', () => {
    expect(apply({ search: 'login' }).map((item) => item.id)).toEqual([1]);
    expect(apply({ search: 'autenticacao' }).map((item) => item.id)).toEqual([1]);
  });

  it('filtra status, saude do prazo, intervalo e Sprint', () => {
    expect(apply({ status: 'CONCLUIDO' }).map((item) => item.id)).toEqual([3]);
    expect(apply({ deadlineHealth: 'ATRASADO' }).map((item) => item.id)).toEqual([1]);
    expect(apply({ dueFrom: '2026-09-09', dueTo: '2026-09-11' }).map((item) => item.id)).toEqual([
      2
    ]);
    expect(apply({ sprintId: 2 }).map((item) => item.id)).toEqual([2]);
  });

  it('combina filtros e identifica quando limpar esta disponivel', () => {
    const filters = {
      ...MILESTONE_FILTER_DEFAULTS,
      search: 'integra',
      status: 'PENDENTE',
      deadlineHealth: 'EM_DIA',
      sprintId: 2
    };
    expect(filterMilestones(milestones, filters, sprints, now).map((item) => item.id)).toEqual([2]);
    expect(hasMilestoneFilters(filters)).toBe(true);
    expect(hasMilestoneFilters(MILESTONE_FILTER_DEFAULTS)).toBe(false);
  });
});

describe('consulta de Sprints', () => {
  it('ordena pelo inicio e usa id como desempate', () => {
    const result = sortMilestoneSprints([
      sprint(3, 5, 'PLANEJADA', { startDate: '2026-09-10T00:00:00.000Z' }),
      sprint(2, 5, 'PLANEJADA', { startDate: '2026-09-01T00:00:00.000Z' }),
      sprint(1, 5, 'PLANEJADA', { startDate: '2026-09-01T00:00:00.000Z' })
    ]);
    expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('sinaliza apenas Sprint que termina depois do prazo', () => {
    const target = milestone(5, 'Entrega', '2026-09-15T00:00:00.000Z');
    expect(
      sprintEndsAfterMilestone(
        sprint(1, 5, 'PLANEJADA', { endDate: '2026-09-16T00:00:00.000Z' }),
        target
      )
    ).toBe(true);
    expect(
      sprintEndsAfterMilestone(
        sprint(1, 5, 'PLANEJADA', { endDate: '2026-09-15T00:00:00.000Z' }),
        target
      )
    ).toBe(false);
  });
});
