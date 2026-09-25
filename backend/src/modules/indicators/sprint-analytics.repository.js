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
