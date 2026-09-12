import { PROJECT_EVENT_TYPES } from '../../shared/events/index.js';
import { formatTaskComment } from '../tasks/services/task-comment.presenter.js';
import { formatTaskTimeEntry } from '../tasks/services/task-time-entry.presenter.js';

const commentEventTypes = new Set([
  PROJECT_EVENT_TYPES.TASK_COMMENT_CREATED,
  PROJECT_EVENT_TYPES.TASK_COMMENT_UPDATED,
  PROJECT_EVENT_TYPES.TASK_COMMENT_DELETED
]);
const timeEntryEventTypes = new Set([
  PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_STARTED,
  PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_STOPPED,
  PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_CREATED,
  PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_UPDATED,
  PROJECT_EVENT_TYPES.TASK_TIME_ENTRY_DELETED
]);

// Cada assinante recebe o DTO com as capacidades resolvidas para a própria sessão;
// o envelope bruto nunca sai do processo.
export function presentProjectEvent(event, context) {
  const envelope = {
    type: event.type,
    projectId: event.projectId,
    taskId: event.taskId,
    occurredAt: event.occurredAt
  };
  if (commentEventTypes.has(event.type)) {
    return { ...envelope, data: { comment: formatTaskComment(event.data.comment, context) } };
  }
  if (timeEntryEventTypes.has(event.type)) {
    return {
      ...envelope,
      data: {
        entry: formatTaskTimeEntry(event.data.entry, context),
        effort: event.data.effort
      }
    };
  }
  return null;
}
