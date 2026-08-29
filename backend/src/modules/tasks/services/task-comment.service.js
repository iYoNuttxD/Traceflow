import { taskCommentRepository } from '../repositories/task-comment.repository.js';
import { TaskServiceError, buildPagination, parseTaskId } from '../task.schema.js';
import { ensureTaskExists } from '../task.service-support.js';
import { buildAuditEvent } from '../../audit/audit.service.js';

export const COMMENT_MAX_LENGTH = 2000;
const MODERATOR_ROLES = new Set(['MANAGER', 'OWNER']);

// Política S1-05: VIEWER somente lê; MEMBER edita e exclui apenas o próprio comentário;
// MANAGER e OWNER excluem qualquer comentário do projeto, mas não editam texto de terceiros.
function canModerate(role) {
  return MODERATOR_ROLES.has(role);
}

function normalizeCommentContent(value) {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) throw new TaskServiceError('O comentário não pode ser vazio.', 400);
  if (content.length > COMMENT_MAX_LENGTH) {
    throw new TaskServiceError(
      `O comentário deve possuir no máximo ${COMMENT_MAX_LENGTH} caracteres.`,
      400
    );
  }
  return content;
}

const parseCommentId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskServiceError('ID do comentário inválido.', 400);
  }
  return parsed;
};

function commentNotFound() {
  return new TaskServiceError('Comentário não encontrado.', 404);
}

function formatComment(comment, context = {}) {
  const isAuthor = comment.authorUserId === context.actorUserId;
  const role = context.membershipRole;
  return {
    id: comment.id,
    taskId: comment.taskId,
    content: comment.content,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    author: comment.authorUser,
    canEdit: isAuthor && role !== 'VIEWER',
    canDelete: (isAuthor && role !== 'VIEWER') || canModerate(role)
  };
}

function commentAuditEvent(action, { taskId, commentId, context }) {
  return buildAuditEvent({
    actorUserId: context.actorUserId,
    projectId: context.projectId,
    requestId: context.requestId,
    action,
    resourceType: 'TaskComment',
    resourceId: commentId ?? null,
    metadata: { taskId }
  });
}

export const taskCommentService = {
  async listTaskComments(taskId, query = {}, context = {}) {
    const id = parseTaskId(taskId);
    await ensureTaskExists(id);
    const pagination = buildPagination(query, 10);
    const [total, comments] = await taskCommentRepository.listPage(id, pagination);
    return {
      taskId: id,
      total,
      comments: comments.map((comment) => formatComment(comment, context)),
      permissions: {
        canComment: context.membershipRole !== 'VIEWER',
        canModerate: canModerate(context.membershipRole)
      },
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total ? Math.ceil(total / pagination.limit) : 0
      }
    };
  },

  async createTaskComment(taskId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const content = normalizeCommentContent(data?.content);
    const comment = await taskCommentRepository.createAtomic(
      {
        projectId: task.projectId,
        taskId: id,
        authorUserId: context.actorUserId,
        content
      },
      commentAuditEvent('TASK_COMMENT_CREATED', {
        taskId: id,
        context: { ...context, projectId: task.projectId }
      })
    );
    return formatComment(comment, context);
  },

  async updateTaskComment(taskId, commentId, data, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const parsedCommentId = parseCommentId(commentId);
    const content = normalizeCommentContent(data?.content);
    const existing = await taskCommentRepository.findActiveById(id, parsedCommentId);
    if (!existing) throw commentNotFound();
    if (existing.authorUserId !== context.actorUserId) {
      throw new TaskServiceError('Somente o autor pode editar o comentário.', 403);
    }
    const result = await taskCommentRepository.updateContentAtomic(
      id,
      parsedCommentId,
      content,
      commentAuditEvent('TASK_COMMENT_UPDATED', {
        taskId: id,
        commentId: parsedCommentId,
        context: { ...context, projectId: task.projectId }
      })
    );
    if (result.outcome !== 'UPDATED') throw commentNotFound();
    return formatComment(result.comment, context);
  },

  async deleteTaskComment(taskId, commentId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const parsedCommentId = parseCommentId(commentId);
    const existing = await taskCommentRepository.findActiveById(id, parsedCommentId);
    if (!existing) throw commentNotFound();
    const isAuthor = existing.authorUserId === context.actorUserId;
    if (!isAuthor && !canModerate(context.membershipRole)) {
      throw new TaskServiceError('Você não possui permissão para excluir este comentário.', 403);
    }
    const result = await taskCommentRepository.softDeleteAtomic(
      id,
      parsedCommentId,
      context.actorUserId,
      commentAuditEvent('TASK_COMMENT_DELETED', {
        taskId: id,
        commentId: parsedCommentId,
        context: { ...context, projectId: task.projectId }
      })
    );
    if (result.outcome !== 'DELETED') throw commentNotFound();
  }
};
