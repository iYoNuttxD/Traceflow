import { buildClosingTaskSnapshot } from '../sprint-task.projection.js';
import { isTerminalSprintStatus } from '../sprint.schema.js';
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
  planningSnapshotAt: true,
  closedAt: true,
  milestoneId: true,
  deletedAt: true,
  milestone: { select: { id: true, title: true, deletedAt: true } },
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
  plannedAtStart: true,
  pointsAtPlanning: true,
  pointsAtClose: true,
  closingTaskSnapshot: true,
  completedAtClose: true,
  carriedFromSprintId: true,
  removedAt: true,
  removalReason: true,
  exitStatus: true,
  closedAt: true
};

async function capturePlanning(tx, sprintId, tasks) {
  // Every existing participation is classified once, including pre-start removals.
  await tx.sprintTask.updateMany({ where: { sprintId }, data: { plannedAtStart: false } });
  for (const task of tasks) {
    await tx.sprintTask.updateMany({
      where: { sprintId, taskId: task.id, removedAt: null },
      data: { plannedAtStart: true, pointsAtPlanning: task.estimatedEffort ?? 0 }
    });
  }
}

async function freezeParticipations(tx, sprint, closedAt) {
  const tasks = await tx.task.findMany({
    where: { sprintId: sprint.id },
    select: {
      ...scheduleTaskSelect,
      description: true,
      responsible: true,
      responsibleUser: { select: { name: true } },
      actualEffort: true,
      createdAt: true,
      requirement: { select: { id: true, title: true, status: true } },
      pullRequest: {
        select: { id: true, number: true, title: true, state: true, githubUrl: true }
      },
      commitLinks: {
        select: {
          commit: {
            select: {
              id: true,
              hash: true,
              message: true,
              authorName: true,
              authorUsername: true,
              date: true,
              githubUrl: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { commitId: 'asc' }]
      },
      issueLinks: {
        select: {
          issue: {
            select: {
              id: true,
              number: true,
              title: true,
              state: true,
              labels: true,
              githubUrl: true
            }
          }
        },
        orderBy: [{ createdAt: 'desc' }, { issueId: 'asc' }]
      }
    }
  });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const participations = await findBurndownData(tx, sprint);
  const active = participations.filter((item) => item.removedAt === null);
  if (tasks.some((task) => !active.some((item) => item.taskId === task.id))) {
    throw new Error('Closing Task snapshot requires an active participation');
  }
  for (const participation of active) {
    await tx.sprintTask.update({
      where: { id: participation.id },
      data: {
        closedAt,
        exitStatus: participation.currentStatus,
        pointsAtClose: participation.points,
        completedAtClose: participation.completedAt,
        closingTaskSnapshot: buildClosingTaskSnapshot(byId.get(participation.taskId))
      }
    });
  }
}

async function findBurndownData(client, sprint) {
  const frozen = ['CONCLUIDA', 'CANCELADA'].includes(sprint.status);
  const participations = await client.sprintTask.findMany({
    where: { sprintId: sprint.id },
    select: {
      ...sprintTaskSelect,
      ...(frozen ? {} : { task: { select: { status: true, estimatedEffort: true } } })
    },
    orderBy: [{ id: 'asc' }]
  });
  const taskIds = participations
    .filter((p) => !frozen && p.closedAt === null)
    .map((p) => p.taskId)
    .filter(Boolean);
  const completions = taskIds.length
    ? await client.taskHistoryEntry.findMany({
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
  return participations.map((p) => {
    const end = p.removedAt ?? p.closedAt;
    const completedAt =
      completions.find(
        (entry) =>
          entry.taskId === p.taskId &&
          entry.occurredAt >= p.addedAt &&
          (!end || entry.occurredAt <= end)
      )?.occurredAt ?? null;
    return {
      id: p.id,
      taskId: p.taskId,
      points: frozen || p.closedAt !== null ? p.pointsAtClose : (p.task?.estimatedEffort ?? 0),
      addedAt: p.addedAt,
      removedAt: p.removedAt,
      closedAt: p.closedAt,
      exitStatus: p.exitStatus,
      currentStatus: frozen || p.closedAt !== null ? null : (p.task?.status ?? null),
      completedAt: frozen || p.closedAt !== null ? p.completedAtClose : completedAt
    };
  });
}

async function applyScopePlan(tx, sprint, plan) {
  const sprintId = sprint.id;
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
          addedAt: entrada.addedAt,
          addedAfterStart: entrada.addedAfterStart,
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
          plannedAtStart: sprint.planningSnapshotAt ? false : null,
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
}

export const sprintRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findById(id, { includeDeleted = false } = {}) {
    return prisma.sprint.findUnique({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
      select: sprintSelect
    });
  },

  findByIdInProject(id, projectId) {
    return prisma.sprint.findFirst({
      where: { id, projectId, deletedAt: null },
      select: sprintSelect
    });
  },

  findByProject(projectId, filters = {}) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {})
      },
      select: sprintSelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
  },

  findHistoryBySprints(sprintIds) {
    return prisma.sprintTask.findMany({
      where: { sprintId: { in: sprintIds } },
      select: sprintTaskSelect
    });
  },

  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const sprints = await tx.sprint.findMany({
        where: { projectId, deletedAt: null },
        select: sprintSelect
      });
      const milestones = await tx.milestone.findMany({
        where: { projectId, deletedAt: null },
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
      const travada =
        await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} AND deletedAt IS NULL FOR UPDATE`;
      if (!travada.length) return null;

      const sprints = await tx.sprint.findMany({
        where: { projectId, deletedAt: null },
        select: sprintSelect
      });
      const sprint = sprints.find((item) => item.id === id) ?? null;
      const milestones = await tx.milestone.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true }
      });

      await validate({ sprints, sprint, milestones });

      const atualizada = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return atualizada;
    });
  },

  async transitionWithinSprintLock(id, projectId, buildChange) {
    return prisma.$transaction(
      async (tx) => {
        await lockProject(tx, projectId);
        const lockedSprints = await tx.$queryRaw`
        SELECT id, milestoneId FROM Sprint WHERE projectId = ${projectId} AND deletedAt IS NULL ORDER BY id FOR UPDATE`;
        const locked = lockedSprints.find((item) => Number(item.id) === id);
        if (!locked) return null;
        const milestoneId = locked.milestoneId == null ? null : Number(locked.milestoneId);
        const lockedTasks = await tx.$queryRaw`
        SELECT id FROM Task WHERE sprintId = ${id} ORDER BY id FOR UPDATE`;
        const taskIds = lockedTasks.map((task) => Number(task.id));

        if (milestoneId) {
          await lockMilestone(tx, milestoneId);
        }

        const atual = await tx.sprint.findUnique({ where: { id }, select: sprintSelect });
        const sprints = await tx.sprint.findMany({
          where: { projectId, deletedAt: null },
          select: sprintSelect
        });
        const tasks = taskIds.length
          ? await tx.task.findMany({
              where: { id: { in: taskIds } },
              select: {
                id: true,
                projectId: true,
                title: true,
                status: true,
                sprintId: true,
                estimatedEffort: true
              }
            })
          : [];
        const milestoneSprints = milestoneId
          ? sprints.filter(
              (sprint) => sprint.milestoneId === milestoneId && !sprint.milestone?.deletedAt
            )
          : [];

        const {
          data,
          auditEvent,
          freezeAt,
          backlog,
          milestone,
          carryOver: continuation
        } = await buildChange({
          sprint: atual,
          sprints,
          tasks,
          milestoneSprints
        });

        if (data.startedAt) {
          await capturePlanning(tx, id, tasks);
          data.planningSnapshotAt = data.startedAt;
        }
        if (freezeAt) {
          await freezeParticipations(tx, atual, freezeAt);
          data.closedAt = freezeAt;
        }
        const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });

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

        let carryOver = null;
        if (continuation) {
          const destination = continuation.destination;
          const participations = await tx.sprintTask.findMany({
            where: { sprintId: destination.id },
            select: sprintTaskSelect
          });
          const activeElsewhere = await tx.sprintTask.findMany({
            where: { sprintId: id, taskId: { in: taskIds }, removedAt: null },
            select: sprintTaskSelect
          });
          const plan = await continuation.buildPlan({
            sprint: destination,
            participations,
            tasks,
            activeElsewhere
          });
          await applyScopePlan(tx, destination, plan);
          carryOver = {
            destinationSprintId: destination.id,
            destinationSprintName: destination.name,
            movedTasks: plan.attachTaskIds.length
          };
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
        return { sprint, returnedToBacklog, milestoneCompleted, carryOver };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  },

  async readImpactSnapshot(id) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({
        where: { id, deletedAt: null },
        select: sprintSelect
      });
      if (!sprint) return null;
      const sprints = await tx.sprint.findMany({
        where: { projectId: sprint.projectId, deletedAt: null },
        select: sprintSelect
      });
      const tasks = await tx.task.findMany({
        where: { sprintId: id },
        select: { id: true, status: true }
      });
      return { sprint, sprints, tasks };
    });
  },

  async softDeleteWithinSprintLock(id, projectId, buildPlan) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const locked =
        await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} AND projectId = ${projectId} FOR UPDATE`;
      if (!locked.length) return null;
      await tx.$queryRaw`SELECT id FROM Task WHERE sprintId = ${id} ORDER BY id FOR UPDATE`;
      const sprint = await tx.sprint.findUnique({ where: { id }, select: sprintSelect });
      const tasks = await tx.task.findMany({
        where: { sprintId: id },
        select: { id: true, status: true }
      });
      const plan = await buildPlan({ sprint, tasks });
      if (plan.closeOpenMemberships) {
        for (const task of tasks)
          await tx.sprintTask.updateMany({
            where: { sprintId: id, taskId: task.id, removedAt: null, closedAt: null },
            data: {
              removedAt: plan.data.deletedAt,
              removalReason: 'REMOVIDA',
              exitStatus: task.status
            }
          });
      }
      const returned = await tx.task.updateMany({
        where: { sprintId: id },
        data: { sprintId: null }
      });
      if (plan.historyEntries.length)
        await tx.taskHistoryEntry.createMany({ data: plan.historyEntries });
      const deleted = await tx.sprint.update({
        where: { id },
        data: plan.data,
        select: sprintSelect
      });
      await auditRepository.create(plan.auditEvent, tx);
      return { sprint: deleted, returnedToBacklog: returned.count };
    });
  },

  async mutateScopeWithinSprintLock(sprintId, projectId, requestedTaskIds, buildPlan) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const locked =
        await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} AND deletedAt IS NULL FOR UPDATE`;
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

      const sprint = await tx.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        select: sprintSelect
      });
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
              sprintId: { not: sprintId },
              sprint: { deletedAt: null }
            },
            select: sprintTaskSelect,
            orderBy: [{ taskId: 'asc' }, { closedAt: 'asc' }, { sprintId: 'asc' }]
          })
        : [];

      const plan = await buildPlan({ sprint, participations, tasks, activeElsewhere });

      await applyScopePlan(tx, sprint, plan);

      return tx.task.findMany({
        where: { sprintId },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      });
    });
  },

  async findParticipationsBySprint(sprintId, frozen = false) {
    const [participations, continuations] = await prisma.$transaction([
      prisma.sprintTask.findMany({
        where: { sprintId },
        select: { ...sprintTaskSelect, ...(frozen ? {} : { task: { select: { status: true } } }) },
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
      pointsAtPlanning: participation.pointsAtPlanning,
      pointsAtClose: participation.pointsAtClose,
      taskId: participation.taskId,
      taskTitleSnapshot: participation.taskTitleSnapshot,
      addedAt: participation.addedAt,
      addedAfterStart: participation.addedAfterStart,
      plannedAtStart: participation.plannedAtStart,
      carriedFromSprintId: participation.carriedFromSprintId,
      removedAt: participation.removedAt,
      removalReason: participation.removalReason,
      exitStatus: participation.exitStatus,
      currentStatus: frozen || participation.closedAt ? null : (participation.task?.status ?? null),
      movedToSprintId: movedTo.get(participation.taskId) ?? null
    }));
  },

  async findBurndownDataBySprint(sprint) {
    return findBurndownData(prisma, sprint);
  },

  async readTaskProjection(sprintId) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({
        where: { id: sprintId, deletedAt: null },
        select: sprintSelect
      });
      if (!sprint) return null;
      const frozen = isTerminalSprintStatus(sprint.status);
      const participations = await tx.sprintTask.findMany({
        where: { sprintId },
        select: {
          ...sprintTaskSelect,
          ...(frozen ? {} : { task: { select: scheduleTaskSelect } })
        },
        orderBy: [{ id: 'asc' }]
      });
      return { sprint, participations };
    });
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
        where: { projectId, deletedAt: null },
        select: {
          ...sprintSelect,
          sprintTasks: {
            select: {
              ...sprintTaskSelect,
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
