import { env } from '../../config/env.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { buildAuditEvent } from '../audit/audit.service.js';
import {
  toNotificationCursor,
  toNotificationDTO,
  toPreferencesDTO
} from './notification.mapper.js';
import {
  OVERDUE,
  addDays,
  dueDateOf,
  dueDateRange,
  isOverdue,
  isWithinLookback,
  overdueCutoff,
  overdueDedupeKey,
  overdueExclusion,
  preferenceAllowsOverdue,
  snapshotTitle
} from './notification.policy.js';
import { notificationRepository } from './notification.repository.js';

const JOB_EXCLUSIONS = [
  'OUTSIDE_WINDOW',
  'NO_RESPONSIBLE',
  'INACTIVE_ACCOUNT',
  'INACTIVE_MEMBER',
  'PREFERENCE_OFF'
];

function notificationNotFound() {
  return new AppError({
    message: 'Notificação não encontrada.',
    statusCode: 404,
    code: ERROR_CODES.NOTIFICATION_NOT_FOUND,
    exposeTechnicalDetails: true
  });
}

function preferencesBusy() {
  return new AppError({
    message: 'Outra alteração das suas preferências está em andamento. Tente de novo em instantes.',
    statusCode: 409,
    code: ERROR_CODES.NOTIFICATION_PREFERENCES_BUSY,
    exposeTechnicalDetails: true
  });
}

function errorCodeOf(error) {
  return String(error?.code || 'NOTIFICATIONS_DUE_FAILED').slice(0, 64);
}

function emptyCounts() {
  return {
    scanned: 0,
    eligible: 0,
    created: 0,
    alreadyNotified: 0,
    wouldCreate: 0,
    excluded: Object.fromEntries(JOB_EXCLUSIONS.map((reason) => [reason, 0]))
  };
}

export function createNotificationService({
  repository = notificationRepository,
  log = logger,
  clock = () => new Date(),
  configuration = env
} = {}) {
  async function overdueForProject(projectId, { now, timeZone, lookbackDays, range, dryRun }) {
    const counts = emptyCounts();
    const tasks = await repository.findOverdueCandidates(projectId, range);
    counts.excluded.OUTSIDE_WINDOW = await repository.countOutsideWindow(projectId, range.from);

    const due = tasks
      .map((task) => ({ ...task, dueDate: dueDateOf(task.deadline) }))
      .filter(
        (task) =>
          isOverdue(task, now, timeZone) &&
          isWithinLookback(overdueCutoff(task.dueDate, timeZone), now, lookbackDays)
      );
    counts.scanned = due.length;

    const responsibleIds = due.map((task) => task.responsibleUserId).filter(Boolean);
    const accounts = responsibleIds.length
      ? await repository.activeAccountIds(responsibleIds)
      : new Set();
    const members = responsibleIds.length
      ? await repository.activeMemberIds(projectId, responsibleIds)
      : new Set();
    const preferences = responsibleIds.length
      ? await repository.overduePreferences(responsibleIds)
      : new Map();

    const rows = [];
    for (const task of due) {
      const exclusion = overdueExclusion({
        withinWindow: true,
        responsibleUserId: task.responsibleUserId,
        accountActive: accounts.has(task.responsibleUserId),
        membershipActive: members.has(task.responsibleUserId),
        preferenceEnabled: preferenceAllowsOverdue(
          preferences.get(task.responsibleUserId),
          overdueCutoff(task.dueDate, timeZone)
        )
      });
      if (exclusion) {
        counts.excluded[exclusion] += 1;
        continue;
      }
      rows.push({
        recipientUserId: task.responsibleUserId,
        projectId,
        taskId: task.id,
        type: OVERDUE,
        dedupeKey: overdueDedupeKey(task.id, task.dueDate),
        taskTitle: snapshotTitle(task.title),
        dueDate: new Date(`${task.dueDate}T00:00:00.000Z`)
      });
    }
    counts.eligible = rows.length;

    if (dryRun) {
      const existing = await repository.existingOverdueKeys(rows);
      counts.alreadyNotified = rows.filter((row) =>
        existing.has(`${row.recipientUserId}|${row.dedupeKey}`)
      ).length;
      counts.wouldCreate = rows.length - counts.alreadyNotified;
    } else {
      counts.created = await repository.insertOverdue(rows);
      counts.alreadyNotified = rows.length - counts.created;
    }
    return counts;
  }

  return {
    async list(userId, query = {}) {
      const page = query.page || 1;
      const limit = query.limit || 20;
      const after = query.cursor || null;
      const [total, rows, unreadCount] = await repository.listPage(userId, {
        unreadOnly: query.status !== 'ALL',
        skip: (page - 1) * limit,
        take: limit + 1,
        after
      });
      const pageRows = rows.slice(0, limit);
      return {
        notifications: pageRows.map(toNotificationDTO),
        pagination: {
          page: after ? null : page,
          limit,
          total,
          totalPages: total ? Math.ceil(total / limit) : 0
        },
        unreadCount,
        nextCursor: rows.length > limit ? toNotificationCursor(pageRows.at(-1)) : null
      };
    },

    async unreadCount(userId) {
      return { unreadCount: await repository.countUnread(userId) };
    },

    async markRead(userId, notificationId, read) {
      const row = await repository.setRead(userId, notificationId, read, clock());
      if (!row) throw notificationNotFound();
      return { notification: toNotificationDTO(row) };
    },

    async markAllRead(userId) {
      return { updated: await repository.markAllRead(userId, clock()) };
    },

    async preferences(userId) {
      return { preferences: toPreferencesDTO(await repository.preferences(userId)) };
    },

    async updatePreferences(userId, preferences, { requestId } = {}) {
      const rows = await repository.savePreferences(
        userId,
        preferences,
        (changed) =>
          buildAuditEvent({
            actorUserId: userId,
            requestId,
            action: 'NOTIFICATION_PREFERENCES_UPDATED',
            resourceType: 'NotificationPreference',
            resourceId: userId,
            metadata: { changedTypes: changed.join(',') }
          }),
        clock()
      );
      if (!rows) throw preferencesBusy();
      return { preferences: toPreferencesDTO(rows) };
    },

    async notifyOverdueTasks({
      now = clock(),
      timeZone = configuration.appTimeZone,
      lookbackDays = configuration.notificationsDueLookbackDays,
      projectId = null,
      dryRun = true
    } = {}) {
      const startedAt = Date.now();
      const { minDueDate, maxDueDate } = dueDateRange(now, timeZone, lookbackDays);
      const range = {
        from: new Date(`${minDueDate}T00:00:00.000Z`),
        to: new Date(`${addDays(maxDueDate, 1)}T00:00:00.000Z`)
      };
      log.info('Varredura de vencimentos iniciada.', {
        event: 'notifications_due_started',
        dryRun,
        timeZone,
        lookbackDays,
        now: now.toISOString()
      });

      const totals = emptyCounts();
      const projectIds = await repository.listActiveProjectIds(projectId);
      let failed = 0;
      for (const id of projectIds) {
        try {
          const counts = await overdueForProject(id, {
            now,
            timeZone,
            lookbackDays,
            range,
            dryRun
          });
          for (const key of ['scanned', 'eligible', 'created', 'alreadyNotified', 'wouldCreate'])
            totals[key] += counts[key];
          for (const reason of JOB_EXCLUSIONS) totals.excluded[reason] += counts.excluded[reason];
        } catch (error) {
          failed += 1;
          log.error('Falha ao processar os vencimentos de um projeto.', {
            event: 'notifications_due_project_failed',
            projectId: id,
            errorCode: errorCodeOf(error)
          });
        }
      }

      const { wouldCreate, ...counts } = totals;
      const report = {
        dryRun,
        timeZone,
        lookbackDays,
        projects: projectIds.length,
        ...counts,
        ...(dryRun ? { wouldCreate } : {}),
        updated: 'NOT_APPLICABLE',
        failed,
        durationMs: Date.now() - startedAt
      };
      log[failed ? 'warn' : 'info']('Varredura de vencimentos concluída.', {
        event: 'notifications_due_completed',
        dryRun,
        timeZone,
        projects: report.projects,
        scanned: report.scanned,
        eligible: report.eligible,
        created: report.created,
        alreadyNotified: report.alreadyNotified,
        ...Object.fromEntries(
          JOB_EXCLUSIONS.map((reason) => [`excluded${reason}`, report.excluded[reason]])
        ),
        failed,
        durationMs: report.durationMs
      });
      return report;
    }
  };
}

export const notificationService = createNotificationService();
