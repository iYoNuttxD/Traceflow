import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  getCurrentScheduleSummary,
  getDayContext,
  getDayEvents,
  getMonthEntities,
  getScheduleTasks,
  getUpcomingDeadlines,
  nextMonth,
  previousMonth,
  sprintDayRange,
  toIsoDay
} from '../../src/features/schedule/components/schedule-calendar.js';

const TODAY = '2026-09-10';

const task = (overrides = {}) => ({
  id: 10,
  title: 'Login do usuário',
  status: 'A_FAZER',
  priority: 'ALTA',
  deadline: '2026-09-12T07:45:00',
  estimatedEffort: 3,
  ...overrides
});

const sprint = (overrides = {}) => ({
  id: 4,
  name: 'Sprint 04',
  objective: 'Integração GitHub',
  startDate: '2026-09-03T07:45:00',
  endDate: '2026-09-16T00:00:00',
  status: 'EM_ANDAMENTO',
  milestoneId: 20,
  durationInDays: 13,
  taskCount: 1,
  tasks: [task()],
  ...overrides
});

const milestone = (overrides = {}) => ({
  id: 20,
  title: 'Entrega final',
  description: null,
  dueDate: '2026-09-30T07:44:00',
  status: 'PENDENTE',
  overdue: false,
  ...overrides
});

const tasksFrom = (sprints = [sprint()], unassignedTasks = []) =>
  getScheduleTasks({ sprints, unassignedTasks });

describe('schedule calendar date semantics', () => {
  it('preserva o dia local de instantes com hora', () => {
    expect(toIsoDay('2026-09-03T07:45:00')).toBe('2026-09-03');
    expect(toIsoDay('2026-09-30T07:44:00')).toBe('2026-09-30');
  });

  it('trata fim de Sprint à meia-noite como limite semiaberto', () => {
    expect(sprintDayRange(sprint())).toEqual({ inicio: '2026-09-03', fim: '2026-09-15' });
  });

  it('inclui o próprio dia quando o fim possui hora', () => {
    expect(sprintDayRange(sprint({ endDate: '2026-09-16T18:00:00' })).fim).toBe('2026-09-16');
  });

  it('não deixa uma faixa terminar antes de começar', () => {
    expect(
      sprintDayRange(sprint({ startDate: '2026-09-03T07:45:00', endDate: '2026-09-03T00:00:00' }))
    ).toEqual({ inicio: '2026-09-03', fim: '2026-09-03' });
  });

  it('navega corretamente na virada do ano', () => {
    expect(previousMonth(2026, 0)).toEqual({ ano: 2025, mes: 11 });
    expect(nextMonth(2026, 11)).toEqual({ ano: 2027, mes: 0 });
  });
});

describe('getScheduleTasks', () => {
  it('reúne tarefas de Sprints e sem Sprint sem descartar as sem prazo', () => {
    const result = tasksFrom(
      [sprint({ tasks: [task(), task({ id: 11, title: 'Sem data', deadline: null })] })],
      [task({ id: 12, title: 'Backlog', deadline: '2026-09-11T08:00:00' })]
    );
    expect(result.map((item) => [item.id, item.day, item.sprintName])).toEqual([
      [12, '2026-09-11', null],
      [10, '2026-09-12', 'Sprint 04'],
      [11, null, 'Sprint 04']
    ]);
  });

  it('mantém uma única fonte quando uma tarefa aparece duplicada no payload', () => {
    const result = tasksFrom([sprint()], [task()]);
    expect(result).toHaveLength(1);
    expect(result[0].sprintName).toBe('Sprint 04');
  });
});

describe('getMonthEntities', () => {
  it('conta entidades, não os dois eventos de início e fim da Sprint', () => {
    const result = getMonthEntities({
      ano: 2026,
      mes: 8,
      sprints: [sprint()],
      milestones: [milestone()],
      tasks: tasksFrom()
    });
    expect(result.counts).toEqual({ sprints: 1, milestones: 1, tasks: 1 });
  });

  it('inclui Sprint que cruza o mês apenas uma vez', () => {
    const result = getMonthEntities({
      ano: 2026,
      mes: 8,
      sprints: [sprint({ startDate: '2026-08-29T08:00:00', endDate: '2026-10-02T00:00:00' })]
    });
    expect(result.sprints).toHaveLength(1);
  });

  it('inclui Marco somente pelo dueDate e não pelo período de sua Sprint', () => {
    const result = getMonthEntities({
      ano: 2026,
      mes: 8,
      sprints: [sprint()],
      milestones: [milestone({ dueDate: '2026-10-01T07:44:00' })]
    });
    expect(result.counts).toEqual({ sprints: 1, milestones: 0, tasks: 0 });
  });

  it('conta somente tarefas com deadline no mês', () => {
    const result = getMonthEntities({
      ano: 2026,
      mes: 8,
      tasks: tasksFrom([
        sprint({
          tasks: [
            task(),
            task({ id: 11, deadline: null }),
            task({ id: 12, deadline: '2026-10-01T08:00:00' })
          ]
        })
      ])
    });
    expect(result.tasks.map((item) => item.id)).toEqual([10]);
  });

  it('preserva a relação contextual da Sprint com o Marco', () => {
    const result = getMonthEntities({
      ano: 2026,
      mes: 8,
      sprints: [sprint()],
      milestones: [milestone()]
    });
    expect(result.sprints[0].milestone.title).toBe('Entrega final');
  });
});

describe('getDayEvents', () => {
  const options = () => ({
    sprints: [sprint()],
    milestones: [milestone()],
    tasks: tasksFrom(),
    todayDay: TODAY
  });

  it('gera o início real da Sprint', () => {
    const events = getDayEvents({ day: '2026-09-03', ...options() });
    expect(events).toEqual([
      expect.objectContaining({ type: 'SPRINT_START', title: 'Sprint 04 começa' })
    ]);
  });

  it('gera o fim visível da Sprint', () => {
    const events = getDayEvents({ day: '2026-09-15', ...options() });
    expect(events).toEqual([
      expect.objectContaining({ type: 'SPRINT_END', title: 'Sprint 04 termina' })
    ]);
  });

  it('gera o prazo do Marco apenas no dueDate', () => {
    expect(getDayEvents({ day: '2026-09-03', ...options() })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'MILESTONE_DUE' })])
    );
    expect(getDayEvents({ day: '2026-09-30', ...options() })).toEqual([
      expect.objectContaining({ type: 'MILESTONE_DUE', title: 'Prazo de Entrega final' })
    ]);
  });

  it('gera apenas tarefas cujo deadline cai no dia', () => {
    const tasks = tasksFrom([
      sprint({
        tasks: [task(), task({ id: 11, title: 'Sem data', deadline: null })]
      })
    ]);
    const events = getDayEvents({ day: '2026-09-12', ...options(), tasks });
    expect(events.map((item) => item.title)).toEqual(['#10 Login do usuário']);
  });

  it('agrupa semanticamente múltiplos deadlines sem perder eventos', () => {
    const tasks = tasksFrom([sprint({ tasks: [task(), task({ id: 11, title: 'Callback' })] })]);
    const events = getDayEvents({ day: '2026-09-12', ...options(), tasks });
    expect(events.filter((item) => item.type === 'TASK_DEADLINE')).toHaveLength(2);
  });

  it('usa chaves únicas quando início e fim acontecem no mesmo dia', () => {
    const sameDay = sprint({ endDate: '2026-09-03T18:00:00' });
    const events = getDayEvents({
      day: '2026-09-03',
      sprints: [sameDay],
      milestones: [],
      tasks: [],
      todayDay: TODAY
    });
    expect(events.map((item) => item.key)).toHaveLength(2);
    expect(new Set(events.map((item) => item.key)).size).toBe(2);
  });

  it('marca como atrasados apenas itens já vencidos e abertos', () => {
    const events = getDayEvents({
      day: '2026-09-09',
      sprints: [],
      milestones: [milestone({ dueDate: '2026-09-09T18:00:00', overdue: true })],
      tasks: tasksFrom([], [task({ deadline: '2026-09-09T18:00:00' })]),
      todayDay: TODAY
    });
    expect(events).toHaveLength(2);
    expect(events.every((item) => item.overdue)).toBe(true);
  });
});

describe('getDayContext', () => {
  it('separa a Sprint ativa no dia de seus eventos datados', () => {
    const context = getDayContext({
      day: '2026-09-10',
      sprints: [sprint()],
      milestones: [milestone()]
    });
    expect(context.activeSprints[0]).toMatchObject({
      sprint: { name: 'Sprint 04' },
      milestone: { title: 'Entrega final' }
    });
  });

  it('não inventa uma Sprint ativa fora do intervalo', () => {
    expect(
      getDayContext({ day: '2026-09-20', sprints: [sprint()], milestones: [milestone()] })
        .activeSprints
    ).toEqual([]);
  });

  it('mantém Sprint sem Marco como contexto válido', () => {
    const context = getDayContext({
      day: '2026-09-10',
      sprints: [sprint({ milestoneId: null })],
      milestones: []
    });
    expect(context.activeSprints[0].milestone).toBeNull();
  });
});

describe('getCurrentScheduleSummary', () => {
  it('expõe Sprint atual e próximo Marco real', () => {
    const result = getCurrentScheduleSummary({
      sprints: [sprint()],
      milestones: [milestone()],
      tasks: tasksFrom(),
      todayDay: TODAY
    });
    expect(result.currentSprint.name).toBe('Sprint 04');
    expect(result.nextMilestone).toMatchObject({ day: '2026-09-30', overdue: false });
    expect(result.nextMilestone.progress).toEqual({ total: 1, done: 0 });
    expect(result.nextDeadline.title).toBe('#10 Login do usuário');
    expect(result.attention.total).toBe(0);
  });

  it('expõe explicitamente a ausência de Sprint e Marco', () => {
    const result = getCurrentScheduleSummary({
      sprints: [],
      milestones: [],
      tasks: [],
      todayDay: TODAY
    });
    expect(result.currentSprint).toBeNull();
    expect(result.nextMilestone).toBeNull();
    expect(result.nextDeadline).toBeNull();
  });

  it('considera o Marco vencido mais recente como o próximo relevante', () => {
    const result = getCurrentScheduleSummary({
      milestones: [
        milestone({ id: 1, dueDate: '2026-09-01T08:00:00', overdue: true }),
        milestone({ id: 2, dueDate: '2026-09-09T08:00:00', overdue: true })
      ],
      todayDay: TODAY
    });
    expect(result.nextMilestone.milestone.id).toBe(2);
    expect(result.nextMilestone.overdue).toBe(true);
  });

  it('conta Sprint, Marco e tarefa já atrasados sem threshold de atenção', () => {
    const lateSprint = sprint({ endDate: '2026-09-09T18:00:00' });
    const result = getCurrentScheduleSummary({
      sprints: [lateSprint],
      milestones: [milestone({ dueDate: '2026-09-09T18:00:00', overdue: true })],
      tasks: tasksFrom([], [task({ deadline: '2026-09-09T18:00:00' })]),
      todayDay: TODAY
    });
    expect(result.attention).toMatchObject({
      total: 3,
      sprintCount: 1,
      milestoneCount: 1,
      taskCount: 1
    });
  });

  it('não rotula como atenção um prazo futuro próximo', () => {
    const result = getCurrentScheduleSummary({
      milestones: [milestone({ dueDate: '2026-09-11T08:00:00' })],
      tasks: tasksFrom([], [task({ deadline: '2026-09-11T08:00:00' })]),
      todayDay: TODAY
    });
    expect(result.attention.total).toBe(0);
  });

  it('ignora itens concluídos no total atrasado', () => {
    const result = getCurrentScheduleSummary({
      milestones: [
        milestone({ dueDate: '2026-09-09T08:00:00', status: 'CONCLUIDO', overdue: false })
      ],
      tasks: tasksFrom([], [task({ deadline: '2026-09-09T08:00:00', status: 'CONCLUIDO' })]),
      todayDay: TODAY
    });
    expect(result.attention.total).toBe(0);
  });
});

describe('getUpcomingDeadlines', () => {
  it('inclui deadline de tarefa, fim de Sprint e dueDate de Marco em ordem cronológica', () => {
    const result = getUpcomingDeadlines({
      sprints: [sprint()],
      milestones: [milestone()],
      tasks: tasksFrom(),
      todayDay: TODAY
    });
    expect(result.map((item) => item.type)).toEqual([
      'TASK_DEADLINE',
      'SPRINT_END',
      'MILESTONE_DUE'
    ]);
  });

  it('não inclui início de Sprint nem início artificial de Marco', () => {
    const result = getUpcomingDeadlines({
      sprints: [sprint({ startDate: '2026-09-11T08:00:00' })],
      milestones: [milestone()],
      tasks: [],
      todayDay: TODAY
    });
    expect(result.some((item) => item.type === 'SPRINT_START')).toBe(false);
    expect(result.some((item) => /início/i.test(item.title))).toBe(false);
  });

  it('exclui prazos passados', () => {
    const result = getUpcomingDeadlines({
      milestones: [milestone({ dueDate: '2026-09-09T08:00:00' })],
      tasks: tasksFrom([], [task({ deadline: '2026-09-08T08:00:00' })]),
      todayDay: TODAY
    });
    expect(result).toEqual([]);
  });

  it('exclui Sprints canceladas e entidades concluídas', () => {
    const result = getUpcomingDeadlines({
      sprints: [sprint({ status: 'CANCELADA' })],
      milestones: [milestone({ status: 'CONCLUIDO' })],
      tasks: tasksFrom([], [task({ status: 'CONCLUIDO' })]),
      todayDay: TODAY
    });
    expect(result).toEqual([]);
  });

  it('respeita o limite configurado', () => {
    const tasks = tasksFrom(
      [],
      Array.from({ length: 8 }, (_, index) =>
        task({ id: index + 1, deadline: `2026-09-${String(index + 11).padStart(2, '0')}T08:00:00` })
      )
    );
    expect(getUpcomingDeadlines({ tasks, todayDay: TODAY, limit: 5 })).toHaveLength(5);
  });
});

describe('buildMonthGrid', () => {
  const grid = (overrides = {}) =>
    buildMonthGrid({
      ano: 2026,
      mes: 8,
      sprints: [sprint()],
      milestones: [milestone()],
      tasks: tasksFrom(),
      todayDay: TODAY,
      selectedDay: TODAY,
      ...overrides
    });

  it('produz seis semanas sem semântica ARIA artificial', () => {
    expect(grid()).toHaveLength(42);
  });

  it('distingue hoje, seleção e dias de fora do mês', () => {
    const cells = grid({ selectedDay: '2026-09-12' });
    expect(cells.find((cell) => cell.day === TODAY).today).toBe(true);
    expect(cells.find((cell) => cell.day === '2026-09-12').selected).toBe(true);
    expect(cells.some((cell) => !cell.inMonth)).toBe(true);
  });

  it('segmenta a faixa da Sprint nas bordas de semana', () => {
    const cells = grid();
    const sunday = cells.find((cell) => cell.day === '2026-09-06').sprintSegments[0];
    const saturday = cells.find((cell) => cell.day === '2026-09-12').sprintSegments[0];
    expect(sunday.beginsSegment).toBe(true);
    expect(saturday.endsSegment).toBe(true);
  });

  it('recorta uma Sprint que cruza o mês sem perder a continuidade', () => {
    const cells = grid({
      sprints: [sprint({ startDate: '2026-08-29T08:00:00', endDate: '2026-10-02T00:00:00' })]
    });
    expect(cells.find((cell) => cell.day === '2026-09-01').sprintSegments).toHaveLength(1);
    expect(cells.find((cell) => cell.day === '2026-09-30').sprintSegments).toHaveLength(1);
  });

  it('representa Sprints planejada, ativa, concluída e cancelada como intervalos', () => {
    const statuses = ['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'];
    for (const status of statuses) {
      const cells = grid({ sprints: [sprint({ status })] });
      expect(cells.find((cell) => cell.day === '2026-09-10').sprintSegments[0].sprint.status).toBe(
        status
      );
    }
  });

  it('agrupa múltiplas tarefas no contador do dia', () => {
    const tasks = tasksFrom([sprint({ tasks: [task(), task({ id: 11, title: 'Callback' })] })]);
    expect(grid({ tasks }).find((cell) => cell.day === '2026-09-12').taskCount).toBe(2);
  });

  it('mantém Marco como marcador pontual sem faixa temporal', () => {
    const cells = grid();
    expect(cells.find((cell) => cell.day === '2026-09-30').milestoneCount).toBe(1);
    expect(cells.find((cell) => cell.day === '2026-09-10').milestoneCount).toBe(0);
  });

  it('nomeia cada botão com data e tipos de eventos', () => {
    const cell = grid().find((item) => item.day === '2026-09-12');
    expect(cell.description).toMatch(/sábado, 12 de setembro/);
    expect(cell.description).toMatch(/1 prazo de tarefa/);
    expect(cell.description).toMatch(/1 sprint ativa no dia/);
  });
});
