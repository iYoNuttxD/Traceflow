import { Prisma } from '@prisma/client';
import { prisma } from '../../../database/prismaClient.js';
import { lockMilestone, lockProject } from '../../../database/locks.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const sprintSelect = {
  id: true,
  projectId: true,
  name: true,
  objective: true,
  startDate: true,
  endDate: true,
  status: true,
  startedAt: true,
  completedAt: true,
  milestoneId: true,
  createdAt: true,
  updatedAt: true
};

const scheduleTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  estimatedEffort: true,
  responsibleUserId: true,
  sprintId: true
};

export const sprintTaskSelect = {
  id: true,
  projectId: true,
  sprintId: true,
  taskId: true,
  taskTitleSnapshot: true,
  addedAt: true,
  addedAfterStart: true,
  carriedFromSprintId: true,
  removedAt: true,
  removalReason: true,
  exitStatus: true,
  closedAt: true
};

function toParticipatingTask(participation) {
  return {
    ...participation.task,
    addedAt: participation.addedAt,
    addedAfterStart: participation.addedAfterStart,
    carriedFromSprintId: participation.carriedFromSprintId,
    exitStatus: participation.exitStatus
  };
}

async function freezeParticipations(tx, sprintId, closedAt) {
  const ativas = await tx.sprintTask.findMany({
    where: { sprintId, removedAt: null },
    select: { id: true, taskId: true }
  });
  const taskIds = ativas.map((participacao) => participacao.taskId).filter(Boolean);
  const statusById = new Map(
    taskIds.length
      ? (
          await tx.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, status: true }
          })
        ).map((task) => [task.id, task.status])
      : []
  );
  const idsPorStatus = new Map();
  for (const participacao of ativas) {
    const exitStatus = statusById.get(participacao.taskId) ?? null;
    if (!idsPorStatus.has(exitStatus)) idsPorStatus.set(exitStatus, []);
    idsPorStatus.get(exitStatus).push(participacao.id);
  }
  for (const [exitStatus, ids] of idsPorStatus) {
    await tx.sprintTask.updateMany({ where: { id: { in: ids } }, data: { closedAt, exitStatus } });
  }
}

export const sprintRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findById(id) {
    return prisma.sprint.findUnique({ where: { id }, select: sprintSelect });
  },

  findByIdInProject(id, projectId) {
    return prisma.sprint.findFirst({ where: { id, projectId }, select: sprintSelect });
  },

  findByProject(projectId, filters = {}) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {})
      },
      select: sprintSelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
  },

  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      const milestones = await tx.milestone.findMany({
        where: { projectId },
        select: { id: true }
      });
      await validate({ sprints, sprint: null, milestones });
      const sprint = await tx.sprint.create({
        data: { ...data, projectId },
        select: sprintSelect
      });
      if (auditEvent) {
        await auditRepository.create({ ...auditEvent, resourceId: String(sprint.id) }, tx);
      }
      return sprint;
    });
  },

  async updateWithinProjectLock(id, projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const travada = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} FOR UPDATE`;
      if (!travada.length) return null;

      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      const sprint = sprints.find((item) => item.id === id) ?? null;
      const milestones = await tx.milestone.findMany({
        where: { projectId },
        select: { id: true }
      });

      await validate({ sprints, sprint, milestones });

      const atualizada = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return atualizada;
    });
  },

  async transitionWithinSprintLock(id, projectId, buildChange) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const travada = await tx.$queryRaw`
        SELECT id, milestoneId FROM Sprint WHERE id = ${id} FOR UPDATE`;
      if (!travada.length) return null;
      const milestoneId = travada[0].milestoneId == null ? null : Number(travada[0].milestoneId);

      const dentro = await tx.$queryRaw`
        SELECT taskId FROM SprintTask
        WHERE sprintId = ${id} AND removedAt IS NULL AND taskId IS NOT NULL
        FOR UPDATE`;
      const taskIds = [...new Set(dentro.map((linha) => Number(linha.taskId)))].sort(
        (a, b) => a - b
      );
      if (taskIds.length) {
        await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(taskIds)}) FOR UPDATE`;
      }

      if (milestoneId) {
        await lockMilestone(tx, milestoneId);
      }

      const atual = await tx.sprint.findUnique({ where: { id }, select: sprintSelect });
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      const tasks = taskIds.length
        ? await tx.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, title: true, status: true, sprintId: true }
          })
        : [];
      const milestoneSprints = milestoneId
        ? sprints.filter((sprint) => sprint.milestoneId === milestoneId)
        : [];

      const { data, auditEvent, freezeAt, backlog, milestone } = await buildChange({
        sprint: atual,
        sprints,
        tasks,
        milestoneSprints
      });

      const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (freezeAt) await freezeParticipations(tx, id, freezeAt);

      let returnedToBacklog = 0;
      if (backlog?.taskIds?.length) {
        const alterados = await tx.task.updateMany({
          where: { id: { in: backlog.taskIds }, sprintId: id },
          data: { sprintId: null }
        });
        returnedToBacklog = alterados.count;
        if (backlog.historyEntries?.length) {
          await tx.taskHistoryEntry.createMany({ data: backlog.historyEntries });
        }
      }

      let milestoneCompleted = null;
      if (milestone) {
        milestoneCompleted = await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: milestone.status },
          select: { id: true, title: true, status: true }
        });
      }

      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { sprint, returnedToBacklog, milestoneCompleted };
    });
  },

  async mutateScopeWithinSprintLock(sprintId, projectId, requestedTaskIds, buildPlan) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const locked = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
      if (!locked.length) return null;

      const dentro = await tx.$queryRaw`
        SELECT taskId FROM SprintTask
        WHERE sprintId = ${sprintId} AND removedAt IS NULL AND taskId IS NOT NULL
        FOR UPDATE`;

      const taskIdsParaTravar = [
        ...new Set([...requestedTaskIds, ...dentro.map((linha) => Number(linha.taskId))])
      ].sort((a, b) => a - b);
      if (taskIdsParaTravar.length) {
        await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(taskIdsParaTravar)}) FOR UPDATE`;
      }

      const sprint = await tx.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
      const participations = await tx.sprintTask.findMany({
        where: { sprintId },
        select: sprintTaskSelect
      });

      const tasks = taskIdsParaTravar.length
        ? await tx.task.findMany({
            where: { id: { in: taskIdsParaTravar } },
            select: { id: true, projectId: true, sprintId: true, status: true, title: true }
          })
        : [];

      const activeElsewhere = requestedTaskIds.length
        ? await tx.sprintTask.findMany({
            where: {
              taskId: { in: requestedTaskIds },
              removedAt: null,
              sprintId: { not: sprintId }
            },
            select: sprintTaskSelect,
            orderBy: [{ taskId: 'asc' }, { closedAt: 'asc' }, { sprintId: 'asc' }]
          })
        : [];

      const plan = await buildPlan({ sprint, participations, tasks, activeElsewhere });

      for (const saida of plan.close) {
        await tx.sprintTask.update({
          where: { id: saida.id },
          data: { removedAt: saida.at, removalReason: saida.reason, exitStatus: saida.exitStatus }
        });
      }
      for (const entrada of plan.open) {
        if (entrada.id) {
          await tx.sprintTask.update({
            where: { id: entrada.id },
            data: {
              removedAt: null,
              removalReason: null,
              exitStatus: null,
              closedAt: null,
              taskTitleSnapshot: entrada.taskTitleSnapshot,
              carriedFromSprintId: entrada.carriedFromSprintId
            }
          });
        } else {
          await tx.sprintTask.create({
            data: {
              projectId: sprint.projectId,
              sprintId,
              taskId: entrada.taskId,
              taskTitleSnapshot: entrada.taskTitleSnapshot,
              addedAt: entrada.addedAt,
              addedAfterStart: entrada.addedAfterStart,
              carriedFromSprintId: entrada.carriedFromSprintId
            }
          });
        }
      }
      if (plan.detachTaskIds.length) {
        await tx.task.updateMany({
          where: { id: { in: plan.detachTaskIds } },
          data: { sprintId: null }
        });
      }
      if (plan.attachTaskIds.length) {
        await tx.task.updateMany({
          where: { id: { in: plan.attachTaskIds } },
          data: { sprintId }
        });
      }
      if (plan.historyEntries.length) {
        await tx.taskHistoryEntry.createMany({ data: plan.historyEntries });
      }
      if (plan.auditEvent) await auditRepository.create(plan.auditEvent, tx);

      return tx.task.findMany({
        where: { sprintId },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      });
    });
  },

  async findParticipationsBySprint(sprintId) {
    const [participations, continuations] = await prisma.$transaction([
      prisma.sprintTask.findMany({
        where: { sprintId },
        select: { ...sprintTaskSelect, task: { select: { status: true } } },
        orderBy: [{ taskId: 'asc' }]
      }),
      prisma.sprintTask.findMany({
        where: { carriedFromSprintId: sprintId },
        select: { taskId: true, sprintId: true }
      })
    ]);

    const movedTo = new Map(
      continuations.map((continuation) => [continuation.taskId, continuation.sprintId])
    );
    return participations.map((participation) => ({
      taskId: participation.taskId,
      taskTitleSnapshot: participation.taskTitleSnapshot,
      addedAt: participation.addedAt,
      addedAfterStart: participation.addedAfterStart,
      carriedFromSprintId: participation.carriedFromSprintId,
      removedAt: participation.removedAt,
      removalReason: participation.removalReason,
      exitStatus: participation.exitStatus,
      currentStatus: participation.task?.status ?? null,
      movedToSprintId: movedTo.get(participation.taskId) ?? null
    }));
  },

  async findBurndownDataBySprint(sprint) {
    const participations = await prisma.sprintTask.findMany({
      where: { sprintId: sprint.id },
      select: {
        taskId: true,
        addedAt: true,
        removedAt: true,
        exitStatus: true,
        closedAt: true,
        task: { select: { status: true, estimatedEffort: true } }
      },
      orderBy: [{ taskId: 'asc' }]
    });

    const taskIds = participations.map((participation) => participation.taskId).filter(Boolean);
    const conclusoes = taskIds.length
      ? await prisma.taskHistoryEntry.findMany({
          where: {
            projectId: sprint.projectId,
            taskId: { in: taskIds },
            field: 'STATUS',
            toValue: 'CONCLUIDO'
          },
          select: { taskId: true, occurredAt: true },
          orderBy: [{ occurredAt: 'asc' }]
        })
      : [];

    const porTarefa = new Map();
    for (const entrada of conclusoes) {
      if (!porTarefa.has(entrada.taskId)) porTarefa.set(entrada.taskId, []);
      porTarefa.get(entrada.taskId).push(entrada.occurredAt);
    }

    return participations.map((participation) => {
      const fim = participation.removedAt ?? participation.closedAt ?? null;
      const primeira = (porTarefa.get(participation.taskId) || []).find(
        (instante) => instante >= participation.addedAt && (!fim || instante <= fim)
      );
      return {
        taskId: participation.taskId,
        points: participation.task?.estimatedEffort ?? 0,
        addedAt: participation.addedAt,
        removedAt: participation.removedAt,
        closedAt: participation.closedAt,
        exitStatus: participation.exitStatus,
        currentStatus: participation.task?.status ?? null,
        completedAt: primeira ?? null
      };
    });
  },

  async findTasksBySprint(sprintId) {
    const participations = await prisma.sprintTask.findMany({
      where: { sprintId, removedAt: null },
      select: {
        addedAt: true,
        addedAfterStart: true,
        carriedFromSprintId: true,
        exitStatus: true,
        task: { select: scheduleTaskSelect }
      },
      orderBy: [{ taskId: 'asc' }]
    });
    return participations.filter((participation) => participation.task).map(toParticipatingTask);
  },

  findTasksByIds(taskIds) {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, projectId: true, sprintId: true }
    });
  },

  scheduleData(projectId) {
    return prisma.$transaction([
      prisma.sprint.findMany({
        where: { projectId },
        select: {
          ...sprintSelect,
          sprintTasks: {
            where: { removedAt: null },
            select: {
              addedAt: true,
              addedAfterStart: true,
              carriedFromSprintId: true,
              exitStatus: true,
              task: { select: scheduleTaskSelect }
            },
            orderBy: [{ taskId: 'asc' }]
          }
        },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
      }),
      prisma.task.findMany({
        where: { projectId, sprintId: null },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      })
    ]);
  }
};
