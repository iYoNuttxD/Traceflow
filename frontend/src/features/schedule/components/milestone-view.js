import { milestoneProgress, summarizeSprintTasks } from './schedule-display.js';

export const MILESTONE_FILTER_DEFAULTS = Object.freeze({
  search: '',
  status: '',
  deadlineHealth: '',
  dueFrom: '',
  dueTo: '',
  sprintId: null
});

export const milestoneDeadlineHealthLabels = {
  EM_DIA: 'Em dia',
  ATRASADO: 'Atrasado',
  CONCLUIDO: 'Concluído'
};

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

export function milestoneDeadlineHealth(milestone, now = new Date()) {
  if (milestone?.status === 'CONCLUIDO') return 'CONCLUIDO';
  const dueDate = new Date(milestone?.dueDate || '');
  if (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime()) return 'ATRASADO';
  return 'EM_DIA';
}

export function hasMilestoneFilters(filters) {
  return Boolean(
    filters.search.trim() ||
    filters.status ||
    filters.deadlineHealth ||
    filters.dueFrom ||
    filters.dueTo ||
    filters.sprintId
  );
}

export function filterMilestones(milestones, filters, sprints = [], now = new Date()) {
  const query = normalize(filters.search.trim());
  const dueFrom = startOfDay(filters.dueFrom);
  const dueTo = endOfDay(filters.dueTo);

  return milestones.filter((milestone) => {
    if (
      query &&
      !normalize(milestone.title).includes(query) &&
      !normalize(milestone.description).includes(query)
    ) {
      return false;
    }
    if (filters.status && milestone.status !== filters.status) return false;
    if (
      filters.deadlineHealth &&
      milestoneDeadlineHealth(milestone, now) !== filters.deadlineHealth
    ) {
      return false;
    }

    const deadline = new Date(milestone.dueDate || '');
    if (dueFrom && !Number.isNaN(deadline.getTime()) && deadline < dueFrom) return false;
    if (dueTo && !Number.isNaN(deadline.getTime()) && deadline > dueTo) return false;

    if (filters.sprintId) {
      const related = sprints.some(
        (sprint) =>
          Number(sprint.id) === Number(filters.sprintId) &&
          Number(sprint.milestoneId) === Number(milestone.id)
      );
      if (!related) return false;
    }
    return true;
  });
}

export function buildMilestoneSummary(milestones, now = new Date()) {
  const open = milestones.filter((milestone) => milestone.status === 'PENDENTE');
  const upcoming = open
    .filter((milestone) => {
      const dueDate = new Date(milestone.dueDate || '');
      return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() >= now.getTime();
    })
    .sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate));

  return {
    total: milestones.length,
    open: open.length,
    completed: milestones.filter((milestone) => milestone.status === 'CONCLUIDO').length,
    overdue: open.filter((milestone) => milestoneDeadlineHealth(milestone, now) === 'ATRASADO')
      .length,
    nextDeadline: upcoming[0] || null
  };
}

export function milestoneCoveredPeriod(milestoneId, sprints = []) {
  const related = sprints.filter((sprint) => Number(sprint.milestoneId) === Number(milestoneId));
  const starts = related
    .map((sprint) => new Date(sprint.startDate || ''))
    .filter((date) => !Number.isNaN(date.getTime()));
  const ends = related
    .map((sprint) => new Date(sprint.endDate || ''))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (!starts.length || !ends.length) return null;
  return {
    startDate: new Date(Math.min(...starts.map((date) => date.getTime()))),
    endDate: new Date(Math.max(...ends.map((date) => date.getTime())))
  };
}

export function sortMilestoneSprints(sprints = []) {
  return [...sprints].sort((first, second) => {
    const firstStart = new Date(first.startDate || '').getTime();
    const secondStart = new Date(second.startDate || '').getTime();
    const safeFirst = Number.isNaN(firstStart) ? Number.MAX_SAFE_INTEGER : firstStart;
    const safeSecond = Number.isNaN(secondStart) ? Number.MAX_SAFE_INTEGER : secondStart;
    return safeFirst - safeSecond || Number(first.id) - Number(second.id);
  });
}

export function summarizeMilestoneSprints(milestoneId, sprints = [], scheduleById = {}) {
  const progress = milestoneProgress(milestoneId, sprints);
  const related = sortMilestoneSprints(progress.sprints);
  return {
    ...progress,
    sprints: related,
    linked: related.length,
    planned: related.filter((sprint) => sprint.status === 'PLANEJADA').length,
    active: related.filter((sprint) => sprint.status === 'EM_ANDAMENTO').length,
    cancelled: related.filter((sprint) => sprint.status === 'CANCELADA').length,
    points: related.reduce(
      (total, sprint) => total + summarizeSprintTasks(scheduleById[sprint.id]).points,
      0
    )
  };
}

export function sprintEndsAfterMilestone(sprint, milestone) {
  const endDate = new Date(sprint?.endDate || '');
  const dueDate = new Date(milestone?.dueDate || '');
  return (
    !Number.isNaN(endDate.getTime()) &&
    !Number.isNaN(dueDate.getTime()) &&
    endDate.getTime() > dueDate.getTime()
  );
}
