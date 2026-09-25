import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';

const sprintSelect = {
  id: true,
  projectId: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  startedAt: true,
  planningSnapshotAt: true,
  completedAt: true,
  closedAt: true,
  updatedAt: true
};

export const sprintAnalyticsRepository = {
  readBurnup(projectId, sprintId) {
    return prisma.$transaction(
      async (tx) => {
        const sprint = await tx.sprint.findFirst({
          where: { id: sprintId, projectId, deletedAt: null },
          select: { ...sprintSelect, burnupCoverageStartedAt: true }
        });
        if (!sprint) return null;
        const events = await tx.sprintBurnupEvent.findMany({
          where: { projectId, sprintId },
          select: {
            id: true,
            taskKey: true,
            type: true,
            previousPoints: true,
            newPoints: true,
            fromStatus: true,
            toStatus: true,
            occurredAt: true
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }]
        });
        return { sprint, events };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  },
  readProjectHistory(projectId) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        });
        if (!project) return null;
        const sprints = await tx.sprint.findMany({
          where: { projectId, deletedAt: null },
          select: sprintSelect,
          orderBy: [{ id: 'asc' }]
        });
        const completedIds = sprints
          .filter((sprint) => sprint.status === 'CONCLUIDA')
          .map((sprint) => sprint.id);
        const closingParticipations = completedIds.length
          ? await tx.sprintTask.findMany({
              where: { projectId, sprintId: { in: completedIds } },
              select: {
                sprintId: true,
                removedAt: true,
                plannedAtStart: true,
                pointsAtPlanning: true,
                pointsAtClose: true,
                exitStatus: true
              }
            })
          : [];
        return { sprints, closingParticipations };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
};
