import { DomainError, ERROR_CODES, resourceNotFoundError } from '../../shared/errors/index.js';

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

export const SPRINT_TRANSITIONS = Object.freeze({
  PLANEJADA: Object.freeze(['EM_ANDAMENTO', 'CANCELADA']),
  EM_ANDAMENTO: Object.freeze(['CONCLUIDA', 'CANCELADA']),
  CONCLUIDA: Object.freeze([]),
  CANCELADA: Object.freeze([])
});

export const isTerminalSprintStatus = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

export const SPRINT_MAX_TASKS = 100;

export const REMOVAL_REASONS = Object.freeze({
  MOVIDA: 'MOVIDA',
  REMOVIDA: 'REMOVIDA',
  TAREFA_EXCLUIDA: 'TAREFA_EXCLUIDA'
});

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

export function parseInstant(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return parseUtcDay(dateOnly, label);

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return parsed;
}

function parseUtcDay([, yearText, monthText, dayText], label) {
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

export function parseWindowDay(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!dateOnly) {
    throw new SprintServiceError(
      `${label} inválida. Use o formato YYYY-MM-DD.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return parseUtcDay(dateOnly, label);
}

export function nextUtcDay(date) {
  return date ? new Date(date.getTime() + 86400000) : null;
}

export function ensureDateRange(startDate, endDate) {
  if (startDate && endDate && startDate.getTime() >= endDate.getTime()) {
    throw new SprintServiceError(
      'A data de início precisa ser anterior à data de fim.',
      400,
      ERROR_CODES.SPRINT_DATE_RANGE_INVALID
    );
  }
}

export function sprintsOverlap(a, b) {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

export function ensureNoOverlap(candidate, sprints, ignoreId = null) {
  const conflito = sprints.find(
    (sprint) =>
      sprint.id !== ignoreId && sprint.status !== 'CANCELADA' && sprintsOverlap(candidate, sprint)
  );
  if (conflito) {
    throw new SprintServiceError(
      `O período informado conflita com a sprint "${conflito.name}". As sprints do projeto não podem se sobrepor.`,
      409,
      ERROR_CODES.SPRINT_OVERLAP
    );
  }
  return candidate;
}

export function isWithinWindow(instant, window) {
  return instant >= window.startDate && instant < window.endDate;
}

export function ensureSingleActiveSprint(sprints, targetId) {
  const ativa = sprints.find(
    (sprint) => sprint.id !== targetId && sprint.status === 'EM_ANDAMENTO'
  );
  if (ativa) {
    throw new SprintServiceError(
      `A sprint "${ativa.name}" já está em andamento. Conclua-a antes de iniciar outra.`,
      409,
      ERROR_CODES.SPRINT_ALREADY_ACTIVE
    );
  }
  return sprints;
}

export function allMilestoneSprintsConcluded(sprints) {
  const consideradas = sprints.filter((sprint) => sprint.status !== 'CANCELADA');
  return consideradas.length > 0 && consideradas.every((sprint) => sprint.status === 'CONCLUIDA');
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

export function ensureSprintScopeMutable(sprint) {
  if (isTerminalSprintStatus(sprint.status)) {
    throw new SprintServiceError(
      'Sprint concluída ou cancelada é registro histórico: seu escopo não pode ser alterado.',
      409,
      ERROR_CODES.SPRINT_SCOPE_LOCKED
    );
  }
  return sprint;
}

export function ensureWithinTaskLimit(total) {
  if (total > SPRINT_MAX_TASKS) {
    throw new SprintServiceError(
      `Uma sprint aceita no máximo ${SPRINT_MAX_TASKS} tarefas.`,
      409,
      ERROR_CODES.SPRINT_TASK_LIMIT_REACHED
    );
  }
  return total;
}

export function sprintDeleteNotSupportedError() {
  return new SprintServiceError(
    'Sprint não pode ser excluída: o cronograma é registro histórico do projeto.',
    405,
    ERROR_CODES.SPRINT_DELETE_NOT_SUPPORTED
  );
}

export function milestoneHasSprintsError(total) {
  return new SprintServiceError(
    `O marco não pode ser excluído: ${total} sprint(s) ainda pertencem a ele. Mova-as para outro marco antes.`,
    409,
    ERROR_CODES.MILESTONE_HAS_SPRINTS
  );
}

export function taskNotFoundError() {
  return new SprintServiceError('Tarefa não encontrada.', 404, ERROR_CODES.TASK_NOT_FOUND);
}

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
    const startDate = parseInstant(payload.startDate, 'Data de início');
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
    const endDate = parseInstant(payload.endDate, 'Data de fim');
    if (!endDate) {
      throw new SprintServiceError(
        'A data de fim da sprint é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.endDate = endDate;
  }
  if (isCreate || payload.milestoneId !== undefined) {
    if (payload.milestoneId === undefined || payload.milestoneId === null) {
      if (isCreate) {
        throw new SprintServiceError(
          'O marco da sprint é obrigatório.',
          400,
          ERROR_CODES.SPRINT_MILESTONE_REQUIRED
        );
      }
      sprintData.milestoneId = null;
    } else {
      sprintData.milestoneId = parseMilestoneId(payload.milestoneId);
    }
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
    const dueDate = parseInstant(payload.dueDate, 'Data prevista');
    if (!dueDate) {
      throw new SprintServiceError(
        'A data prevista do marco é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    milestoneData.dueDate = dueDate;
  }
  return milestoneData;
}

export function ensureAtLeastOneField(data, message) {
  if (!data || Object.keys(data).length === 0) {
    throw new SprintServiceError(message, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return data;
}

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
  return resourceNotFoundError('Sprint');
}

export function milestoneNotFoundError() {
  return resourceNotFoundError('Milestone');
}
