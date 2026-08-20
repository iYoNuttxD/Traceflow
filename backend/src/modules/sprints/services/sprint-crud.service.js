// Casos de uso de CRUD e de escopo da sprint. Regras de negocio vivem aqui,
// nunca no controller e nunca no repository — o repository so garante que elas
// rodem sobre um retrato travado, dentro da transacao que escreve.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { authorizationService } from '../../authorization/index.js';
import { ERROR_CODES, resourceNotFoundError } from '../../../shared/errors/index.js';
import {
  REMOVAL_REASONS,
  SprintServiceError,
  buildSprintData,
  ensureAtLeastOneField,
  ensureDateRange,
  ensureMilestonesStayWithinWindow,
  ensureNoOverlap,
  ensureSprintEditable,
  ensureSprintScopeMutable,
  ensureWithinTaskLimit,
  isUniqueNameViolation,
  parseProjectId,
  parseSprintId,
  parseTaskId,
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

// A tarefa de outro projeto nao pode revelar que existe. Responder 400 para
// "existe em outro projeto" e 404 para "nao existe" faria deste endpoint um
// oraculo: iterando o ID, um membro mapearia tarefas de projetos a que nao tem
// acesso. O erro informativo fica so para quem ja enxerga o outro projeto.
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

// Traduz o conjunto desejado em entradas e saidas de participacao.
//
// `mode` decide como o alvo e formado, mas o resto e identico nos tres caminhos:
// substituir o conjunto (painel do cronograma), acrescentar uma tarefa ou
// remove-la (endpoints do lado da tarefa). Um caminho unico e o que impede que
// `PATCH /tasks/:id/sprint` e `PUT /sprints/:id/tasks` divirjam no historico.
async function buildScopePlan({
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
  // Revalidado com a sprint travada: o status lido antes da transacao pode ter
  // mudado entre a leitura e a escrita.
  ensureSprintScopeMutable(sprint);

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  if (mode !== 'detach') {
    if (requestedIds.some((taskId) => !taskById.has(taskId))) throw taskNotFoundError();
    // Nunca confiar no projectId do frontend: comparar com o registro persistido.
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
  const elsewhereByTask = new Map(
    activeElsewhere.map((participacao) => [participacao.taskId, participacao])
  );

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
    // A tarefa pode vir de outra sprint. Se aquela ainda esta aberta, a saida e
    // registrada com o status de saida. Se ja foi encerrada, a participacao la
    // esta congelada e NAO e tocada: reescreve-la com o status de hoje mudaria
    // retroativamente o resultado de um periodo fechado — exatamente o que a
    // continuidade entre sprints existe para evitar. O vinculo de origem e
    // preservado nos dois casos.
    const previous = elsewhereByTask.get(taskId) ?? null;
    if (previous && previous.closedAt === null) {
      close.push({
        id: previous.id,
        at: occurredAt,
        reason: REMOVAL_REASONS.MOVIDA,
        exitStatus: taskById.get(taskId)?.status ?? null
      });
    }
    const existing = participationByTask.get(taskId) ?? null;
    open.push({
      id: existing?.id ?? null,
      taskId,
      taskTitleSnapshot: taskById.get(taskId)?.title ?? '',
      // Reentrada preserva a entrada original: "saiu e voltou" nao e uma
      // inclusao nova, e recarimbar `addedAfterStart` inventaria mudanca de
      // escopo que nao houve.
      addedAt: existing?.addedAt ?? occurredAt,
      addedAfterStart: existing ? existing.addedAfterStart : sprint.startedAt !== null,
      carriedFromSprintId: previous ? previous.sprintId : (existing?.carriedFromSprintId ?? null)
    });
    // Mesma convencao ja documentada: a troca A -> B e uma unica entrada,
    // nunca uma saida seguida de uma entrada.
    historyEntries.push(
      historyEntry(taskId, previous ? String(previous.sprintId) : null, String(sprintId))
    );
  }

  return {
    close,
    open,
    detachTaskIds: toDetach,
    attachTaskIds: toAttach,
    historyEntries,
    // O caminho de escrita e unico, mas a trilha de auditoria continua dizendo
    // QUAL operacao o usuario pediu: "associou uma tarefa" e "substituiu o
    // escopo da sprint" sao fatos diferentes para quem audita depois.
    auditEvent: buildAuditEvent({
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
  };
}

async function mutateScope(sprintId, requestedIds, mode, context, audit) {
  const occurredAt = new Date();
  const tasks = await sprintRepository.mutateScopeWithinSprintLock(
    sprintId,
    requestedIds,
    (snapshot) =>
      buildScopePlan({ mode, audit, sprintId, requestedIds, occurredAt, context, ...snapshot })
  );
  // null significa que a sprint sumiu entre a checagem e o lock.
  if (tasks === null) throw sprintNotFoundError();
  return tasks;
}

export const sprintCrudService = {
  async createSprint(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const sprintData = buildSprintData(data, true);
    ensureDateRange(sprintData.startDate, sprintData.endDate);
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
        ({ sprints }) => ensureNoOverlap(sprintData, sprints)
      );
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  async findSprintsByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return sprintRepository.findByProject(parsedProjectId, {
      status: query.status,
      search: query.search
    });
  },

  async getSprintById(sprintId) {
    return ensureSprintExists(parseSprintId(sprintId));
  },

  async updateSprint(sprintId, data, context = {}) {
    const id = parseSprintId(sprintId);
    // A leitura de fora da transacao resolve o 404 cedo e diz qual projeto travar.
    // Nada mais: as datas que decidem a janela final vem do registro relido sob
    // lock. Completar um lado do intervalo com o valor lido aqui deixava duas
    // atualizacoes parciais simultaneas — uma so do inicio, outra so do fim —
    // validarem contra o mesmo retrato antigo e gravarem uma janela invertida.
    const current = await ensureSprintExists(id);
    const sprintData = ensureAtLeastOneField(
      buildSprintData(data),
      'Informe ao menos um campo para atualizar a sprint.'
    );
    // Janela inteiramente informada nao depende do persistido: pode falhar aqui,
    // com 400 e sem abrir transacao. Janela parcial, nao — o complemento dela so e
    // confiavel depois do lock.
    if (sprintData.startDate && sprintData.endDate) {
      ensureDateRange(sprintData.startDate, sprintData.endDate);
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
          // Status E datas vem do retrato travado, nao da leitura anterior: entre
          // uma e outra a sprint pode ter sido encerrada ou ter tido a outra ponta
          // do intervalo movida por outra requisicao.
          if (!locked) throw sprintNotFoundError();
          ensureSprintEditable(locked);
          const startDate = sprintData.startDate ?? locked.startDate;
          const endDate = sprintData.endDate ?? locked.endDate;
          ensureDateRange(startDate, endDate);
          ensureNoOverlap({ startDate, endDate }, sprints, id);
          ensureMilestonesStayWithinWindow(milestones, locked, { startDate, endDate });
        }
      );
      // null significa que a sprint sumiu entre a checagem e o lock.
      if (sprint === null) throw sprintNotFoundError();
      return sprint;
    } catch (error) {
      if (isUniqueNameViolation(error)) throw sprintNameConflictError();
      throw error;
    }
  },

  // Sprint nao e excluida em nenhum estado (ADR-010 D06). A rota continua
  // registrada e recusa explicitamente: removida, ela devolveria 404, que se
  // confunde com "sprint nao existe". A recusa acontece antes de qualquer
  // leitura ou mutacao, o que elimina tambem a corrida entre contar tarefas e
  // apagar a sprint.
  async deleteSprint() {
    throw sprintDeleteNotSupportedError();
  },

  async findTasksBySprint(sprintId) {
    const id = parseSprintId(sprintId);
    await ensureSprintExists(id);
    return sprintRepository.findTasksBySprint(id);
  },

  // Substituicao do conjunto de tarefas da sprint (PUT /sprints/:id/tasks).
  async replaceTasks(sprintId, taskIds = [], context = {}) {
    const id = parseSprintId(sprintId);
    await ensureSprintExists(id);
    const requestedIds = [...new Set(taskIds.map((value) => parseTaskId(value)))];
    ensureWithinTaskLimit(requestedIds.length);
    const tasks = await mutateScope(id, requestedIds, 'replace', context, {
      action: 'SPRINT_TASKS_REPLACED',
      metadata: {}
    });
    return { sprintId: id, tasks };
  },

  // Entrada e saida pelo lado da tarefa. Passam pelo mesmo plano da substituicao
  // para que os dois caminhos produzam exatamente o mesmo historico.
  async attachTaskToSprint(sprintId, taskId, context = {}) {
    const id = parseSprintId(sprintId);
    const task = parseTaskId(taskId);
    return mutateScope(id, [task], 'attach', context, {
      action: 'TASK_SPRINT_LINKED',
      metadata: { taskId: task }
    });
  },

  async detachTaskFromSprint(sprintId, taskId, context = {}) {
    const id = parseSprintId(sprintId);
    const task = parseTaskId(taskId);
    return mutateScope(id, [task], 'detach', context, {
      action: 'TASK_SPRINT_UNLINKED',
      metadata: { taskId: task }
    });
  }
};
