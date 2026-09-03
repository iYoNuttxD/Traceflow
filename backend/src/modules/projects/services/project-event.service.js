import { projectEventPublisher } from '../../../shared/events/index.js';
import { presentProjectEvent } from '../project-event.presenter.js';

export function createProjectEventService({ publisher = projectEventPublisher } = {}) {
  return {
    subscribe({ projectId, actorUserId, membershipRole, sessionId, client }) {
      return publisher.subscribe({
        projectId,
        userId: actorUserId,
        sessionId,
        onEvent(event) {
          const presented = presentProjectEvent(event, { actorUserId, membershipRole });
          return presented ? client.send(presented) : true;
        },
        onHeartbeat: (occurredAt) => client.heartbeat(occurredAt),
        onClose: (reason) => client.close(reason)
      });
    }
  };
}

export const projectEventService = createProjectEventService();
