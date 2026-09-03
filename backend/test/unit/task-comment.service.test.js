import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    listCursor: vi.fn(),
    findActiveById: vi.fn(),
    createAtomic: vi.fn(),
    updateContentAtomic: vi.fn(),
    softDeleteAtomic: vi.fn()
  },
  taskRepository: {
    findTaskById: vi.fn()
  },
  publisher: { publish: vi.fn() }
}));

vi.mock('../../src/modules/tasks/repositories/task-comment.repository.js', () => ({
  taskCommentRepository: mocks.repository
}));
vi.mock('../../src/modules/tasks/task.repository.js', () => ({
  taskRepository: mocks.taskRepository,
  taskInclude: {}
}));
vi.mock('../../src/shared/events/index.js', () => ({
  PROJECT_EVENT_TYPES: {
    TASK_COMMENT_CREATED: 'task.comment.created',
    TASK_COMMENT_UPDATED: 'task.comment.updated',
    TASK_COMMENT_DELETED: 'task.comment.deleted'
  },
  projectEventPublisher: mocks.publisher
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
  mocks.repository.listCursor.mockResolvedValue([storedComment]);
  mocks.repository.createAtomic.mockResolvedValue(storedComment);
  mocks.repository.updateContentAtomic.mockResolvedValue({
    outcome: 'UPDATED',
    comment: { ...storedComment, content: 'Novo texto.', editedAt: new Date() }
  });
  mocks.repository.softDeleteAtomic.mockResolvedValue({
    outcome: 'DELETED',
    comment: {
      ...storedComment,
      deletedAt: new Date('2026-08-30T10:00:00.000Z'),
      deletedById: 10
    }
  });
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
    expect(mocks.publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task.comment.created',
        projectId: 7,
        taskId: 42,
        data: { comment: storedComment }
      })
    );
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
    expect(mocks.publisher.publish).not.toHaveBeenCalled();
  });

  it('mantém a mutation concluída quando o publisher falha', async () => {
    mocks.publisher.publish.mockRejectedValueOnce(new Error('publisher indisponível'));
    await expect(
      taskCommentService.createTaskComment(
        42,
        { content: 'Persistido.' },
        { actorUserId: 10, membershipRole: 'MEMBER' }
      )
    ).resolves.toMatchObject({ id: 5, content: 'Comentário persistido.' });
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
    expect(mocks.publisher.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'task.comment.updated' })
    );
  });

  it('MEMBER exclui somente o próprio; MANAGER e OWNER excluem qualquer', async () => {
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'MEMBER' })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 10, membershipRole: 'MEMBER' })
    ).resolves.toMatchObject({ deletionActorType: 'AUTHOR' });
    mocks.repository.softDeleteAtomic.mockResolvedValue({
      outcome: 'DELETED',
      comment: {
        ...storedComment,
        deletedAt: new Date('2026-08-30T10:00:00.000Z'),
        deletedById: 99
      }
    });
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'MANAGER' })
    ).resolves.toMatchObject({ deletionActorType: 'MODERATION' });
    await expect(
      taskCommentService.deleteTaskComment(42, 5, { actorUserId: 99, membershipRole: 'OWNER' })
    ).resolves.toMatchObject({ deletionActorType: 'MODERATION' });
    expect(mocks.publisher.publish).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'task.comment.deleted' })
    );
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
    expect(asManager.pagination).toEqual({ limit: 30, hasMore: false, nextCursor: null });
  });

  it('usa 30 por lote como padrão do contrato cursor', async () => {
    mocks.repository.listCursor.mockResolvedValue([]);
    await taskCommentService.listTaskComments(
      42,
      {},
      { actorUserId: 10, membershipRole: 'MEMBER' }
    );
    expect(mocks.repository.listCursor).toHaveBeenCalledWith(42, { before: null, limit: 30 });
  });

  it('devolve comentário excluído como marcador sem conteúdo nem ações', async () => {
    const deletedByAuthor = {
      ...storedComment,
      id: 6,
      deletedAt: new Date('2026-08-30T10:00:00.000Z'),
      deletedById: 10
    };
    const deletedByModerator = {
      ...storedComment,
      id: 7,
      deletedAt: new Date('2026-08-30T11:00:00.000Z'),
      deletedById: 99
    };
    mocks.repository.listCursor.mockResolvedValue([deletedByModerator, deletedByAuthor]);

    // Mesmo o moderador que excluiu não recupera o conteúdo pela listagem.
    const listed = await taskCommentService.listTaskComments(
      42,
      {},
      { actorUserId: 99, membershipRole: 'MANAGER' }
    );
    expect(listed.comments).toMatchObject([
      { id: 7, content: null, deletionActorType: 'MODERATION', canEdit: false, canDelete: false },
      { id: 6, content: null, deletionActorType: 'AUTHOR', canEdit: false, canDelete: false }
    ]);
    expect(JSON.stringify(listed)).not.toContain('Comentário persistido.');
    // Autoria e cronologia permanecem para o histórico do RF31.
    expect(listed.comments[0].author).toEqual({ id: 10, name: 'Autora' });
    expect(listed.comments[0].createdAt).toEqual(storedComment.createdAt);
  });

  it('não afirma moderação quando a autoria da exclusão é desconhecida', async () => {
    mocks.repository.listCursor.mockResolvedValue([
      { ...storedComment, deletedAt: new Date('2026-08-30T10:00:00.000Z'), deletedById: null }
    ]);
    const listed = await taskCommentService.listTaskComments(
      42,
      {},
      { actorUserId: 10, membershipRole: 'MEMBER' }
    );
    expect(listed.comments[0]).toMatchObject({ content: null, deletionActorType: 'UNKNOWN' });
  });
});
