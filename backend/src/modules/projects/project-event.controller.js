import { asyncHandler } from '../../shared/http/index.js';
import { projectEventService } from './services/project-event.service.js';

const EVENTSOURCE_RETRY_MS = 3000;

function createSseClient(res) {
  let closed = false;
  const write = (payload) => {
    if (closed || res.writableEnded || res.destroyed) return false;
    return res.write(payload);
  };

  return {
    send(event) {
      return write(`data: ${JSON.stringify(event)}\n\n`);
    },
    heartbeat(occurredAt) {
      return write(`: heartbeat ${occurredAt}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      if (!res.writableEnded) res.end();
    }
  };
}

export const projectEventController = {
  stream: asyncHandler(async (req, res) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const client = createSseClient(res);
    const unsubscribe = projectEventService.subscribe({
      projectId: req.authorizedProjectId,
      actorUserId: req.auth.user.id,
      membershipRole: req.projectMembership.role,
      sessionId: req.auth.session.id,
      client
    });
    res.once('close', unsubscribe);
    res.flushHeaders?.();

    if (!res.write(`retry: ${EVENTSOURCE_RETRY_MS}\n\n`)) {
      unsubscribe();
      client.close('backpressure');
    }
  })
};
