import { prisma } from '../../database/prismaClient.js';
import {
  STATUS_CHANGED,
  snapshotTitle,
  statusChangeDedupeKey,
  statusChangeExclusion
} from './notification.policy.js';

const unique = (values) => [...new Set(values)];

export const notificationRepository = {
  async createStatusChangeNotification(tx, { task, movement, actorUserId }) {
    const candidate = {
      responsibleUserId: task.responsibleUserId,
      actorUserId,
      membershipActive: true,
      preferenceEnabled: true
    };
    const early = statusChangeExclusion(candidate);
    if (early) return { outcome: early };

    const membership = await tx.projectMembership.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId: task.responsibleUserId } },
      select: { isActive: true }
    });
    const preference = await tx.notificationPreference.findUnique({
      where: { userId_type: { userId: task.responsibleUserId, type: STATUS_CHANGED } },
      select: { enabled: true }
    });
    const exclusion = statusChangeExclusion({
      ...candidate,
      membershipActive: Boolean(membership?.isActive),
      preferenceEnabled: preference?.enabled !== false
    });
    if (exclusion) return { outcome: exclusion };

    const notification = await tx.notification.create({
      data: {
        recipientUserId: task.responsibleUserId,
        projectId: task.projectId,
        taskId: task.id,
        type: STATUS_CHANGED,
        dedupeKey: statusChangeDedupeKey(movement.id),
        taskTitle: snapshotTitle(task.title),
        fromStatus: movement.fromStatus,
        toStatus: movement.toStatus,
        actorUserId
      },
      select: { id: true }
    });
    return { outcome: 'CREATED', notificationId: notification.id };
  },

  async listActiveProjectIds(projectId = null) {
    const rows = await prisma.project.findMany({
      where: { deletedAt: null, ...(projectId ? { id: projectId } : {}) },
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    return rows.map((row) => row.id);
  },

  findOverdueCandidates(projectId, { from, to }) {
    return prisma.task.findMany({
      where: { projectId, status: { not: 'CONCLUIDO' }, deadline: { gte: from, lt: to } },
      select: { id: true, title: true, status: true, deadline: true, responsibleUserId: true },
      orderBy: { id: 'asc' }
    });
  },

  countOutsideWindow(projectId, before) {
    return prisma.task.count({
      where: { projectId, status: { not: 'CONCLUIDO' }, deadline: { lt: before } }
    });
  },

  async activeMemberIds(projectId, userIds) {
    const rows = await prisma.projectMembership.findMany({
      where: { projectId, userId: { in: unique(userIds) }, isActive: true },
      select: { userId: true }
    });
    return new Set(rows.map((row) => row.userId));
  },

  async disabledRecipientIds(userIds, type) {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: { in: unique(userIds) }, type, enabled: false },
      select: { userId: true }
    });
    return new Set(rows.map((row) => row.userId));
  },

  async existingOverdueKeys(rows) {
    if (!rows.length) return new Set();
    const found = await prisma.notification.findMany({
      where: {
        recipientUserId: { in: unique(rows.map((row) => row.recipientUserId)) },
        dedupeKey: { in: unique(rows.map((row) => row.dedupeKey)) }
      },
      select: { recipientUserId: true, dedupeKey: true }
    });
    return new Set(found.map((row) => `${row.recipientUserId}|${row.dedupeKey}`));
  },

  async insertOverdue(rows) {
    if (!rows.length) return 0;
    const result = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }
};
