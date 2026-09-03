import { PROJECT_EVENT_TYPES } from '../../shared/events/index.js';
import { formatTaskComment } from '../tasks/services/task-comment.presenter.js';

const commentEventTypes = new Set(Object.values(PROJECT_EVENT_TYPES));

export function presentProjectEvent(event, context) {
  if (!commentEventTypes.has(event.type)) return null;
  return {
    type: event.type,
    projectId: event.projectId,
    taskId: event.taskId,
    occurredAt: event.occurredAt,
    data: {
      comment: formatTaskComment(event.data.comment, context)
    }
  };
}
