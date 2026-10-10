import { NOTIFICATION_TYPES, STATUS_CHANGED, notificationLink } from './notification.policy.js';

function contextOf(row) {
  if (row.type === STATUS_CHANGED) {
    return {
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      actor: row.actor ? { id: row.actor.id, name: row.actor.name } : null
    };
  }
  return { dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null };
}

export function toNotificationDTO(row) {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    readAt: row.readAt,
    project: { id: row.project.id, name: row.project.name },
    task: {
      id: row.taskId,
      code: row.taskId ? `TASK-${row.taskId}` : null,
      title: row.taskTitle,
      available: Boolean(row.taskId)
    },
    context: contextOf(row),
    link: notificationLink(row.projectId, row.taskId)
  };
}

export function toPreferencesDTO(rows) {
  const disabled = new Set(rows.filter((row) => !row.enabled).map((row) => row.type));
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, !disabled.has(type)]));
}

export function toNotificationExportItem(row) {
  return {
    id: row.id,
    type: row.type,
    projectId: row.projectId,
    taskId: row.taskId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    createdAt: row.createdAt,
    readAt: row.readAt
  };
}
