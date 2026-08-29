import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    listPage: vi.fn(),
    findActiveById: vi.fn(),
    createAtomic: vi.fn(),
    updateContentAtomic: vi.fn(),
    softDeleteAtomic: vi.fn()
  },
  taskRepository: {
    findTaskById: vi.fn()
  }
}));

vi.mock('../../src/modules/tasks/repositories/task-comment.repository.js', () => ({
  taskCommentRepository: mocks.repository
}));
vi.mock('../../src/modules/tasks/task.repository.js', () => ({
  taskRepository: mocks.taskRepository,
  taskInclude: {}
}));

import {
  COMMENT_MAX_LENGTH,
  taskCommentService
} from '../../src/modules/tasks/services/task-comment.service.js';

const task = { id: 42, projectId: 7 };
const storedComment = {
  id: 5,
  taskId: 42,
  authorUserId: 10,
  content: 'Comentário persistido.',
  editedAt: null,
  createdAt: new Date('2026-08-29T12:00:00.000Z'),
  authorUser: { id: 10, name: 'Autora' }
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.taskRepository.findTaskById.mockResolvedValue(task);
  mocks.repository.findActiveById.mockResolvedValue(storedComment);
  mocks.repository.createAtomic.mockResolvedValue(storedComment);
  mocks.repository.updateContentAtomic.mockResolvedValue({
    outcome: 'UPDATED',
    comment: { ...storedComment, content: 'Novo texto.', editedAt: new Date() }
  });
  mocks.repository.softDeleteAtomic.mockResolvedValue({ outcome: 'DELETED' });
});

describe('taskCommentService — conteúdo', () => {
  it('normaliza espaços e usa o autor do contexto', async () => {
    const context = { actorUserId: 10, membershipRole: 'MEMBER', requestId: 'req-1' };
    const comment = await taskCommentService.createTaskComment(
      42,
      { content: '  Olá.  ' },
      context
    );
    expect(mocks.repository.createAtomic).toHaveBeenCalledWith(
      { projectId: 7, taskId: 42, authorUserId: 10, content: 'Olá.' },
      expect.objectContaining({
        action: 'TASK_COMMENT_CREATED',
        projectId: 7,
        actorUserId: 10,
        metadataJson: { taskId: 42 }
      })
    );
    expect(comment).toMatchObject({ id: 5, canEdit: true, canDelete: true });
  });

  it.each(['', '   ', undefined, null])('rejeita conteúdo vazio (%j)', async (content) => {
    await expect(
      taskCommentService.createTaskComment(42, { content }, { actorUserId: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.repository.createAtomic).not.toHaveBeenCalled();
  });

  it('rejeita conteúdo acima do limite e aceita o limite exato', async () => {
    await expect(
      taskCommentService.createTaskComment(
        42,
        { content: 'a'.repeat(COMMENT_MAX_LENGTH + 1) },
        { actorUserId: 10 }
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      taskCommentService.createTaskComment(
        42,
        { content: 'a'.repeat(COMMENT_MAX_LENGTH) },
        { actorUserId: 10, membershipRole: 'MEMBER' }
      )
    ).resolves.toBeTruthy();
  });

  it('propaga 404 quando a tarefa não existe', async () => {
    mocks.taskRepository.findTaskById.mockResolvedValue(null);
    await expect(
      taskCommentService.createTaskComment(42, { content: 'x' }, { actorUserId: 10 })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('taskCommentService — política de edição e exclusão', () => {
  it('permite edição somente ao autor, inclusive contra OWNER', async () => {
    await expect(
      taskCommentService.updateTaskComment(
        42,
        5,
        { content: 'Novo texto.' },
        { actorUserId: 99, membershipRole: 'OWNER' }
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      taskCommentService.updateTaskComment(
        42,
        5,
        { content: 'Novo texto.' },
        { actorUserId: 10, membershipRole: 'MEMBER' }
      )
    ).resolves.toMatchObject({ content: 'Novo texto.' });
  });

  it('MEMBER exclui somente o próprio; MANAGER e OWNER excluem qualquer', async () => {
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 10, membershipRole: 'MEMBER' })
    ).resolves.toBeUndefined();
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'MANAGER' })
    ).resolves.toBeUndefined();
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'OWNER' })
    ).resolves.toBeUndefined();
  });

  it('responde 404 para comentário inexistente ou perdido por concorrência', async () => {
    mocks.repository.findActiveById.mockResolvedValue(null);
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 10, membershipRole: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 404 });

    mocks.repository.findActiveById.mockResolvedValue(storedComment);
    mocks.repository.updateContentAtomic.mockResolvedValue({ outcome: 'NOT_FOUND' });
    await expect(
      taskCommentService.updateTaskComment(
        42,
        5,
        { content: 'x' },
        { actorUserId: 10, membershipRole: 'MEMBER' }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('taskCommentService — listagem e permissões do DTO', () => {
  it('calcula flags por papel e não expõe e-mail do autor', async () => {
    mocks.repository.listPage.mockResolvedValue([1, [storedComment]]);
    const asViewer = await taskCommentService.listTaskComments(
      42,
      {},
      { actorUserId: 10, membershipRole: 'VIEWER' }
    );
    expect(asViewer.permissions).toEqual({ canComment: false, canModerate: false });
    expect(asViewer.comments[0]).toMatchObject({ canEdit: false, canDelete: false });
    expect(JSON.stringify(asViewer)).not.toContain('email');

    const asManager = await taskCommentService.listTaskComments(
      42,
      {},
      { actorUserId: 99, membershipRole: 'MANAGER' }
    );
    expect(asManager.permissions).toEqual({ canComment: true, canModerate: true });
    expect(asManager.comments[0]).toMatchObject({ canEdit: false, canDelete: true });
    expect(asManager.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
});
