import { describe, expect, it, vi } from 'vitest';
import { createProjectEventService } from '../../src/modules/projects/services/project-event.service.js';

const rawComment = {
  id: 9,
  taskId: 7,
  authorUserId: 10,
  content: 'Comentário seguro.',
  editedAt: null,
  deletedAt: null,
  deletedById: null,
  createdAt: new Date('2026-09-02T12:00:00.000Z'),
  authorUser: { id: 10, name: 'Autora' }
};

function envelope(comment = rawComment) {
  return {
    type: 'task.comment.created',
    projectId: 2,
    taskId: 7,
    occurredAt: '2026-09-02T12:00:00.000Z',
    data: { comment }
  };
}

describe('projectEventService', () => {
  it('apresenta DTO de comentário conforme o subscriber sem expor campos internos', () => {
    let subscription;
    const publisher = {
      subscribe: vi.fn((value) => {
        subscription = value;
        return vi.fn();
      })
    };
    const client = { send: vi.fn(() => true), heartbeat: vi.fn(), close: vi.fn() };
    const service = createProjectEventService({ publisher });
    service.subscribe({
      projectId: 2,
      actorUserId: 20,
      membershipRole: 'MEMBER',
      sessionId: 30,
      client
    });

    subscription.onEvent(envelope());
    expect(client.send).toHaveBeenCalledWith({
      type: 'task.comment.created',
      projectId: 2,
      taskId: 7,
      occurredAt: '2026-09-02T12:00:00.000Z',
      data: {
        comment: expect.objectContaining({
          id: 9,
          author: { id: 10, name: 'Autora' },
          canEdit: false,
          canDelete: false
        })
      }
    });
    expect(JSON.stringify(client.send.mock.calls)).not.toContain('authorUserId');
    expect(JSON.stringify(client.send.mock.calls)).not.toContain('deletedById');
  });

  it('preserva tombstone e permissões de moderação no envelope público', () => {
    let subscription;
    const publisher = {
      subscribe(value) {
        subscription = value;
        return () => {};
      }
    };
    const client = { send: vi.fn(() => true), heartbeat: vi.fn(), close: vi.fn() };
    createProjectEventService({ publisher }).subscribe({
      projectId: 2,
      actorUserId: 20,
      membershipRole: 'MANAGER',
      sessionId: 30,
      client
    });

    subscription.onEvent(envelope());
    expect(client.send.mock.calls[0][0].data.comment.canDelete).toBe(true);
    subscription.onEvent(
      envelope({
        ...rawComment,
        deletedAt: new Date('2026-09-02T13:00:00.000Z'),
        deletedById: 20
      })
    );
    expect(client.send.mock.calls[1][0].data.comment).toMatchObject({
      content: null,
      deletionActorType: 'MODERATION',
      canEdit: false,
      canDelete: false
    });
  });
});
