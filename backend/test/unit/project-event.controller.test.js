import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock('../../src/modules/projects/services/project-event.service.js', () => ({
  projectEventService: { subscribe: mocks.subscribe }
}));

import { projectEventController } from '../../src/modules/projects/project-event.controller.js';

function response({ writable = true } = {}) {
  const res = new EventEmitter();
  res.headers = {};
  res.status = vi.fn(() => res);
  res.setHeader = vi.fn((name, value) => {
    res.headers[name] = value;
  });
  res.write = vi.fn(() => writable);
  res.end = vi.fn(() => {
    res.writableEnded = true;
  });
  res.flushHeaders = vi.fn();
  res.writableEnded = false;
  res.destroyed = false;
  return res;
}

describe('projectEventController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(vi.fn());
  });

  it('abre SSE com headers, heartbeat/data seguros e cleanup no close', async () => {
    const unsubscribe = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);
    const req = {
      authorizedProjectId: 2,
      auth: { user: { id: 10 }, session: { id: 30 } },
      projectMembership: { role: 'VIEWER' }
    };
    const res = response();
    const next = vi.fn();

    await projectEventController.stream(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.headers).toMatchObject({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    });
    expect(res.flushHeaders).toHaveBeenCalledOnce();
    expect(res.write).toHaveBeenCalledWith('retry: 3000\n\n');

    const { client } = mocks.subscribe.mock.calls[0][0];
    client.send({ type: 'task.comment.created', data: {} });
    client.heartbeat('2026-09-02T12:00:00.000Z');
    expect(res.write).toHaveBeenCalledWith('data: {"type":"task.comment.created","data":{}}\n\n');
    expect(res.write).toHaveBeenCalledWith(': heartbeat 2026-09-02T12:00:00.000Z\n\n');

    res.emit('close');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('encerra imediatamente quando o transporte sinaliza backpressure', async () => {
    const unsubscribe = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);
    const res = response({ writable: false });
    await projectEventController.stream(
      {
        authorizedProjectId: 2,
        auth: { user: { id: 10 }, session: { id: 30 } },
        projectMembership: { role: 'VIEWER' }
      },
      res,
      vi.fn()
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(res.end).toHaveBeenCalledOnce();
  });
});
