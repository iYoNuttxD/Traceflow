import {
  milestoneStatusLabels,
  sprintStatusLabels,
  taskPriorityLabels,
  taskStatusLabels
} from './schedule-display.js';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado'
];

export const INICIAIS_SEMANA = DIAS_SEMANA.map((dia) => dia.charAt(0).toUpperCase());
export const MAX_VISIBLE_SPRINT_LANES = 3;

const pad = (valor) => String(valor).padStart(2, '0');
const compareByDay = (a, b) =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : String(a.key).localeCompare(String(b.key));

function toInstant(value) {
  if (!value) return null;
  const instant = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isNaN(instant) ? null : instant;
}

function referenceInstant(now, todayDay) {
  const current = toInstant(now);
  if (current !== null) return current;
  return todayDay ? toInstant(`${todayDay}T00:00:00`) : null;
}

function hasPassed(value, now, todayDay) {
  const instant = toInstant(value);
  const reference = referenceInstant(now, todayDay);
  return instant !== null && reference !== null && instant < reference;
}

export function toIsoDay(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIsoDay = (hoje = new Date()) => toIsoDay(hoje);

export const monthLabel = (ano, mes) => `${MESES[mes]} de ${ano}`;

export function longDayLabel(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[data.getDay()]}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

export function shortDayLabel(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[data.getDay()].slice(0, 3)}, ${pad(dia)}/${pad(mes)}`;
}

export function shortDate(isoDay) {
  if (!isoDay) return '';
  const [, mes, dia] = isoDay.split('-');
  return `${dia}/${mes}`;
}

export function fullDate(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function sprintDayRange(sprint) {
  const inicio = toIsoDay(sprint?.startDate);
  const endDate = new Date(sprint?.endDate || '');
  if (!inicio || Number.isNaN(endDate.getTime())) return { inicio, fim: inicio };
  const isMidnight =
    endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0;
  const visibleEnd = isMidnight ? new Date(endDate.getTime() - 86400000) : endDate;
  const fim = toIsoDay(visibleEnd);
  return { inicio, fim: fim && fim >= inicio ? fim : inicio };
}

export function diffDaysIso(deIso, ateIso) {
  if (!deIso || !ateIso) return null;
  const [a1, m1, d1] = deIso.split('-').map(Number);
  const [a2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

export function previousMonth(ano, mes) {
  return mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 };
}

export function nextMonth(ano, mes) {
  return mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 };
}

export function getScheduleTasks({ sprints = [], unassignedTasks = [] }) {
  const byId = new Map();
  for (const sprint of sprints) {
    for (const task of sprint.tasks || []) {
      if (byId.has(String(task.id))) continue;
      byId.set(String(task.id), {
        ...task,
        day: toIsoDay(task.deadline),
        sprintId: sprint.id,
        sprintName: sprint.name
      });
    }
  }
  for (const task of unassignedTasks) {
    if (byId.has(String(task.id))) continue;
    byId.set(String(task.id), {
      ...task,
      day: toIsoDay(task.deadline),
      sprintId: null,
      sprintName: null
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (!a.day) return b.day ? 1 : String(a.id).localeCompare(String(b.id));
    if (!b.day) return -1;
    return a.day < b.day ? -1 : a.day > b.day ? 1 : String(a.id).localeCompare(String(b.id));
  });
}

function milestoneName(milestoneById, milestoneId) {
  return milestoneById.get(String(milestoneId))?.title || null;
}

function sprintMeta(sprint, milestoneById) {
  const status = sprintStatusLabels[sprint.status] || sprint.status;
  const milestone = milestoneName(milestoneById, sprint.milestoneId);
  return milestone ? `${status} · Marco ${milestone}` : `${status} · Sem marco`;
}

export function getDayEvents({ day, sprints = [], milestones = [], tasks = [], todayDay, now }) {
  if (!day) return [];
  const milestoneById = new Map(milestones.map((item) => [String(item.id), item]));
  const events = [];

  for (const sprint of sprints) {
    const { inicio, fim } = sprintDayRange(sprint);
    if (inicio === day) {
      events.push({
        key: `sprint-start-${sprint.id}-${day}`,
        day,
        type: 'SPRINT_START',
        kind: 'Sprint',
        title: `${sprint.name} começa`,
        meta: sprintMeta(sprint, milestoneById),
        sprint
      });
    }
    if (fim === day) {
      const overdue = sprint.status === 'EM_ANDAMENTO' && hasPassed(sprint.endDate, now, todayDay);
      events.push({
        key: `sprint-end-${sprint.id}-${day}`,
        day,
        type: 'SPRINT_END',
        kind: 'Sprint',
        title: `${sprint.name} termina`,
        meta: sprintMeta(sprint, milestoneById),
        overdue,
        sprint
      });
    }
  }

  for (const milestone of milestones) {
    const dueDay = toIsoDay(milestone.dueDate);
    if (dueDay !== day) continue;
    const overdue =
      milestone.status !== 'CONCLUIDO' &&
      (milestone.overdue === true || hasPassed(milestone.dueDate, now, todayDay));
    events.push({
      key: `milestone-due-${milestone.id}-${day}`,
      day,
      type: 'MILESTONE_DUE',
      kind: 'Marco',
      title: `Prazo de ${milestone.title}`,
      meta: overdue ? 'Atrasado' : milestoneStatusLabels[milestone.status] || milestone.status,
      overdue,
      milestone
    });
  }

  for (const task of tasks) {
    const taskDay = toIsoDay(task.deadline);
    if (taskDay !== day) continue;
    const overdue = task.status !== 'CONCLUIDO' && hasPassed(task.deadline, now, todayDay);
    events.push({
      key: `task-deadline-${task.id}-${day}`,
      day,
      type: 'TASK_DEADLINE',
      kind: 'Tarefa',
      title: `#${task.id} ${task.title}`,
      meta: `${taskStatusLabels[task.status] || task.status} · ${
        taskPriorityLabels[task.priority] || task.priority
      } · ${task.sprintName || 'Sem sprint'}`,
      overdue,
      task
    });
  }

  return events.sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export function getDayContext({ day, sprints = [], milestones = [] }) {
  const milestoneById = new Map(milestones.map((item) => [String(item.id), item]));
  const activeSprints = sprints
    .map((sprint) => ({ sprint, ...sprintDayRange(sprint) }))
    .filter(({ inicio, fim }) => inicio && day >= inicio && day <= fim)
    .map(({ sprint, inicio, fim }) => ({
      sprint,
      startDay: inicio,
      endDay: fim,
      milestone: milestoneById.get(String(sprint.milestoneId)) || null
    }))
    .sort((a, b) =>
      a.startDay < b.startDay
        ? -1
        : a.startDay > b.startDay
          ? 1
          : String(a.sprint.id).localeCompare(String(b.sprint.id))
    );
  return { activeSprints };
}

function monthRange(ano, mes) {
  return {
    startDay: `${ano}-${pad(mes + 1)}-01`,
    endDay: toIsoDay(new Date(ano, mes + 1, 0))
  };
}

export function getMonthEntities({ ano, mes, sprints = [], milestones = [], tasks = [] }) {
  const { startDay, endDay } = monthRange(ano, mes);
  const milestoneById = new Map(milestones.map((item) => [String(item.id), item]));
  const intersects = (start, end) => Boolean(start && end && start <= endDay && end >= startDay);
  const monthSprints = sprints
    .map((sprint) => ({
      sprint,
      milestone: milestoneById.get(String(sprint.milestoneId)) || null,
      ...sprintDayRange(sprint)
    }))
    .filter(({ inicio, fim }) => intersects(inicio, fim))
    .sort((a, b) =>
      a.inicio < b.inicio
        ? -1
        : a.inicio > b.inicio
          ? 1
          : String(a.sprint.id).localeCompare(String(b.sprint.id))
    );
  const monthMilestones = milestones
    .map((milestone) => ({ milestone, day: toIsoDay(milestone.dueDate), key: milestone.id }))
    .filter(({ day }) => day && day >= startDay && day <= endDay)
    .sort(compareByDay);
  const monthTasks = tasks
    .map((task) => ({ ...task, day: toIsoDay(task.deadline), key: task.id }))
    .filter((task) => task.day && task.day >= startDay && task.day <= endDay)
    .sort(compareByDay);

  return {
    sprints: monthSprints,
    milestones: monthMilestones,
    tasks: monthTasks,
    counts: {
      sprints: monthSprints.length,
      milestones: monthMilestones.length,
      tasks: monthTasks.length
    }
  };
}

function buildDeadlineEntries({ sprints, milestones, tasks }) {
  const entries = [];
  for (const sprint of sprints) {
    if (sprint.status === 'CANCELADA' || sprint.status === 'CONCLUIDA') continue;
    const { fim } = sprintDayRange(sprint);
    if (!fim) continue;
    entries.push({
      key: `sprint-deadline-${sprint.id}-${fim}`,
      day: fim,
      at: sprint.endDate,
      type: 'SPRINT_END',
      kind: 'Sprint',
      title: sprint.name,
      meta: 'Encerramento',
      sprint
    });
  }
  for (const milestone of milestones) {
    if (milestone.status === 'CONCLUIDO') continue;
    const day = toIsoDay(milestone.dueDate);
    if (!day) continue;
    entries.push({
      key: `milestone-deadline-${milestone.id}-${day}`,
      day,
      at: milestone.dueDate,
      type: 'MILESTONE_DUE',
      kind: 'Marco',
      title: milestone.title,
      meta: 'Prazo',
      milestone
    });
  }
  for (const task of tasks) {
    const day = toIsoDay(task.deadline);
    if (!day || task.status === 'CONCLUIDO') continue;
    entries.push({
      key: `task-deadline-${task.id}-${day}`,
      day,
      at: task.deadline,
      type: 'TASK_DEADLINE',
      kind: 'Tarefa',
      title: `#${task.id} ${task.title}`,
      meta: taskPriorityLabels[task.priority] || task.priority,
      task
    });
  }
  return entries.sort(compareByDay);
}

export function getUpcomingDeadlines({ sprints = [], milestones = [], tasks = [], todayDay, now }) {
  const reference = referenceInstant(now, todayDay);
  return buildDeadlineEntries({ sprints, milestones, tasks })
    .filter((item) =>
      reference === null ? item.day >= todayDay : (toInstant(item.at) ?? reference - 1) >= reference
    )
    .sort((a, b) => {
      const aInstant = toInstant(a.at);
      const bInstant = toInstant(b.at);
      if (aInstant !== null && bInstant !== null && aInstant !== bInstant)
        return aInstant - bInstant;
      return compareByDay(a, b);
    });
}

function nextRelevantMilestone(milestones, todayDay, now) {
  const open = milestones
    .map((milestone) => ({
      milestone,
      day: toIsoDay(milestone.dueDate),
      overdue: milestone.overdue === true || hasPassed(milestone.dueDate, now, todayDay)
    }))
    .filter(({ milestone, day }) => milestone.status !== 'CONCLUIDO' && day);
  const overdue = open
    .filter((item) => item.overdue)
    .sort((a, b) => toInstant(b.milestone.dueDate) - toInstant(a.milestone.dueDate));
  if (overdue.length) return overdue[0];
  const upcoming = open
    .filter((item) => !item.overdue)
    .sort((a, b) => toInstant(a.milestone.dueDate) - toInstant(b.milestone.dueDate));
  return upcoming[0] || null;
}

export function getCurrentScheduleSummary({
  sprints = [],
  milestones = [],
  tasks = [],
  todayDay,
  now
}) {
  const currentSprint = sprints.find((sprint) => sprint.status === 'EM_ANDAMENTO') || null;
  const nextMilestone = nextRelevantMilestone(milestones, todayDay, now);
  const overdueMilestones = milestones.filter((milestone) => {
    return (
      milestone.status !== 'CONCLUIDO' &&
      (milestone.overdue === true || hasPassed(milestone.dueDate, now, todayDay))
    );
  });
  const overdueTasks = tasks.filter(
    (task) => task.status !== 'CONCLUIDO' && hasPassed(task.deadline, now, todayDay)
  );
  const overdueItems = [
    ...overdueMilestones.map((milestone) => ({ type: 'Marco', title: milestone.title })),
    ...overdueTasks.map((task) => ({ type: 'Tarefa', title: `#${task.id} ${task.title}` }))
  ];
  const nextDeadline =
    getUpcomingDeadlines({ sprints, milestones, tasks, todayDay, now })[0] || null;
  const milestoneSprints = nextMilestone
    ? sprints.filter(
        (sprint) =>
          String(sprint.milestoneId) === String(nextMilestone.milestone.id) &&
          sprint.status !== 'CANCELADA'
      )
    : [];
  return {
    currentSprint,
    nextMilestone: nextMilestone
      ? {
          ...nextMilestone,
          progress: {
            total: milestoneSprints.length,
            done: milestoneSprints.filter((sprint) => sprint.status === 'CONCLUIDA').length
          }
        }
      : null,
    nextDeadline,
    deadlines: {
      total: overdueItems.length,
      milestoneCount: overdueMilestones.length,
      taskCount: overdueTasks.length,
      items: overdueItems
    }
  };
}

export function allocateSprintLanes(intervals = []) {
  const laneEnds = [];
  return [...intervals]
    .sort((a, b) =>
      a.visibleStart < b.visibleStart
        ? -1
        : a.visibleStart > b.visibleStart
          ? 1
          : a.visibleEnd < b.visibleEnd
            ? -1
            : a.visibleEnd > b.visibleEnd
              ? 1
              : String(a.sprint.id).localeCompare(String(b.sprint.id))
    )
    .map((interval) => {
      let lane = laneEnds.findIndex((endDay) => endDay < interval.visibleStart);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = interval.visibleEnd;
      return { ...interval, lane };
    });
}

function populateSprintLanes(cells) {
  for (let weekIndex = 0; weekIndex < cells.length; weekIndex += 7) {
    const week = cells.slice(weekIndex, weekIndex + 7);
    const weekStart = week[0].day;
    const weekEnd = week.at(-1).day;
    const bySprint = new Map();
    for (const cell of week) {
      for (const item of cell.context.activeSprints) {
        if (bySprint.has(String(item.sprint.id))) continue;
        bySprint.set(String(item.sprint.id), {
          ...item,
          visibleStart: item.startDay < weekStart ? weekStart : item.startDay,
          visibleEnd: item.endDay > weekEnd ? weekEnd : item.endDay
        });
      }
    }
    const allocated = allocateSprintLanes([...bySprint.values()]);
    for (const cell of week) {
      const active = allocated.filter(
        (item) => item.visibleStart <= cell.day && item.visibleEnd >= cell.day
      );
      cell.sprintSegments = active
        .filter((item) => item.lane < MAX_VISIBLE_SPRINT_LANES)
        .map((item) => ({
          ...item,
          beginsSegment: cell.day === item.visibleStart,
          endsSegment: cell.day === item.visibleEnd,
          beginsSprint: cell.day === item.startDay,
          endsSprint: cell.day === item.endDay
        }));
      cell.sprintOverflowCount = active.filter(
        (item) => item.lane >= MAX_VISIBLE_SPRINT_LANES
      ).length;
    }
  }
  return cells;
}

function dayDescription(day, events, context) {
  const counts = {
    starts: events.filter((event) => event.type === 'SPRINT_START').length,
    ends: events.filter((event) => event.type === 'SPRINT_END').length,
    milestones: events.filter((event) => event.type === 'MILESTONE_DUE').length,
    tasks: events.filter((event) => event.type === 'TASK_DEADLINE').length
  };
  const details = [];
  if (counts.starts) details.push(`${counts.starts} início de sprint`);
  if (counts.ends) details.push(`${counts.ends} fim de sprint`);
  if (counts.milestones) details.push(`${counts.milestones} prazo de marco`);
  if (counts.tasks) {
    details.push(`${counts.tasks} ${counts.tasks === 1 ? 'prazo de tarefa' : 'prazos de tarefas'}`);
  }
  if (context.activeSprints.length) {
    const sprintNames = context.activeSprints.map(({ sprint }) => sprint.name).join(', ');
    details.push(
      `${context.activeSprints.length} ${
        context.activeSprints.length === 1 ? 'sprint ativa no dia' : 'sprints ativas no dia'
      }: ${sprintNames}`
    );
  }
  return details.length
    ? `${longDayLabel(day)} — ${details.join(', ')}`
    : `${longDayLabel(day)} — sem eventos datados`;
}

export function buildMonthGrid({
  ano,
  mes,
  sprints = [],
  milestones = [],
  tasks = [],
  todayDay,
  selectedDay,
  now
}) {
  const first = new Date(ano, mes, 1);
  const offset = first.getDay();
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(ano, mes, 1 - offset + index);
    const day = toIsoDay(date);
    const events = getDayEvents({ day, sprints, milestones, tasks, todayDay, now });
    const context = getDayContext({ day, sprints, milestones });
    cells.push({
      day,
      number: date.getDate(),
      inMonth: date.getMonth() === mes,
      today: day === todayDay,
      selected: day === selectedDay,
      events,
      context,
      sprintSegments: [],
      sprintOverflowCount: 0,
      milestoneCount: events.filter((event) => event.type === 'MILESTONE_DUE').length,
      taskCount: events.filter((event) => event.type === 'TASK_DEADLINE').length,
      description: dayDescription(day, events, context)
    });
  }
  return populateSprintLanes(cells);
}

export function relativeDayLabel(day, todayDay) {
  const difference = diffDaysIso(todayDay, day);
  if (difference === 0) return 'hoje';
  if (difference === 1) return 'amanhã';
  return `em ${difference} dias`;
}
