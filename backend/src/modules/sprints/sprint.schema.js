// Parse, normalizacao e erros de dominio do modulo de sprints (RF10).
// Sem Prisma, sem Express: apenas regras de forma e vocabulario do dominio.
import { DomainError, ERROR_CODES } from '../../shared/errors/index.js';

export class SprintServiceError extends DomainError {
  constructor(message, statusCode = 400, code) {
    super(message, statusCode, code, { exposeTechnicalDetails: true });
    this.name = 'SprintServiceError';
  }
}

export const SPRINT_STATUSES = Object.freeze([
  'PLANEJADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA'
]);
export const MILESTONE_STATUSES = Object.freeze(['PENDENTE', 'CONCLUIDO']);
export const TERMINAL_SPRINT_STATUSES = Object.freeze(['CONCLUIDA', 'CANCELADA']);

// Transicoes permitidas da sprint. Estados terminais nao transicionam.
export const SPRINT_TRANSITIONS = Object.freeze({
  PLANEJADA: Object.freeze(['EM_ANDAMENTO', 'CANCELADA']),
  EM_ANDAMENTO: Object.freeze(['CONCLUIDA', 'CANCELADA']),
  CONCLUIDA: Object.freeze([]),
  CANCELADA: Object.freeze([])
});

export const isTerminalSprintStatus = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

function parsePositiveInteger(value, entityName, code) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new SprintServiceError(`ID ${entityName} inválido.`, 400, code);
  }
  return parsedValue;
}

export const parseProjectId = (value) =>
  parsePositiveInteger(value, 'do projeto', ERROR_CODES.VALIDATION_ERROR);
export const parseSprintId = (value) =>
  parsePositiveInteger(value, 'da sprint', ERROR_CODES.VALIDATION_ERROR);
export const parseMilestoneId = (value) =>
  parsePositiveInteger(value, 'do marco', ERROR_CODES.VALIDATION_ERROR);
export const parseTaskId = (value) =>
  parsePositiveInteger(value, 'da tarefa', ERROR_CODES.VALIDATION_ERROR);

export function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return String(value);
  return value.trim() || null;
}

// Converte data de calendario (YYYY-MM-DD) ou ISO-8601 completo em Date UTC
// truncada no dia. Datas de cronograma sao dias, nao instantes: um prazo
// 2026-08-14T23:59:59-03:00 pertence ao dia 2026-08-15 em UTC.
export function parseCalendarDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    return truncateToUtcDay(value);
  }
  if (typeof value !== 'string') {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new SprintServiceError(
        `${label} inválida. Use o formato YYYY-MM-DD.`,
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    return date;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return truncateToUtcDay(parsed);
}

export function truncateToUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
  );
}

export function ensureDateRange(startDate, endDate) {
  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new SprintServiceError(
      'A data de início não pode ser posterior à data de fim.',
      400,
      ERROR_CODES.SPRINT_DATE_RANGE_INVALID
    );
  }
}

export function ensureSprintStatus(status) {
  if (!SPRINT_STATUSES.includes(status)) {
    throw new SprintServiceError(
      `Status inválido. Use ${SPRINT_STATUSES.join(', ')}.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return status;
}

export function ensureMilestoneStatus(status) {
  if (!MILESTONE_STATUSES.includes(status)) {
    throw new SprintServiceError(
      `Status inválido. Use ${MILESTONE_STATUSES.join(' ou ')}.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return status;
}

export function ensureTransitionAllowed(currentStatus, nextStatus) {
  ensureSprintStatus(nextStatus);
  const allowed = SPRINT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new SprintServiceError(
      'Transição de status não permitida para esta sprint.',
      409,
      ERROR_CODES.SPRINT_INVALID_TRANSITION
    );
  }
  return nextStatus;
}

export function ensureSprintEditable(sprint) {
  if (isTerminalSprintStatus(sprint.status)) {
    throw new SprintServiceError(
      'Sprint concluída ou cancelada não pode ser editada.',
      409,
      ERROR_CODES.SPRINT_LOCKED
    );
  }
  return sprint;
}

export function ensureSprintAcceptsTasks(sprint) {
  if (isTerminalSprintStatus(sprint.status)) {
    throw new SprintServiceError(
      'Sprint concluída ou cancelada não aceita associação de tarefas.',
      409,
      ERROR_CODES.SPRINT_ASSOCIATION_BLOCKED
    );
  }
  return sprint;
}

// Constroi o payload de escrita da sprint a partir da entrada ja validada no HTTP.
export function buildSprintData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};
  const sprintData = {};

  if (isCreate || payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new SprintServiceError(
        'O nome da sprint é obrigatório.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.name = payload.name.trim();
  }
  if (payload.objective !== undefined) {
    sprintData.objective = normalizeOptionalText(payload.objective);
  }
  if (isCreate || payload.startDate !== undefined) {
    const startDate = parseCalendarDate(payload.startDate, 'Data de início');
    if (!startDate) {
      throw new SprintServiceError(
        'A data de início da sprint é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.startDate = startDate;
  }
  if (isCreate || payload.endDate !== undefined) {
    const endDate = parseCalendarDate(payload.endDate, 'Data de fim');
    if (!endDate) {
      throw new SprintServiceError(
        'A data de fim da sprint é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.endDate = endDate;
  }
  return sprintData;
}

export function buildMilestoneData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};
  const milestoneData = {};

  if (isCreate || payload.title !== undefined) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw new SprintServiceError(
        'O título do marco é obrigatório.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    milestoneData.title = payload.title.trim();
  }
  if (payload.description !== undefined) {
    milestoneData.description = normalizeOptionalText(payload.description);
  }
  if (isCreate || payload.dueDate !== undefined) {
    const dueDate = parseCalendarDate(payload.dueDate, 'Data prevista');
    if (!dueDate) {
      throw new SprintServiceError(
        'A data prevista do marco é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    milestoneData.dueDate = dueDate;
  }
  // Todo marco pertence a uma sprint: a conclusao fica ancorada no periodo de
  // desenvolvimento que a produziu, e nao numa data solta do projeto (ADR-010 D02).
  if (isCreate || payload.sprintId !== undefined) {
    if (payload.sprintId === undefined || payload.sprintId === null) {
      throw new SprintServiceError(
        'A sprint do marco é obrigatória.',
        400,
        ERROR_CODES.MILESTONE_SPRINT_REQUIRED
      );
    }
    milestoneData.sprintId = parseSprintId(payload.sprintId);
  }
  return milestoneData;
}

export function ensureAtLeastOneField(data, message) {
  if (!data || Object.keys(data).length === 0) {
    throw new SprintServiceError(message, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return data;
}

// Erro de unicidade do Prisma (P2002) na chave [projectId, name].
export function isUniqueNameViolation(error) {
  return error?.code === 'P2002';
}

export function sprintNameConflictError() {
  return new SprintServiceError(
    'Já existe uma sprint com este nome neste projeto.',
    409,
    ERROR_CODES.SPRINT_NAME_IN_USE
  );
}

export function sprintNotFoundError() {
  return new SprintServiceError('Sprint não encontrada.', 404, ERROR_CODES.SPRINT_NOT_FOUND);
}

export function milestoneNotFoundError() {
  return new SprintServiceError('Marco não encontrado.', 404, ERROR_CODES.MILESTONE_NOT_FOUND);
}
