import { prisma } from '../../database/prismaClient.js';
import { INCONSISTENCY } from './notification.policy.js';

const ACTIVE_ACCOUNT = 'ACTIVE';
const PENDING = 'PENDING';

export const traceabilityNoticeRepository = {
  pendingAlerts(projectId) {
    return prisma.traceabilityAlert.findMany({
      where: { projectId, noticeState: PENDING },
      select: {
        id: true,
        type: true,
        subjectCode: true,
        subjectTitle: true,
        occurredAt: true,
        detectedAt: true,
        pullRequest: { select: { githubUrl: true } },
        issue: { select: { githubUrl: true } }
      },
      orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }]
    });
  },

  async activeRecipients(projectId, detectedAt) {
    const members = await prisma.projectMembership.findMany({
      where: {
        projectId,
        isActive: true,
        joinedAt: { lte: detectedAt },
        user: { accountStatus: ACTIVE_ACCOUNT }
      },
      select: { userId: true },
      orderBy: { userId: 'asc' }
    });
    if (!members.length) return [];
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId: { in: members.map((member) => member.userId) }, type: INCONSISTENCY },
      select: { userId: true, enabled: true, enabledAt: true }
    });
    const byUser = new Map(preferences.map((row) => [row.userId, row]));
    return members.map(({ userId }) => ({ userId, preference: byUser.get(userId) ?? null }));
  },

  async insertNotices(rows) {
    if (!rows.length) return 0;
    return (await prisma.notification.createMany({ data: rows, skipDuplicates: true })).count;
  },

  async markDispatched(projectId, alertIds, now) {
    const result = await prisma.traceabilityAlert.updateMany({
      where: { projectId, id: { in: alertIds }, noticeState: PENDING },
      data: { noticeState: 'DISPATCHED', noticedAt: now }
    });
    return result.count;
  },

  async projectsWithPendingNotices(projectId = null) {
    const rows = await prisma.traceabilityAlert.findMany({
      where: { noticeState: PENDING, ...(projectId ? { projectId } : {}) },
      select: { projectId: true },
      distinct: ['projectId'],
      orderBy: { projectId: 'asc' }
    });
    return rows.map((row) => row.projectId);
  }
};
