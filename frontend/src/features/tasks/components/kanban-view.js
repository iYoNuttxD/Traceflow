import { KANBAN_COLUMNS } from './kanban-display.js';

export const EMPTY_KANBAN_FILTERS = Object.freeze({
  search: '',
  responsibleUserId: '',
  priority: '',
  startDate: '',
  endDate: '',
  traceability: ''
});

export const TRACEABILITY_FILTERS = Object.freeze([
  { value: '', label: 'Todas' },
  { value: 'SEM_VINCULO', label: 'Sem vínculo técnico (RF58)' },
  { value: 'SEM_COMMIT', label: 'Concluídas sem commit (RF13)' }
]);

export function isTraceabilityFilter(value) {
  return TRACEABILITY_FILTERS.some((filter) => filter.value && filter.value === value);
}

export function matchesTraceabilityFilter(task, filter, openAlertTasks = new Map()) {
  if (filter === 'SEM_VINCULO') return technicalLinkState(task) === 'UNLINKED';
  if (filter === 'SEM_COMMIT') return !task.isFrozen && openAlertTasks.has(task.id);
  return true;
}

export function getBoardTasks(board) {
  if (!board?.columns) return [];
  return KANBAN_COLUMNS.flatMap((column) => board.columns[column.status] || []);
}

export function filterBoardBySprints(board, sprintIds) {
  if (!board?.columns || !sprintIds.length) return board;
  return mapBoardTasks(board, (task) => task.sprintId && sprintIds.includes(task.sprintId));
}

export function filterKanbanBoard(board, filters, openAlertTasks = new Map()) {
  if (!board?.columns) return board;
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('pt-BR');

  return mapBoardTasks(board, (task) => {
    if (
      normalizedSearch &&
      !`${task.title || ''} ${task.description || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedSearch)
    ) {
      return false;
    }
    if (
      filters.responsibleUserId &&
      String(task.responsibleUser?.id || task.responsibleUserId || '') !==
        String(filters.responsibleUserId)
    ) {
      return false;
    }
    if (filters.priority && task.priority !== filters.priority) return false;

    const deadline = task.deadline ? String(task.deadline).slice(0, 10) : '';
    if (filters.startDate && (!deadline || deadline < filters.startDate)) return false;
    if (filters.endDate && (!deadline || deadline > filters.endDate)) return false;
    return matchesTraceabilityFilter(task, filters.traceability, openAlertTasks);
  });
}

export function getKanbanSummary(
  board,
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  const tasks = getBoardTasks(board);
  const counts = Object.fromEntries(
    KANBAN_COLUMNS.map((column) => [column.status, board?.columns?.[column.status]?.length || 0])
  );
  return {
    total: tasks.length,
    criticalPriority: tasks.filter((task) => task.priority === 'CRITICA').length,
    overdue: tasks.filter((task) => isTaskOverdue(task, now, timeZone)).length,
    withoutTechnicalLink: tasks.filter((task) => technicalLinkState(task) === 'UNLINKED').length,
    ...counts
  };
}

export function countActiveKanbanFilters(filters) {
  return Object.values(filters).filter(Boolean).length;
}

export function isTaskOverdue(
  task,
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
) {
  if (!task?.deadline || task.status === 'CONCLUIDO') return false;
  if (task.isFrozen) now = new Date(task.snapshotAt);
  const deadline = String(task.deadline).slice(0, 10);
  if (!Number.isFinite(now.getTime())) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      calendar: 'gregory',
      numberingSystem: 'latn'
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  );
  const today = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  return deadline < today;
}

export function getTraceabilityCounts(task) {
  if (task.isFrozen && task.traceabilityCounts) return task.traceabilityCounts;
  return {
    requirements: task.requirement ? 1 : 0,
    pullRequests: task.pullRequest ? 1 : 0,
    commits: task.commits?.length || 0,
    issues: task.issues?.length || 0
  };
}

export function technicalLinkState(task) {
  if (task.isFrozen && !task.traceabilityCounts) return 'UNKNOWN';
  const counts = getTraceabilityCounts(task);
  return counts.pullRequests + counts.commits + counts.issues > 0 ? 'LINKED' : 'UNLINKED';
}

export function traceabilityLine(task) {
  if (task.isFrozen && !task.traceabilityCounts)
    return { unavailable: true, technical: '', requirement: '' };
  const counts = getTraceabilityCounts(task);
  const technical = [
    counts.pullRequests ? `${counts.pullRequests} PR` : '',
    counts.commits ? `${counts.commits} ${counts.commits === 1 ? 'commit' : 'commits'}` : '',
    counts.issues ? `${counts.issues} ${counts.issues === 1 ? 'issue' : 'issues'}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    unavailable: false,
    technical,
    requirement: counts.requirements ? `${counts.requirements} req` : ''
  };
}

export function formatTraceabilityLine(task) {
  const line = traceabilityLine(task);
  if (line.unavailable) return 'Rastreabilidade indisponível';
  return `${line.technical || 'Sem vínculo técnico'} · ${line.requirement || 'Sem requisito'}`;
}

function formatShare(part, total) {
  if (!total) return '0%';
  const share = (part / total) * 100;
  if (part > 0 && share < 1) return '<1%';
  if (part < total && share > 99) return '>99%';
  return `${Math.round(share)}%`;
}

export function technicalLinkSummary(tasks) {
  const known = tasks.filter((task) => technicalLinkState(task) !== 'UNKNOWN');
  const unlinked = known.filter((task) => technicalLinkState(task) === 'UNLINKED').length;
  const total = known.length;
  return {
    total,
    unlinked,
    text: `Sem vínculo técnico: ${unlinked.toLocaleString('pt-BR')} de ${total.toLocaleString(
      'pt-BR'
    )} ${total === 1 ? 'tarefa' : 'tarefas'} (${formatShare(unlinked, total)})`
  };
}

export function updateBoardTask(board, taskId, patch) {
  if (!board?.columns) return board;
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [
      status,
      tasks.map((task) => (String(task.id) === String(taskId) ? { ...task, ...patch } : task))
    ])
  );
  return { ...board, columns };
}

function mapBoardTasks(board, predicate) {
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [status, tasks.filter(predicate)])
  );
  return { ...board, columns };
}
