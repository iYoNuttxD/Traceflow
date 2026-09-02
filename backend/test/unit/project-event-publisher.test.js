import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryProjectEventPublisher,
  PROJECT_EVENT_TYPES
} from '../../src/shared/events/index.js';

const event = (projectId = 1) => ({
  type: PROJECT_EVENT_TYPES.TASK_COMMENT_CREATED,
  projectId,
  taskId: 7,
  occurredAt: '2026-09-02T12:00:00.000Z',
  data: { comment: { id: 9 } }
});

function subscriber(overrides = {}) {
  return {
    projectId: 1,
    userId: 10,
    sessionId: 'session-1',
    onEvent: vi.fn(() => true),
    onHeartbeat: vi.fn(() => true),
    onClose: vi.fn(),
    ...overrides
  };
}

describe('InMemoryProjectEventPublisher', () => {
  it('isola projetos, entrega sem buffer e remove subscribers imediatamente', () => {
    const publisher = new InMemoryProjectEventPublisher();
    const projectA = subscriber();
    const projectB = subscriber({ projectId: 2, sessionId: 'session-2' });
    const unsubscribeA = publisher.subscribe(projectA);
    const unsubscribeB = publisher.subscribe(projectB);

    expect(publisher.publish(event(1))).toBe(1);
    expect(projectA.onEvent).toHaveBeenCalledOnce();
    expect(projectB.onEvent).not.toHaveBeenCalled();

    unsubscribeA();
    expect(publisher.subscriberCount(1)).toBe(0);
    expect(projectA.onClose).not.toHaveBeenCalled();
    unsubscribeB();
    expect(publisher.subscriberCount()).toBe(0);
  });

  it('usa um scheduler compartilhado e encerra cliente sob backpressure', () => {
    let heartbeat;
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn((callback) => {
      heartbeat = callback;
      return { unref: vi.fn() };
    });
    const publisher = new InMemoryProjectEventPublisher({ setIntervalFn, clearIntervalFn });
    const slow = subscriber({ onEvent: vi.fn(() => false) });
    const healthy = subscriber({ userId: 11, sessionId: 'session-2' });
    publisher.subscribe(slow);
    publisher.subscribe(healthy);

    expect(setIntervalFn).toHaveBeenCalledOnce();
    publisher.publish(event());
    expect(slow.onClose).toHaveBeenCalledWith('backpressure');
    expect(publisher.subscriberCount()).toBe(1);

    heartbeat();
    expect(healthy.onHeartbeat).toHaveBeenCalledOnce();
    publisher.closeAll();
    expect(clearIntervalFn).toHaveBeenCalledOnce();
  });

  it('fecha por revogação de sessão, membership e duração máxima', () => {
    let now = 0;
    let heartbeat;
    const publisher = new InMemoryProjectEventPublisher({
      now: () => now,
      maxStreamLifetimeMs: 100,
      setIntervalFn: (callback) => {
        heartbeat = callback;
        return { unref() {} };
      },
      clearIntervalFn() {}
    });
    const membership = subscriber();
    const session = subscriber({ userId: 11, sessionId: 'session-2' });
    const lifetime = subscriber({ userId: 12, sessionId: 'session-3' });
    publisher.subscribe(membership);
    publisher.subscribe(session);
    publisher.subscribe(lifetime);

    publisher.disconnectUser(10, { projectId: 1 });
    publisher.disconnectSession('session-2');
    expect(membership.onClose).toHaveBeenCalledWith('authorization_changed');
    expect(session.onClose).toHaveBeenCalledWith('session_revoked');

    now = 101;
    heartbeat();
    expect(lifetime.onClose).toHaveBeenCalledWith('maximum_lifetime');
    expect(publisher.subscriberCount()).toBe(0);
  });
});
