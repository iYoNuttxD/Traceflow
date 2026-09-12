import { prisma } from '../../../database/prismaClient.js';
import { lockProject } from '../../../database/locks.js';
import { auditRepository } from '../../audit/audit.repository.js';

const actorSelect = { select: { id: true, name: true } };

export const timeEntrySelect = {
  id: true,
  taskId: true,
  projectId: true,
  source: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  note: true,
  startedById: true,
  endedById: true,
  createdAt: true,
  updatedAt: true,
  startedBy: actorSelect,
  endedBy: actorSelect
};

const completedWhere = (taskId) => ({ taskId, endedAt: { not: null } });

// Serializa as mutações da mesma tarefa: dois "iniciar" concorrentes leriam
// "nenhuma sessão em andamento" e abririam duas sessões sem a trava de linha.
//
// O Project vem antes da Task porque é a ordem que Planning usa (Project → Sprint →
// Task) e porque gravar uma sessão trava o Project pela FK de qualquer forma: subir
// a Task primeiro fechava o ciclo e derrubava o cronômetro com deadlock sempre que
// uma transição de sprint corria junto.
async function lockProjectThenTask(tx, projectId, taskId) {
  if (projectId != null) await lockProject(tx, projectId);
  const rows = await tx.$queryRaw`SELECT id FROM Task WHERE id = ${taskId} FOR UPDATE`;
  return rows.length > 0;
}

const hoursFromSeconds = (seconds) => Math.round(seconds / 36) / 100;

// `legacyActualEffort` guarda o esforço lançado antes das sessões existirem; ele
// entra no total para que o primeiro registro não apague o histórico da tarefa.
async function summarize(client, taskId) {
  const [aggregate, task] = await Promise.all([
    client.taskTimeEntry.aggregate({
      where: completedWhere(taskId),
      _sum: { durationSeconds: true },
      _count: { id: true }
    }),
    client.task.findUnique({ where: { id: taskId }, select: { legacyActualEffort: true } })
  ]);
  return {
    completedSeconds: aggregate._sum.durationSeconds || 0,
    completedCount: aggregate._count.id,
    legacySeconds: Math.round((task?.legacyActualEffort ?? 0) * 3600)
  };
}

// Task.actualEffort é derivado: esforço herdado somado às sessões encerradas.
async function recalculateActualEffort(tx, taskId) {
  const totals = await summarize(tx, taskId);
  const totalSeconds = totals.completedSeconds + totals.legacySeconds;
  const known = totals.completedCount > 0 || totals.legacySeconds > 0;
  const actualEffort = known ? hoursFromSeconds(totalSeconds) : null;
  await tx.task.update({ where: { id: taskId }, data: { actualEffort } });
  return { ...totals, actualEffort };
}

async function appendEffortHistory(tx, entry, eventType, actorUserId, previousSeconds = null) {
  await tx.taskEffortHistoryEntry.create({
    data: {
      projectId: entry.projectId,
      taskId: entry.taskId,
      sessionId: entry.id,
      eventType,
      source: entry.source,
      actorUserId,
      previousSeconds,
      newSeconds: eventType === 'DELETED' ? null : entry.durationSeconds,
      snapshotStartedAt: entry.startedAt,
      snapshotEndedAt: entry.endedAt
    }
  });
}

export function createTaskTimeEntryRepository(client = prisma) {
  return {
    listHistoryPage(taskId, { skip, take, from, to, source, eventType }) {
      const where = {
        taskId,
        ...(source ? { source } : {}),
        ...(eventType ? { eventType } : {}),
        ...(from || to
          ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {})
      };
      return client.$transaction(
        async (tx) => {
          const total = await tx.taskEffortHistoryEntry.count({ where });
          const items = await tx.taskEffortHistoryEntry.findMany({
            where,
            include: { actor: actorSelect },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            skip,
            take
          });
          const sessions = await tx.taskTimeEntry.findMany({
            where: { taskId, id: { in: items.map((row) => row.sessionId) } },
            select: timeEntrySelect
          });
          return { total, items, sessions };
        },
        { isolationLevel: 'RepeatableRead' }
      );
    },

    async updateAtomic(
      taskId,
      entryId,
      { projectId, durationSeconds, expectedUpdatedAt, actorUserId }
    ) {
      return client.$transaction(async (tx) => {
        if (!(await lockProjectThenTask(tx, projectId, taskId)))
          return { outcome: 'TASK_NOT_FOUND' };
        const existing = await tx.taskTimeEntry.findFirst({
          where: { id: entryId, taskId },
          select: timeEntrySelect
        });
        if (!existing) return { outcome: 'NOT_FOUND' };
        if (
          !existing.endedAt ||
          existing.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
        )
          return { outcome: 'CONFLICT' };
        const entry =
          existing.durationSeconds === durationSeconds
            ? existing
            : await tx.taskTimeEntry.update({
                where: { id: entryId },
                data: {
                  durationSeconds,
                  updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1))
                },
                select: timeEntrySelect
              });
        if (entry !== existing)
          await appendEffortHistory(tx, entry, 'UPDATED', actorUserId, existing.durationSeconds);
        const totals = await recalculateActualEffort(tx, taskId);
        const running = await tx.taskTimeEntry.findFirst({
          where: { taskId, endedAt: null },
          select: timeEntrySelect
        });
        return { outcome: 'UPDATED', entry, running, ...totals };
      });
    },

    findRunning(taskId) {
      return client.taskTimeEntry.findFirst({
        where: { taskId, endedAt: null },
        select: timeEntrySelect
      });
    },

    // Página do histórico filtrada por período de encerramento e origem; a contagem
    // acompanha o mesmo filtro para a paginação do diálogo ser exata.
    listCompletedPage(taskId, { skip, take, from, to, source }) {
      const where = {
        ...completedWhere(taskId),
        ...(source ? { source } : {}),
        ...(from || to
          ? { endedAt: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {})
      };
      return client.$transaction([
        client.taskTimeEntry.count({ where }),
        client.taskTimeEntry.findMany({
          where,
          select: timeEntrySelect,
          orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
          skip,
          take
        })
      ]);
    },

    summarizeCompleted(taskId) {
      return summarize(client, taskId);
    },

    findById(taskId, entryId) {
      return client.taskTimeEntry.findFirst({
        where: { id: entryId, taskId },
        select: timeEntrySelect
      });
    },

    async startAtomic({ projectId, taskId, startedById, startedAt }, auditEvent) {
      return client.$transaction(async (tx) => {
        if (!(await lockProjectThenTask(tx, projectId, taskId)))
          return { outcome: 'TASK_NOT_FOUND' };
        const running = await tx.taskTimeEntry.findFirst({
          where: { taskId, endedAt: null },
          select: timeEntrySelect
        });
        if (running) return { outcome: 'ALREADY_RUNNING', entry: running };
        const entry = await tx.taskTimeEntry.create({
          data: { projectId, taskId, source: 'TIMER', startedAt, startedById },
          select: timeEntrySelect
        });
        if (auditEvent)
          await auditRepository.create({ ...auditEvent, resourceId: String(entry.id) }, tx);
        // Totais saem da própria transação: uma leitura posterior que falhasse
        // transformaria uma escrita já confirmada em erro para quem chamou.
        const totals = await summarize(tx, taskId);
        return { outcome: 'STARTED', entry, running: entry, ...totals };
      });
    },

    async stopAtomic(taskId, { projectId, endedById, endedAt }, buildAuditEvent) {
      return client.$transaction(async (tx) => {
        if (!(await lockProjectThenTask(tx, projectId, taskId)))
          return { outcome: 'TASK_NOT_FOUND' };
        const running = await tx.taskTimeEntry.findFirst({
          where: { taskId, endedAt: null },
          select: { id: true, startedAt: true }
        });
        if (!running) return { outcome: 'NOT_RUNNING' };
        const durationSeconds = Math.max(
          0,
          Math.round((endedAt.getTime() - running.startedAt.getTime()) / 1000)
        );
        const entry = await tx.taskTimeEntry.update({
          where: { id: running.id },
          data: { endedAt, endedById, durationSeconds },
          select: timeEntrySelect
        });
        await appendEffortHistory(tx, entry, 'CREATED', endedById);
        const totals = await recalculateActualEffort(tx, taskId);
        const auditEvent = buildAuditEvent?.(entry);
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return { outcome: 'STOPPED', entry, running: null, ...totals };
      });
    },

    async createManualAtomic(data, auditEvent) {
      return client.$transaction(async (tx) => {
        if (!(await lockProjectThenTask(tx, data.projectId, data.taskId)))
          return { outcome: 'TASK_NOT_FOUND' };
        const entry = await tx.taskTimeEntry.create({
          data: { ...data, source: 'MANUAL' },
          select: timeEntrySelect
        });
        await appendEffortHistory(tx, entry, 'CREATED', data.endedById);
        const totals = await recalculateActualEffort(tx, data.taskId);
        if (auditEvent)
          await auditRepository.create({ ...auditEvent, resourceId: String(entry.id) }, tx);
        const running = await tx.taskTimeEntry.findFirst({
          where: { taskId: data.taskId, endedAt: null },
          select: timeEntrySelect
        });
        return { outcome: 'CREATED', entry, running, ...totals };
      });
    },

    async deleteAtomic(taskId, entryId, auditEvent, projectId) {
      return client.$transaction(async (tx) => {
        if (!(await lockProjectThenTask(tx, projectId, taskId)))
          return { outcome: 'TASK_NOT_FOUND' };
        const existing = await tx.taskTimeEntry.findFirst({
          where: { id: entryId, taskId },
          select: timeEntrySelect
        });
        if (!existing) return { outcome: 'NOT_FOUND' };
        const result = await tx.taskTimeEntry.deleteMany({ where: { id: entryId, taskId } });
        if (result.count === 0) return { outcome: 'NOT_FOUND' };
        await appendEffortHistory(
          tx,
          existing,
          'DELETED',
          auditEvent?.actorUserId,
          existing.durationSeconds
        );
        const totals = await recalculateActualEffort(tx, taskId);
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        const running = await tx.taskTimeEntry.findFirst({
          where: { taskId, endedAt: null },
          select: timeEntrySelect
        });
        return { outcome: 'DELETED', running, ...totals };
      });
    }
  };
}
export const taskTimeEntryRepository = createTaskTimeEntryRepository();
