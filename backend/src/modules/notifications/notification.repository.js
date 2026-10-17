import { isLockBusy, lockUserNoWait } from '../../database/locks.js';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';
import { SENT, recipientKeyOf, statusChangeEventKey } from './notification-metrics.policy.js';
import {
  NOTIFICATION_TYPES,
  OVERDUE,
  STATUS_CHANGED,
  snapshotTitle,
  statusChangeDedupeKey,
  statusChangeExclusion
} from './notification.policy.js';

const unique = (values) => [...new Set(values)];
const ACTIVE_ACCOUNT = 'ACTIVE';
const KEY_CHUNK = 5000;
const UPDATE_CHUNK = 1000;
const LOCK_WAIT_LIMIT_MS = 2000;
const LOCK_RETRY_MS = 20;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * ms));
const dtoInclude = {
  project: { select: { id: true, name: true } },
  actor: { select: { id: true, name: true } },
  traceabilityAlert: {
    select: { id: true, type: true, status: true, resolvedAt: true, dismissedAt: true }
  }
};
const preferenceSelect = { type: true, enabled: true };

function visibleWhere(userId) {
  return {
    recipientUserId: userId,
    project: { deletedAt: null, memberships: { some: { userId, isActive: true } } }
  };
}

function chunked(values, size) {
  const parts = [];
  for (let index = 0; index < values.length; index += size)
    parts.push(values.slice(index, index + size));
  return parts;
}

async function statusChangeExclusionOf(tx, task, actorUserId) {
  const candidate = {
    responsibleUserId: task.responsibleUserId,
    actorUserId,
    accountActive: true,
    membershipActive: true,
    preferenceEnabled: true
  };
  const early = statusChangeExclusion(candidate);
  if (early) return early;

  const responsible = await tx.user.findUnique({
    where: { id: task.responsibleUserId },
    select: { accountStatus: true }
  });
  const membership = await tx.projectMembership.findUnique({
    where: { projectId_userId: { projectId: task.projectId, userId: task.responsibleUserId } },
    select: { isActive: true }
  });
  const preference = await tx.notificationPreference.findUnique({
    where: { userId_type: { userId: task.responsibleUserId, type: STATUS_CHANGED } },
    select: { enabled: true }
  });
  return statusChangeExclusion({
    ...candidate,
    accountActive: responsible?.accountStatus === ACTIVE_ACCOUNT,
    membershipActive: Boolean(membership?.isActive),
    preferenceEnabled: preference?.enabled !== false
  });
}

export const notificationRepository = {
  async createStatusChangeNotification(tx, { task, movement, actorUserId }) {
    const exclusion = await statusChangeExclusionOf(tx, task, actorUserId);
    await tx.notificationDecision.create({
      data: {
        type: STATUS_CHANGED,
        eventKey: statusChangeEventKey(movement.id),
        projectId: task.projectId,
        recipientUserId: task.responsibleUserId ?? null,
        recipientKey: recipientKeyOf(task.responsibleUserId),
        outcome: exclusion ?? SENT,
        occurredAt: movement.movedAt
      }
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

  findOverdueCandidates(projectId, { to }) {
    return prisma.task.findMany({
      where: { projectId, status: { not: 'CONCLUIDO' }, deadline: { lt: to } },
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        responsibleUserId: true,
        createdAt: true
      },
      orderBy: { id: 'asc' }
    });
  },

  async activeAccountIds(userIds) {
    const rows = await prisma.user.findMany({
      where: { id: { in: unique(userIds) }, accountStatus: ACTIVE_ACCOUNT },
      select: { id: true }
    });
    return new Set(rows.map((row) => row.id));
  },

  async activeMemberIds(projectId, userIds) {
    const rows = await prisma.projectMembership.findMany({
      where: { projectId, userId: { in: unique(userIds) }, isActive: true },
      select: { userId: true }
    });
    return new Set(rows.map((row) => row.userId));
  },

  async overduePreferences(userIds) {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: { in: unique(userIds) }, type: OVERDUE },
      select: { userId: true, enabled: true, enabledAt: true }
    });
    return new Map(
      rows.map((row) => [row.userId, { enabled: row.enabled, enabledAt: row.enabledAt }])
    );
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
  },

  async currentOverdueDecisions(projectId, eventKeys) {
    const current = new Map();
    for (const keys of chunked(unique(eventKeys), KEY_CHUNK))
      for (const row of await prisma.notificationDecision.findMany({
        where: { type: OVERDUE, projectId, eventKey: { in: keys } },
        select: { eventKey: true, recipientKey: true, outcome: true }
      }))
        current.set(`${row.eventKey}|${row.recipientKey}`, row.outcome);
    return current;
  },

  async recordOverdueDecisions(projectId, decisions, decidedAt, current) {
    const created = [];
    const changed = new Map();
    for (const decision of decisions) {
      const recipientKey = recipientKeyOf(decision.recipientUserId);
      const previous = current.get(`${decision.eventKey}|${recipientKey}`);
      if (previous === undefined)
        created.push({ ...decision, type: OVERDUE, projectId, recipientKey, decidedAt });
      else if (previous !== SENT && previous !== decision.outcome) {
        if (!changed.has(decision.outcome)) changed.set(decision.outcome, []);
        changed.get(decision.outcome).push({ eventKey: decision.eventKey, recipientKey });
      }
    }

    let recorded = created.length
      ? (await prisma.notificationDecision.createMany({ data: created, skipDuplicates: true }))
          .count
      : 0;
    for (const [outcome, keys] of changed)
      for (const part of chunked(keys, UPDATE_CHUNK))
        recorded += (
          await prisma.notificationDecision.updateMany({
            where: { type: OVERDUE, projectId, outcome: { not: SENT }, OR: part },
            data: { outcome, decidedAt }
          })
        ).count;
    return recorded;
  },

  async revertOverdueDecisions(projectId, decisions, current) {
    for (const decision of decisions) {
      const recipientKey = recipientKeyOf(decision.recipientUserId);
      const where = {
        type: OVERDUE,
        projectId,
        eventKey: decision.eventKey,
        recipientKey,
        outcome: SENT
      };
      const previous = current.get(`${decision.eventKey}|${recipientKey}`);
      if (previous === undefined) await prisma.notificationDecision.deleteMany({ where });
      else await prisma.notificationDecision.updateMany({ where, data: { outcome: previous } });
    }
  },

  listPage(userId, { unreadOnly, types = null, skip, take, after = null }) {
    const where = {
      ...visibleWhere(userId),
      ...(unreadOnly ? { readAt: null } : {}),
      ...(types ? { type: { in: [...types] } } : {})
    };
    const pageWhere = after
      ? {
          AND: [
            where,
            {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } }
              ]
            }
          ]
        }
      : where;
    return prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where: pageWhere,
        include: dtoInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(after ? {} : { skip }),
        take
      }),
      prisma.notification.count({ where: { ...visibleWhere(userId), readAt: null } })
    ]);
  },

  countUnread(userId) {
    return prisma.notification.count({ where: { ...visibleWhere(userId), readAt: null } });
  },

  setRead(userId, notificationId, read, now) {
    return prisma.$transaction(async (tx) => {
      const where = { id: notificationId, ...visibleWhere(userId) };
      if (!(await tx.notification.findFirst({ where, select: { id: true } }))) return null;
      await tx.notification.updateMany({
        where: read ? { ...where, readAt: null } : where,
        data: { readAt: read ? now : null }
      });
      return tx.notification.findFirst({ where, include: dtoInclude });
    });
  },

  async markAllRead(userId, now) {
    const result = await prisma.notification.updateMany({
      where: { ...visibleWhere(userId), readAt: null },
      data: { readAt: now }
    });
    return result.count;
  },

  preferences(userId) {
    return prisma.notificationPreference.findMany({ where: { userId }, select: preferenceSelect });
  },

  async savePreferences(userId, preferences, auditFor, now = new Date()) {
    const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
    for (;;) {
      try {
        return await prisma.$transaction(async (tx) => {
          await lockUserNoWait(tx, userId);
          const current = await tx.notificationPreference.findMany({
            where: { userId },
            select: preferenceSelect
          });
          const enabledBefore = new Map(current.map((row) => [row.type, row.enabled]));
          const changed = NOTIFICATION_TYPES.filter(
            (type) => (enabledBefore.get(type) ?? true) !== preferences[type]
          );
          for (const type of changed)
            await tx.notificationPreference.upsert({
              where: { userId_type: { userId, type } },
              create: { userId, type, enabled: preferences[type] },
              update: {
                enabled: preferences[type],
                ...(preferences[type] ? { enabledAt: now } : {})
              }
            });
          if (changed.length) await auditRepository.create(auditFor(changed), tx);
          return tx.notificationPreference.findMany({
            where: { userId },
            select: preferenceSelect
          });
        });
      } catch (error) {
        if (!isLockBusy(error)) throw error;
        if (Date.now() + 2 * LOCK_RETRY_MS > deadline) return null;
        await pause(LOCK_RETRY_MS);
      }
    }
  }
};
