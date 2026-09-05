import { sprintRepository } from '../repositories/sprint.repository.js';
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { authorizationService } from '../../authorization/index.js';
import { buildSprintHistoricalSummary } from '../sprint.summary.calculator.js';
import { ERROR_CODES, resourceNotFoundError } from '../../../shared/errors/index.js';
import {
  REMOVAL_REASONS,
  SprintServiceError,
  buildSprintData,
  ensureAtLeastOneField,
  ensureDateRange,
  ensureNoOverlap,
  ensureSprintEditable,
  ensureSprintScopeMutable,
  ensureWithinTaskLimit,
  isUniqueNameViolation,
  parseProjectId,
  parseSprintId,
  parseTaskId,
  milestoneNotFoundError,
  sprintDeleteNotSupportedError,
  sprintNameConflictError,
  sprintNotFoundError,
  taskNotFoundError
} from '../sprint.schema.js';

export async function ensureProjectExists(projectId) {
  const project = await sprintRepository.findProjectById(projectId);
  if (!project) throw resourceNotFoundError('Project');
  return project;
}

export async function ensureSprintExists(sprintId) {
  const sprint = await sprintRepository.findById(sprintId);
  if (!sprint) throw sprintNotFoundError();
  return sprint;
}

async function withHistoricalSummaries(sprints) {
  const terminal = sprints.filter((sprint) => ['CONCLUIDA', 'CANCELADA'].includes(sprint.status));
  const history = terminal.length
    ? await sprintRepository.findHistoryBySprints(terminal.map((sprint) => sprint.id))
    : [];
  const bySprint = new Map();
  for (const participation of history) {
    if (!bySprint.has(participation.sprintId)) bySprint.set(participation.sprintId, []);
    bySprint.get(participation.sprintId).push(participation);
  }
  return sprints.map((sprint) => ({
    ...sprint,
    historicalSummary: buildSprintHistoricalSummary(sprint, bySprint.get(sprint.id))
  }));
}

async function rejectForeignTask(task, actorUserId) {
  if (!(await authorizationService.actorSeesProject(task.projectId, actorUserId))) {
    throw taskNotFoundError();
  }
  throw new SprintServiceError(
    'A tarefa informada não pertence ao mesmo projeto da sprint.',
    400,
    ERROR_CODES.TASK_SPRINT_PROJECT_MISMATCH
  );
}

async function ensureSprintMilestone(milestoneId, projectId, context = {}) {
  if (milestoneId === undefined || milestoneId === null) return null;
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw milestoneNotFoundError();
  if (milestone.projectId !== projectId) {
    if (!(await authorizationService.actorSeesProject(milestone.projectId, context.actorUserId))) {
      throw milestoneNotFoundError();
    }
    throw new SprintServiceError(
      'O marco informado não pertence ao mesmo projeto da sprint.',
      400,
      ERROR_CODES.SPRINT_MILESTONE_PROJECT_MISMATCH
    );
  }
  return milestone;
}

function ensureMilestoneStillThere(milestoneId, milestones) {
  if (milestoneId === undefined || milestoneId === null) return;
  if (!milestones.some((milestone) => milestone.id === milestoneId)) {
    throw milestoneNotFoundError();
  }
}

export async function buildScopePlan({
  mode,
  audit,
  sprintId,
  requestedIds,
  occurredAt,
  context,
  sprint,
  participations,
  tasks,
  activeElsewhere
}) {
  ensureSprintScopeMutable(sprint);

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  if (mode !== 'detach') {
    if (requestedIds.some((taskId) => !taskById.has(taskId))) throw taskNotFoundError();
    const foreign = requestedIds
      .map((taskId) => taskById.get(taskId))
      .find((task) => task.projectId !== sprint.projectId);
    if (foreign) await rejectForeignTask(foreign, context.actorUserId);
  }

  const active = participations.filter((participacao) => participacao.removedAt === null);
  const inside = active.map((participacao) => participacao.taskId).filter(Boolean);

  const target =
    mode === 'replace'
      ? requestedIds
      : mode === 'attach'
        ? [...new Set([...inside, ...requestedIds])]
        : inside.filter((taskId) => !requestedIds.includes(taskId));

  ensureWithinTaskLimit(target.length);

  const toAttach = target.filter((taskId) => !inside.includes(taskId));
  const toDetach = inside.filter((taskId) => !target.includes(taskId));

  const participationByTask = new Map(
    participations.map((participacao) => [participacao.taskId, participacao])
  );
  const vivaPorTarefa = new Map();
  const congeladaPorTarefa = new Map();
  for (const participacao of activeElsewhere) {
    const alvo = participacao.closedAt === null ? vivaPorTarefa : congeladaPorTarefa;
    alvo.set(participacao.taskId, participacao);
  }

  const historyEntry = (taskId, fromValue, toValue) => ({
    projectId: sprint.projectId,
    taskId,
    actorUserId: context.actorUserId,
    field: 'SPRINT',
    fromValue,
    toValue
  });

  const close = [];
  const open = [];
  const historyEntries = [];

  for (const taskId of toDetach) {
    const participacao = participationByTask.get(taskId);
    close.push({
      id: participacao.id,
      at: occurredAt,
      reason: REMOVAL_REASONS.REMOVIDA,
      exitStatus: taskById.get(taskId)?.status ?? null
    });
    historyEntries.push(historyEntry(taskId, String(sprintId), null));
  }

  for (const taskId of toAttach) {
    const viva = vivaPorTarefa.get(taskId) ?? null;
    if (viva) {
      close.push({
        id: viva.id,
        at: occurredAt,
        reason: REMOVAL_REASONS.MOVIDA,
        exitStatus: taskById.get(taskId)?.status ?? null
      });
    }
    const origem = viva ?? congeladaPorTarefa.get(taskId) ?? null;
    const existing = participationByTask.get(taskId) ?? null;
    open.push({
      id: existing?.id ?? null,
      taskId,
      taskTitleSnapshot: taskById.get(taskId)?.title ?? '',
      addedAt: occurredAt,
      addedAfterStart: sprint.planningSnapshotAt
        ? existing?.plannedAtStart !== true
        : (existing?.addedAfterStart ?? sprint.startedAt !== null),
      carriedFromSprintId: origem ? origem.sprintId : (existing?.carriedFromSprintId ?? null)
    });
    historyEntries.push(
      historyEntry(taskId, origem ? String(origem.sprintId) : null, String(sprintId))
    );
  }

  return {
    close,
    open,
    detachTaskIds: toDetach,
    attachTaskIds: toAttach,
    historyEntries,
    auditEvent: audit
      ? buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: sprint.projectId,
          requestId: context.requestId,
          action: audit.action,
          resourceType: 'Sprint',
          resourceId: sprintId,
          metadata: {
            sprintId,
            ...audit.metadata,
            attached: toAttach.length,
            detached: toDetach.length
          }
        })
      : null
  };
}

async function mutateScope(sprint, requestedIds, mode, context, audit) {
  const sprintId = sprint.id;
  const tasks = await sprintRepository.mutateScopeWithinSprintLock(
    sprintId,
    sprint.projectId,
    requestedIds,
    (snapshot) =>
      buildScopePlan({
        mode,
        audit,
        sprintId,
        requestedIds,
        occurredAt: new Date(),
        context,
        ...snapshot
      })
  );
  if (tasks === null) throw sprintNotFoundError();
  return tasks;
}

export const sprintCrudService = {
  async createSprint(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const sprintData = buildSprintData(data, true);
    ensureDateRange(sprintData.startDate, sprintData.endDate);
    await ensureSprintMilestone(sprintData.milestoneId, parsedProjectId, context);
    try {
      return await sprintRepository.createWithinProjectLock(
        parsedProjectId,
        sprintData,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: parsedProjectId,
          requestId: context.requestId,
          action: 'SPRINT_CREATED',
          resourceType: 'Sprint'
        }),
        ({ sprints, milestones }) => {
          ensureNoOverlap(sprintData, sprints);
          ensureMilestoneStillThere(sprintData.milestoneId, milestones);
        }
      );
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  async findSprintsByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const sprints = await sprintRepository.findByProject(parsedProjectId, {
      status: query.status,
      search: query.search
    });
    return withHistoricalSummaries(sprints);
  },

  async getSprintById(sprintId) {
    const sprint = await ensureSprintExists(parseSprintId(sprintId));
    return (await withHistoricalSummaries([sprint]))[0];
  },

  async updateSprint(sprintId, data, context = {}) {
    const id = parseSprintId(sprintId);
    const current = await ensureSprintExists(id);
    const sprintData = ensureAtLeastOneField(
      buildSprintData(data),
      'Informe ao menos um campo para atualizar a sprint.'
    );
    if (sprintData.startDate && sprintData.endDate) {
      ensureDateRange(sprintData.startDate, sprintData.endDate);
    }
    if (sprintData.milestoneId !== undefined) {
      await ensureSprintMilestone(sprintData.milestoneId, current.projectId, context);
    }

    try {
      const sprint = await sprintRepository.updateWithinProjectLock(
        id,
        current.projectId,
        sprintData,
        buildAuditEvent({
          actorUserId: context.actorUserId,
          projectId: current.projectId,
          requestId: context.requestId,
          action: 'SPRINT_UPDATED',
          resourceType: 'Sprint',
          resourceId: id,
          metadata: { sprintId: id }
        }),
        ({ sprints, sprint: locked, milestones }) => {
          if (!locked) throw sprintNotFoundError();
          ensureSprintEditable(locked);
          const startDate = sprintData.startDate ?? locked.startDate;
          const endDate = sprintData.endDate ?? locked.endDate;
          ensureDateRange(startDate, endDate);
          ensureNoOverlap({ startDate, endDate }, sprints, id);
          ensureMilestoneStillThere(sprintData.milestoneId, milestones);
        }
      );
      if (sprint === null) throw sprintNotFoundError();
      return sprint;
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  async deleteSprint() {
    throw sprintDeleteNotSupportedError();
  },

  async findTasksBySprint(sprintId) {
    const id = parseSprintId(sprintId);
    await ensureSprintExists(id);
    return sprintRepository.findTasksBySprint(id);
  },

  async replaceTasks(sprintId, taskIds = [], context = {}) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);
    const requestedIds = [...new Set(taskIds.map((value) => parseTaskId(value)))];
    ensureWithinTaskLimit(requestedIds.length);
    const tasks = await mutateScope(sprint, requestedIds, 'replace', context, {
      action: 'SPRINT_TASKS_REPLACED',
      metadata: {}
    });
    return { sprintId: id, tasks };
  },

  async attachTaskToSprint(sprintId, taskId, context = {}) {
    const id = parseSprintId(sprintId);
    const task = parseTaskId(taskId);
    const sprint = await ensureSprintExists(id);
    return mutateScope(sprint, [task], 'attach', context, {
      action: 'TASK_SPRINT_LINKED',
      metadata: { taskId: task }
    });
  },

  async detachTaskFromSprint(sprintId, taskId, context = {}) {
    const id = parseSprintId(sprintId);
    const task = parseTaskId(taskId);
    const sprint = await ensureSprintExists(id);
    return mutateScope(sprint, [task], 'detach', context, {
      action: 'TASK_SPRINT_UNLINKED',
      metadata: { taskId: task }
    });
  }
};
