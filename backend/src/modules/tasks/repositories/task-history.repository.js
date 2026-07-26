import { prisma } from '../../../database/prismaClient.js';

export const taskHistoryRepository = {
  listPage(projectId, filters, pagination) {
    const where = {
      projectId,
      ...(filters.taskId ? { taskId: filters.taskId } : {}),
      ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
      ...(filters.field ? { field: filters.field } : {}),
      ...(filters.occurredAt ? { occurredAt: filters.occurredAt } : {})
    };
    return prisma.$transaction([
      prisma.taskHistoryEntry.count({ where }),
      prisma.taskHistoryEntry.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          taskId: true,
          actorUserId: true,
          field: true,
          fromValue: true,
          toValue: true,
          occurredAt: true,
          task: { select: { title: true } },
          actorUser: { select: { id: true, name: true } }
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take
      })
    ]);
  }
};
