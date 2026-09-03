import { summarizeSprintTasks } from './schedule-display.js';

export const SPRINT_FILTER_DEFAULTS = Object.freeze({
  search: '',
  status: '',
  milestoneId: null,
  startDate: '',
  endDate: '',
  taskId: null
});

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

const startOfDay = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const endOfDay = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function hasSprintFilters(filters) {
  return Boolean(
    filters.search.trim() ||
    filters.status ||
    filters.milestoneId ||
    filters.startDate ||
    filters.endDate ||
    filters.taskId
  );
}

export function filterSprints(sprints, filters, scheduleById = {}) {
  const query = normalize(filters.search.trim());
  const rangeStart = startOfDay(filters.startDate);
  const rangeEnd = endOfDay(filters.endDate);

  return sprints.filter((sprint) => {
    if (
      query &&
      !normalize(sprint.name).includes(query) &&
      !normalize(sprint.objective).includes(query)
    ) {
      return false;
    }
    if (filters.status && sprint.status !== filters.status) return false;
    if (filters.milestoneId && Number(sprint.milestoneId) !== Number(filters.milestoneId)) {
      return false;
    }

    const sprintStart = new Date(sprint.startDate || '');
    const sprintEnd = new Date(sprint.endDate || '');
    if (rangeStart && !Number.isNaN(sprintEnd.getTime()) && sprintEnd < rangeStart) return false;
    if (rangeEnd && !Number.isNaN(sprintStart.getTime()) && sprintStart > rangeEnd) return false;

    if (filters.taskId) {
      const related = (scheduleById[sprint.id]?.tasks || []).some(
        (task) => Number(task.id) === Number(filters.taskId)
      );
      if (!related) return false;
    }
    return true;
  });
}

export function buildSprintSummary(sprints, scheduleById = {}) {
  const count = (status) => sprints.filter((sprint) => sprint.status === status).length;
  const active = sprints.find((sprint) => sprint.status === 'EM_ANDAMENTO') || null;

  return {
    total: sprints.length,
    planned: count('PLANEJADA'),
    activeCount: count('EM_ANDAMENTO'),
    completed: count('CONCLUIDA'),
    cancelled: count('CANCELADA'),
    active,
    activeTasks: active ? summarizeSprintTasks(scheduleById[active.id]) : null
  };
}
