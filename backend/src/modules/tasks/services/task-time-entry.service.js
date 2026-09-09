import { taskTimeEntryRepository } from '../repositories/task-time-entry.repository.js';
import { TaskServiceError, parseTaskId } from '../task.schema.js';
import { ensureTaskExists } from '../task.service-support.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { resourceNotFoundError } from '../../../shared/errors/index.js';
import { logger } from '../../../shared/logger/index.js';
import { PROJECT_EVENT_TYPES, projectEventPublisher } from '../../../shared/events/index.js';
import {
  buildEffortSummary,
  canModerateTaskTimeEntries,
  canOperateTaskTimer,
  formatTaskTimeEntry
} from './task-time-entry.presenter.js';

export const TASK_TIME_ENTRY_DEFAULT_LIMIT = 20;
export const TASK_TIME_ENTRY_MAX_LIMIT = 100;
export const MANUAL_ENTRY_MAX_HOURS = 24;
// Tolerância para relógios de cliente levemente adiantados.
const FUTURE_TOLERANCE_MS = 5 * 60_000;

function parseEntryId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskServiceError('ID da sessão de tempo inválido.', 400);
  }
  return parsed;
}

function parseLimit(value) {
  const limit = value == null ? TASK_TIME_ENTRY_DEFAULT_LIMIT : Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > TASK_TIME_ENTRY_MAX_LIMIT) {
    throw new TaskServiceError(
      `limit deve ser um inteiro entre 1 e ${TASK_TIME_ENTRY_MAX_LIMIT}.`,
      400
    );
  }
  return limit;
}

function parsePage(value) {
  const page = value == null ? 1 : Number(value);
  if (!Number.isSafeInteger(page) || page <= 0) {
    throw new TaskServiceError('page deve ser um inteiro maior ou igual a 1.', 400);
  }
  return page;
}

// Limites por dia civil em UTC, o mesmo recorte usado pelo histórico de auditoria.
function parseDateBound(value, endOfDay) {
  if (!value) return undefined;
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
}

function parseOccurredAt(value, now) {
  if (value === undefined || value === null || value === '') return now;
  const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TaskServiceError('Data do lançamento inválida.', 400);
  }
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new TaskServiceError('A data do lançamento não pode estar no futuro.', 400);
  }
  return date;
}

function parseManualEntry(data, now = new Date()) {
  const raw = typeof data?.hours === 'string' ? data.hours.replace(',', '.') : data?.hours;
  const hours = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(hours) || hours <= 0) {
    throw new TaskServiceError('Informe as horas do lançamento manual (maior que zero).', 400);
  }
  if (hours > MANUAL_ENTRY_MAX_HOURS) {
    throw new TaskServiceError(
      `Um lançamento manual deve ter no máximo ${MANUAL_ENTRY_MAX_HOURS} horas.`,
      400
    );
  }
  const durationSeconds = Math.round(hours * 3600);
  const endedAt = parseOccurredAt(data?.occurredAt, now);
  const note = typeof data?.note === 'string' && data.note.trim() ? data.note.trim() : null;
  return {
    durationSeconds,
    note,
    endedAt,
    startedAt: new Date(endedAt.getTime() - durationSeconds * 1000)
  };
}

function ensureCanOperate(context) {
  if (!canOperateTaskTimer(context.membershipRole)) {
    throw new TaskServiceError('Você não possui permissão para registrar tempo nesta tarefa.', 403);
  }
}

function entryAuditEvent(action, { task, entryId, context, metadata }) {
  return buildAuditEvent({
    actorUserId: context.actorUserId,
    projectId: task.projectId,
    requestId: context.requestId,
    action,
    resourceType: 'TaskTimeEntry',
    resourceId: entryId ?? null,
    metadata: { taskId: task.id, ...metadata }
  });
}

async function publishEffortEvent(type, task, data) {
  try {
    await projectEventPublisher.publish({
      type,
      projectId: task.projectId,
      taskId: task.id,
      occurredAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    logger.warn('Sessão de tempo persistida sem propagação pelo stream do projeto.', {
      event: 'project_event_publish_failed',
      type,
      projectId: task.projectId,
      taskId: task.id,
      error: { name: error?.name || 'Error' }
    });
  }
}

function summaryFor(task, totals, running) {
  return buildEffortSummary({
    estimatedHours: task.estimatedEffort,
    completedSeconds: totals.completedSeconds,
    completedCount: totals.completedCount,
    running
  });
}

export const taskTimeEntryService = {
  async listTaskTimeEntries(taskId, query = {}, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const limit = parseLimit(query.limit);
    const page = parsePage(query.page);
    const [running, [total, rows], totals] = await Promise.all([
      taskTimeEntryRepository.findRunning(id),
      taskTimeEntryRepository.listCompletedPage(id, {
        skip: (page - 1) * limit,
        take: limit,
        from: parseDateBound(query.startDate, false),
        to: parseDateBound(query.endDate, true),
        source: query.source || undefined
      }),
      taskTimeEntryRepository.summarizeCompleted(id)
    ]);
    return {
      taskId: id,
      running: running ? formatTaskTimeEntry(running, context) : null,
      entries: rows.map((entry) => formatTaskTimeEntry(entry, context)),
      // O resumo de esforço ignora os filtros: é sempre o total da tarefa.
      effort: summaryFor(task, totals, running),
      permissions: {
        canOperate: canOperateTaskTimer(context.membershipRole),
        canModerate: canModerateTaskTimeEntries(context.membershipRole)
      },
      pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 }
    };
  },

  async startTaskTimer(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    ensureCanOperate(context);
    const result = await taskTimeEntryRepository.startAtomic(
      {
        projectId: task.projectId,
        taskId: id,
        startedById: context.actorUserId,
        startedAt: new Date()
      },
      entryAuditEvent('TASK_TIMER_STARTED', { task, context, metadata: { source: 'TIMER' } })
    );
    if (result.outcome === 'TASK_NOT_FOUND') throw resourceNotFoundError('Task');
    if (result.outcome === 'ALREADY_RUNNING') {
      throw new TaskServiceError('Já existe uma sessão de tempo em andamento nesta tarefa.', 409);
    }
    const totals = await taskTimeEntryRepository.summarizeCompleted(id);
    const effort = summaryFor(task, totals, result.entry);
    await publishEffortEvent(PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_STARTED, task, {
      entry: result.entry,
      effort
    });
    return { entry: formatTaskTimeEntry(result.entry, context), effort };
  },

  async stopTaskTimer(taskId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    ensureCanOperate(context);
    const result = await taskTimeEntryRepository.stopAtomic(
      id,
      { endedById: context.actorUserId, endedAt: new Date() },
      (entry) =>
        entryAuditEvent('TASK_TIMER_STOPPED', {
          task,
          entryId: entry.id,
          context,
          metadata: { source: 'TIMER', durationSeconds: entry.durationSeconds }
        })
    );
    if (result.outcome === 'TASK_NOT_FOUND') throw resourceNotFoundError('Task');
    if (result.outcome === 'NOT_RUNNING') {
      throw new TaskServiceError('Nenhuma sessão de tempo em andamento nesta tarefa.', 409);
    }
    const effort = summaryFor(task, result, null);
    await publishEffortEvent(PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_STOPPED, task, {
      entry: result.entry,
      effort
    });
    return { entry: formatTaskTimeEntry(result.entry, context), effort };
  },

  async createManualTaskTimeEntry(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    ensureCanOperate(context);
    const manual = parseManualEntry(data);
    const result = await taskTimeEntryRepository.createManualAtomic(
      {
        projectId: task.projectId,
        taskId: id,
        startedById: context.actorUserId,
        endedById: context.actorUserId,
        ...manual
      },
      entryAuditEvent('TASK_TIME_ENTRY_CREATED', {
        task,
        context,
        metadata: { source: 'MANUAL', durationSeconds: manual.durationSeconds }
      })
    );
    if (result.outcome === 'TASK_NOT_FOUND') throw resourceNotFoundError('Task');
    const running = await taskTimeEntryRepository.findRunning(id);
    const effort = summaryFor(task, result, running);
    await publishEffortEvent(PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_CREATED, task, {
      entry: result.entry,
      effort
    });
    return { entry: formatTaskTimeEntry(result.entry, context), effort };
  },

  async deleteTaskTimeEntry(taskId, entryId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const parsedEntryId = parseEntryId(entryId);
    const existing = await taskTimeEntryRepository.findById(id, parsedEntryId);
    if (!existing) throw new TaskServiceError('Sessão de tempo não encontrada.', 404);
    const own = existing.startedById === context.actorUserId;
    if (
      !(own && canOperateTaskTimer(context.membershipRole)) &&
      !canModerateTaskTimeEntries(context.membershipRole)
    ) {
      throw new TaskServiceError(
        'Você não possui permissão para excluir esta sessão de tempo.',
        403
      );
    }
    const result = await taskTimeEntryRepository.deleteAtomic(
      id,
      parsedEntryId,
      entryAuditEvent('TASK_TIME_ENTRY_DELETED', {
        task,
        entryId: parsedEntryId,
        context,
        metadata: { source: existing.source, durationSeconds: existing.durationSeconds }
      })
    );
    if (result.outcome === 'TASK_NOT_FOUND') throw resourceNotFoundError('Task');
    if (result.outcome === 'NOT_FOUND') {
      throw new TaskServiceError('Sessão de tempo não encontrada.', 404);
    }
    const running = existing.endedAt ? await taskTimeEntryRepository.findRunning(id) : null;
    const effort = summaryFor(task, result, running);
    await publishEffortEvent(PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_DELETED, task, {
      entry: existing,
      effort
    });
    return { entry: formatTaskTimeEntry(existing, context), effort };
  }
};
