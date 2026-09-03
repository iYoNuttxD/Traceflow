export const PROJECT_EVENT_TYPES = Object.freeze({
  TASK_COMMENT_CREATED: 'task.comment.created',
  TASK_COMMENT_UPDATED: 'task.comment.updated',
  TASK_COMMENT_DELETED: 'task.comment.deleted'
});

export const PROJECT_EVENT_HEARTBEAT_INTERVAL_MS = 25_000;
export const PROJECT_EVENT_MAX_STREAM_LIFETIME_MS = 15 * 60_000;

function validId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validateEvent(event) {
  if (!event || !validId(event.projectId) || !validId(event.taskId)) {
    throw new TypeError('Evento de projeto inválido.');
  }
  if (!Object.values(PROJECT_EVENT_TYPES).includes(event.type)) {
    throw new TypeError('Tipo de evento de projeto não suportado.');
  }
  if (!event.occurredAt || !event.data || typeof event.data !== 'object') {
    throw new TypeError('Envelope de evento de projeto incompleto.');
  }
}

export class InMemoryProjectEventPublisher {
  constructor({
    heartbeatIntervalMs = PROJECT_EVENT_HEARTBEAT_INTERVAL_MS,
    maxStreamLifetimeMs = PROJECT_EVENT_MAX_STREAM_LIFETIME_MS,
    now = () => Date.now(),
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  } = {}) {
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.maxStreamLifetimeMs = maxStreamLifetimeMs;
    this.now = now;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.projects = new Map();
    this.nextSubscriberId = 0;
    this.heartbeatTimer = null;
  }

  subscribe({ projectId, userId, sessionId, onEvent, onHeartbeat, onClose }) {
    if (!validId(projectId) || !validId(userId) || !sessionId || typeof onEvent !== 'function') {
      throw new TypeError('Subscriber de projeto inválido.');
    }

    const normalizedProjectId = Number(projectId);
    const subscriber = {
      id: ++this.nextSubscriberId,
      projectId: normalizedProjectId,
      userId: Number(userId),
      sessionId: String(sessionId),
      connectedAt: this.now(),
      onEvent,
      onHeartbeat,
      onClose
    };
    const subscribers = this.projects.get(normalizedProjectId) || new Map();
    subscribers.set(subscriber.id, subscriber);
    this.projects.set(normalizedProjectId, subscribers);
    this.startHeartbeatScheduler();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.removeSubscriber(subscriber, { close: false });
    };
  }

  publish(event) {
    validateEvent(event);
    const subscribers = this.projects.get(Number(event.projectId));
    if (!subscribers) return 0;

    let delivered = 0;
    for (const subscriber of [...subscribers.values()]) {
      try {
        if (subscriber.onEvent(event) === false) {
          this.removeSubscriber(subscriber, { close: true, reason: 'backpressure' });
          continue;
        }
        delivered += 1;
      } catch {
        this.removeSubscriber(subscriber, { close: true, reason: 'subscriber_error' });
      }
    }
    return delivered;
  }

  disconnectUser(userId, { projectId, exceptSessionId } = {}) {
    const normalizedUserId = Number(userId);
    for (const subscribers of this.selectedProjects(projectId)) {
      for (const subscriber of [...subscribers.values()]) {
        if (
          subscriber.userId === normalizedUserId &&
          (!exceptSessionId || subscriber.sessionId !== String(exceptSessionId))
        ) {
          this.removeSubscriber(subscriber, { close: true, reason: 'authorization_changed' });
        }
      }
    }
  }

  disconnectSession(sessionId) {
    for (const subscribers of this.projects.values()) {
      for (const subscriber of [...subscribers.values()]) {
        if (subscriber.sessionId === String(sessionId)) {
          this.removeSubscriber(subscriber, { close: true, reason: 'session_revoked' });
        }
      }
    }
  }

  closeAll(reason = 'shutdown') {
    for (const subscribers of this.projects.values()) {
      for (const subscriber of [...subscribers.values()]) {
        this.removeSubscriber(subscriber, { close: true, reason });
      }
    }
  }

  subscriberCount(projectId) {
    if (projectId != null) return this.projects.get(Number(projectId))?.size || 0;
    let total = 0;
    for (const subscribers of this.projects.values()) total += subscribers.size;
    return total;
  }

  selectedProjects(projectId) {
    if (projectId == null) return this.projects.values();
    const subscribers = this.projects.get(Number(projectId));
    return subscribers ? [subscribers] : [];
  }

  startHeartbeatScheduler() {
    if (this.heartbeatTimer || this.subscriberCount() === 0) return;
    this.heartbeatTimer = this.setIntervalFn(() => this.runHeartbeat(), this.heartbeatIntervalMs);
    this.heartbeatTimer?.unref?.();
  }

  stopHeartbeatSchedulerIfIdle() {
    if (!this.heartbeatTimer || this.subscriberCount() > 0) return;
    this.clearIntervalFn(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  runHeartbeat() {
    const now = this.now();
    for (const subscribers of this.projects.values()) {
      for (const subscriber of [...subscribers.values()]) {
        if (now - subscriber.connectedAt >= this.maxStreamLifetimeMs) {
          this.removeSubscriber(subscriber, { close: true, reason: 'maximum_lifetime' });
          continue;
        }
        try {
          if (subscriber.onHeartbeat?.(new Date(now).toISOString()) === false) {
            this.removeSubscriber(subscriber, { close: true, reason: 'backpressure' });
          }
        } catch {
          this.removeSubscriber(subscriber, { close: true, reason: 'subscriber_error' });
        }
      }
    }
  }

  removeSubscriber(subscriber, { close, reason } = {}) {
    const subscribers = this.projects.get(subscriber.projectId);
    if (!subscribers?.delete(subscriber.id)) return;
    if (subscribers.size === 0) this.projects.delete(subscriber.projectId);
    if (close) {
      try {
        subscriber.onClose?.(reason);
      } catch {
        // O subscriber já foi removido; falha de transporte não mantém estado interno.
      }
    }
    this.stopHeartbeatSchedulerIfIdle();
  }
}

export const projectEventPublisher = new InMemoryProjectEventPublisher();
