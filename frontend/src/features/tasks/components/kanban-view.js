import { KANBAN_COLUMNS } from './kanban-display.js';

export const EMPTY_KANBAN_FILTERS = Object.freeze({
  search: '',
  responsibleUserId: '',
  priority: '',
  startDate: '',
  endDate: ''
});

export function getBoardTasks(board) {
  if (!board?.columns) return [];
  return KANBAN_COLUMNS.flatMap((column) => board.columns[column.status] || []);
}

export function filterBoardBySprints(board, sprintIds) {
  if (!board?.columns || !sprintIds.length) return board;
  return mapBoardTasks(board, (task) => task.sprintId && sprintIds.includes(task.sprintId));
}

export function filterKanbanBoard(board, filters) {
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
    return true;
  });
}

export function getKanbanSummary(board) {
  const counts = Object.fromEntries(
    KANBAN_COLUMNS.map((column) => [column.status, board?.columns?.[column.status]?.length || 0])
  );
  return {
    total: Object.values(counts).reduce((total, count) => total + count, 0),
    ...counts
  };
}

export function countActiveKanbanFilters(filters) {
  return Object.values(filters).filter(Boolean).length;
}

export function isTaskOverdue(task, now = new Date()) {
  if (!task?.deadline || task.status === 'CONCLUIDO') return false;
  const deadline = String(task.deadline).slice(0, 10);
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
  return deadline < today;
}

export function getTraceabilityCounts(task) {
  return {
    requirements: task.requirement ? 1 : 0,
    pullRequests: task.pullRequest ? 1 : 0,
    commits: task.commits?.length || 0,
    issues: task.issues?.length || 0
  };
}

export function formatTraceabilityCounts(task) {
  const counts = getTraceabilityCounts(task);
  const parts = [
    counts.requirements ? `${counts.requirements} req` : '',
    counts.pullRequests ? `${counts.pullRequests} PR` : '',
    counts.commits ? `${counts.commits} ${counts.commits === 1 ? 'commit' : 'commits'}` : '',
    counts.issues ? `${counts.issues} ${counts.issues === 1 ? 'issue' : 'issues'}` : ''
  ].filter(Boolean);
  return parts.join(' · ') || 'Sem rastreabilidade';
}

function mapBoardTasks(board, predicate) {
  const columns = Object.fromEntries(
    Object.entries(board.columns).map(([status, tasks]) => [status, tasks.filter(predicate)])
  );
  return { ...board, columns };
}
