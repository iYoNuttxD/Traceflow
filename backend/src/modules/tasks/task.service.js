// Service do modulo de tarefas. Contem as regras de negocio e validacoes do RF07.
import { taskRepository } from './task.repository.js';

class TaskServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TaskServiceError';
    this.statusCode = statusCode;
  }
}

const allowedPriorities = new Set(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
const allowedStatuses = new Set(['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO']);
const kanbanStatuses = ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'];
const editableFields = [
  'title',
  'description',
  'priority',
  'responsible',
  'status',
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

function parseProjectId(projectId) {
  if (projectId === undefined || projectId === null || projectId === '') {
    throw new TaskServiceError('O projeto da tarefa é obrigatório.', 400);
  }

  return parsePositiveInteger(projectId, 'do projeto');
}

function parseTaskId(taskId) {
  return parsePositiveInteger(taskId, 'da tarefa');
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  return value.trim() || null;
}

function validateTitle(title, required = false) {
  if (
    (required && (typeof title !== 'string' || !title.trim())) ||
    (title !== undefined && (typeof title !== 'string' || !title.trim()))
  ) {
    throw new TaskServiceError('O título da tarefa é obrigatório.', 400);
  }
}

function validatePriority(priority) {
  if (priority !== undefined && !allowedPriorities.has(priority)) {
    throw new TaskServiceError(
      'Prioridade inválida. Use BAIXA, MEDIA, ALTA ou CRITICA.',
      400
    );
  }
}

function validateStatus(status) {
  if (status === undefined || !allowedStatuses.has(status)) {
    throw new TaskServiceError(
      'Status inválido. Use A_FAZER, EM_ANDAMENTO ou CONCLUIDO.',
      400
    );
  }
}

function parseDateOnly(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseDeadline(deadline) {
  if (deadline === undefined) {
    return undefined;
  }

  if (deadline === null || deadline === '') {
    return null;
  }

  const isDateOnly = typeof deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const date = isDateOnly ? parseDateOnly(deadline) : new Date(deadline);

  if (!date || Number.isNaN(date.getTime())) {
    throw new TaskServiceError('Prazo inválido. Informe uma data válida.', 400);
  }

  return date;
}

function parseEffort(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const effort = Number(value);

  if (!Number.isInteger(effort) || effort < 0) {
    const message =
      fieldName === 'estimatedEffort'
        ? 'O esforço estimado deve ser um número inteiro maior ou igual a zero.'
        : 'O esforço realizado deve ser um número inteiro maior ou igual a zero.';
    throw new TaskServiceError(message, 400);
  }

  return effort;
}

function buildTaskData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};

  validateTitle(payload.title, isCreate);
  validatePriority(payload.priority);

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

  if (payload.status !== undefined) {
    validateStatus(payload.status);
  }

  const taskData = {};

  for (const field of editableFields) {
    if (payload[field] === undefined) {
      continue;
    }

    if (isCreate && field === 'actualEffort') {
      continue;
    }

    if (field === 'title') {
      taskData.title = payload.title.trim();
    } else if (field === 'description' || field === 'responsible') {
      taskData[field] = normalizeOptionalText(payload[field]);
    } else if (field === 'deadline') {
      taskData.deadline = parseDeadline(payload.deadline);
    } else if (field === 'estimatedEffort' || field === 'actualEffort') {
      taskData[field] = parseEffort(payload[field], field);
    } else {
      taskData[field] = payload[field];
    }
  }

  if (isCreate) {
    taskData.priority = payload.priority || 'MEDIA';
    taskData.status = payload.status || 'A_FAZER';
  }

  return taskData;
}

async function ensureProjectExists(projectId) {
  const project = await taskRepository.findProjectById(projectId);

  if (!project) {
    throw new TaskServiceError('Projeto não encontrado.', 404);
  }

  return project;
}

async function ensureTaskExists(taskId) {
  const task = await taskRepository.findTaskById(taskId);

  if (!task) {
    throw new TaskServiceError('Tarefa não encontrada.', 404);
  }

  return task;
}

function parseMetricDate(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function buildCreatedAtFilter(startDate, endDate) {
  if (startDate === undefined && endDate === undefined) {
    return undefined;
  }

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

  const createdAt = {};

  if (parsedStartDate) {
    createdAt.gte = parsedStartDate;
  }

  if (parsedEndDate) {
    const exclusiveEndDate = new Date(parsedEndDate);
    exclusiveEndDate.setDate(exclusiveEndDate.getDate() + 1);
    createdAt.lt = exclusiveEndDate;
  }

  return createdAt;
}

function buildMovedAtFilter(startDate, endDate) {
  if (startDate === undefined && endDate === undefined) {
    return undefined;
  }

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

  const movedAt = {};

  if (parsedStartDate) {
    movedAt.gte = parsedStartDate;
  }

  if (parsedEndDate) {
    const exclusiveEndDate = new Date(parsedEndDate);
    exclusiveEndDate.setDate(exclusiveEndDate.getDate() + 1);
    movedAt.lt = exclusiveEndDate;
  }

  return movedAt;
}

function parseOptionalTaskId(taskId) {
  if (taskId === undefined || taskId === '') {
    return undefined;
  }

  return parseTaskId(taskId);
}

function normalizeMovedBy(movedBy) {
  if (typeof movedBy !== 'string' || !movedBy.trim()) {
    throw new TaskServiceError('Informe o responsável pela movimentação.', 400);
  }

  return movedBy.trim();
}

function buildMovementFilters(query = {}) {
  return {
    movedAt: buildMovedAtFilter(query.startDate, query.endDate),
    taskId: parseOptionalTaskId(query.taskId),
    movedBy: normalizeOptionalText(query.movedBy) || undefined
  };
}

function formatMovement(movement) {
  return {
    id: movement.id,
    taskId: movement.taskId,
    taskTitle: movement.task?.title || null,
    fromStatus: movement.fromStatus,
    toStatus: movement.toStatus,
    movedBy: movement.movedBy,
    movedAt: movement.movedAt,
    ...(movement.sprintId ? { sprintId: movement.sprintId } : {})
  };
}

export const taskService = {
  async createTask(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const taskData = buildTaskData(data, true);
    return taskRepository.createTask(parsedProjectId, taskData);
  },

  async findTasksByProject(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    return taskRepository.findTasksByProject(parsedProjectId);
  },

  async getTaskById(taskId) {
    const parsedTaskId = parseTaskId(taskId);
    return ensureTaskExists(parsedTaskId);
  },

  async updateTask(taskId, data) {
    const parsedTaskId = parseTaskId(taskId);
    const currentTask = await ensureTaskExists(parsedTaskId);
    const taskData = buildTaskData(data);

    if (Object.keys(taskData).length === 0) {
      return currentTask;
    }

    return taskRepository.updateTask(parsedTaskId, taskData);
  },

  async updateTaskStatus(taskId, status) {
    const parsedTaskId = parseTaskId(taskId);
    await ensureTaskExists(parsedTaskId);
    validateStatus(status);

    return taskRepository.updateTaskStatus(parsedTaskId, status);
  },

  async getKanbanBoard(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const tasks = await taskRepository.findTasksByProject(parsedProjectId);
    const columns = kanbanStatuses.reduce((groupedColumns, status) => {
      groupedColumns[status] = tasks.filter((task) => task.status === status);
      return groupedColumns;
    }, {});

    return {
      projectId: parsedProjectId,
      columns,
      totals: {
        A_FAZER: columns.A_FAZER.length,
        EM_ANDAMENTO: columns.EM_ANDAMENTO.length,
        CONCLUIDO: columns.CONCLUIDO.length,
        total: tasks.length
      }
    };
  },

  async moveTask(taskId, data) {
    const parsedTaskId = parseTaskId(taskId);
    const task = await ensureTaskExists(parsedTaskId);
    await ensureProjectExists(task.projectId);

    const payload = data && typeof data === 'object' ? data : {};
    validateStatus(payload.toStatus);
    const movedBy = normalizeMovedBy(payload.movedBy);

    if (task.status === payload.toStatus) {
      throw new TaskServiceError('A tarefa já está nesta coluna.', 400);
    }

    return taskRepository.moveTask(task, {
      toStatus: payload.toStatus,
      movedBy
    });
  },

  async listMovements(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const filters = buildMovementFilters(query);
    const movements = await taskRepository.findMovementsByProject(parsedProjectId, filters);

    return {
      projectId: parsedProjectId,
      total: movements.length,
      movements: movements.map(formatMovement)
    };
  },

  async getKanbanMetrics(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const filters = buildMovementFilters(query);
    const totalMovements = await taskRepository.countMovementsByProject(
      parsedProjectId,
      filters
    );

    return {
      projectId: parsedProjectId,
      indicator: 'Fluxo de trabalho das tarefas',
      metric: 'Número de movimentações entre colunas',
      ...(query.startDate !== undefined ? { startDate: query.startDate } : {}),
      ...(query.endDate !== undefined ? { endDate: query.endDate } : {}),
      totalMovements
    };
  },

  async getTaskMetrics(projectId, startDate, endDate) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const createdAt = buildCreatedAtFilter(startDate, endDate);
    const totalTasksCreated = await taskRepository.countTasksByProject(
      parsedProjectId,
      createdAt
    );

    return {
      projectId: parsedProjectId,
      indicator: 'Volume de planejamento',
      metric: 'Quantidade de tarefas cadastradas',
      ...(startDate !== undefined ? { startDate } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      totalTasksCreated
    };
  }
};
