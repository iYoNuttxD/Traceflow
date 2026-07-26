import { DomainError as TaskServiceError } from '../../shared/errors/index.js';
export { TaskServiceError };

export const kanbanStatuses = ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'];
const allowedPriorities = new Set(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
const allowedStatuses = new Set(kanbanStatuses);
const editableFields = [
  'title',
  'description',
  'priority',
  'responsibleUserId',
  'deadline',
  'estimatedEffort',
  'actualEffort'
];

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new TaskServiceError(`ID ${entityName} inválido.`, 400);
  }
  return parsedValue;
}

export function parseProjectId(projectId) {
  if (projectId === undefined || projectId === null || projectId === '') {
    throw new TaskServiceError('O projeto da tarefa é obrigatório.', 400);
  }
  return parsePositiveInteger(projectId, 'do projeto');
}
export const parseTaskId = (value) => parsePositiveInteger(value, 'da tarefa');
export const parsePullRequestId = (value) => parsePositiveInteger(value, 'do pull request');
export const parseCommitId = (value) => parsePositiveInteger(value, 'do commit');
export const parseIssueId = (value) => parsePositiveInteger(value, 'da issue');
export const parseRequirementId = (value) => parsePositiveInteger(value, 'do requisito');

export function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return String(value);
  return value.trim() || null;
}

export function validateStatus(status) {
  if (status === undefined || !allowedStatuses.has(status)) {
    throw new TaskServiceError(
      'Status inválido. Use A_FAZER, EM_ANDAMENTO ou CONCLUIDO.',
      400
    );
  }
}

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function parseDeadline(deadline) {
  if (deadline === undefined) return undefined;
  if (deadline === null || deadline === '') return null;
  const isDateOnly = typeof deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const date = isDateOnly ? parseDateOnly(deadline) : new Date(deadline);
  if (!date || Number.isNaN(date.getTime())) {
    throw new TaskServiceError('Prazo inválido. Informe uma data válida.', 400);
  }
  return date;
}

function parseEffort(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const effort = Number(value);
  if (!Number.isInteger(effort) || effort < 0) {
    throw new TaskServiceError(
      fieldName === 'estimatedEffort'
        ? 'O esforço estimado deve ser um número inteiro maior ou igual a zero.'
        : 'O esforço realizado deve ser um número inteiro maior ou igual a zero.',
      400
    );
  }
  return effort;
}

export function buildTaskData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};
  if (
    (isCreate && (typeof payload.title !== 'string' || !payload.title.trim())) ||
    (payload.title !== undefined &&
      (typeof payload.title !== 'string' || !payload.title.trim()))
  ) {
    throw new TaskServiceError('O título da tarefa é obrigatório.', 400);
  }
  if (payload.priority !== undefined && !allowedPriorities.has(payload.priority)) {
    throw new TaskServiceError(
      'Prioridade inválida. Use BAIXA, MEDIA, ALTA ou CRITICA.',
      400
    );
  }
  if (
    isCreate &&
    payload.actualEffort !== undefined &&
    payload.actualEffort !== null &&
    payload.actualEffort !== ''
  ) {
    throw new TaskServiceError(
      'O esforço realizado só pode ser informado na edição da tarefa.',
      400
    );
  }
  const taskData = {};
  for (const field of editableFields) {
    if (payload[field] === undefined || (isCreate && field === 'actualEffort')) continue;
    if (field === 'title') taskData.title = payload.title.trim();
    else if (field === 'description') {
      taskData[field] = normalizeOptionalText(payload[field]);
    } else if (field === 'deadline') taskData.deadline = parseDeadline(payload.deadline);
    else if (field === 'estimatedEffort' || field === 'actualEffort') {
      taskData[field] = parseEffort(payload[field], field);
    } else taskData[field] = payload[field];
  }
  if (isCreate) {
    taskData.priority = payload.priority || 'MEDIA';
    taskData.status = 'A_FAZER';
  }
  return taskData;
}

function parseMetricDate(value) {
  if (value === undefined) return undefined;
  return parseDateOnly(value);
}

function buildDateFilter(startDate, endDate) {
  if (startDate === undefined && endDate === undefined) return undefined;
  const parsedStartDate = parseMetricDate(startDate);
  const parsedEndDate = parseMetricDate(endDate);
  if (
    (startDate !== undefined && !parsedStartDate) ||
    (endDate !== undefined && !parsedEndDate) ||
    (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate)
  ) {
    throw new TaskServiceError(
      'Período inválido. Informe startDate e endDate em formato de data válido.',
      400
    );
  }
  const filter = {};
  if (parsedStartDate) filter.gte = parsedStartDate;
  if (parsedEndDate) {
    const exclusiveEndDate = new Date(parsedEndDate);
    exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
    filter.lt = exclusiveEndDate;
  }
  return filter;
}

export const buildCreatedAtFilter = buildDateFilter;
export const buildMovedAtFilter = buildDateFilter;

export function buildMovementFilters(query = {}) {
  return {
    movedAt: buildMovedAtFilter(query.startDate, query.endDate),
    taskId:
      query.taskId === undefined || query.taskId === '' ? undefined : parseTaskId(query.taskId),
    actorUserId: query.actorUserId === undefined ? undefined : parsePositiveInteger(query.actorUserId, 'do ator'),
    movedBy: normalizeOptionalText(query.movedBy) || undefined
  };
}

export function buildPagination(query = {}, defaultLimit = 20) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || defaultLimit;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
