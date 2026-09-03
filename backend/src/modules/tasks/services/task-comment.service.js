import { taskCommentRepository } from '../repositories/task-comment.repository.js';
import { TaskServiceError, parseTaskId } from '../task.schema.js';
import { ensureTaskExists } from '../task.service-support.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { logger } from '../../../shared/logger/index.js';
import { PROJECT_EVENT_TYPES, projectEventPublisher } from '../../../shared/events/index.js';
import { canModerateTaskComments, formatTaskComment } from './task-comment.presenter.js';
import {
  decodeTaskCommentCursor,
  encodeTaskCommentCursor,
  parseTaskCommentLimit
} from './task-comment.cursor.js';

export const COMMENT_MAX_LENGTH = 2000;

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

async function publishCommentEvent(type, projectId, taskId, comment) {
  const mutationAt = comment.deletedAt || comment.editedAt || comment.createdAt || new Date();
  try {
    await projectEventPublisher.publish({
      type,
      projectId,
      taskId,
      occurredAt: new Date(mutationAt).toISOString(),
      data: { comment }
    });
  } catch (error) {
    logger.warn('Comentário persistido sem propagação pelo stream do projeto.', {
      event: 'project_event_publish_failed',
      type,
      projectId,
      taskId,
      commentId: comment.id,
      error: { name: error?.name || 'Error' }
    });
  }
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
    const limit = parseTaskCommentLimit(query.limit);
    const before = decodeTaskCommentCursor(query.before);
    const rows = await taskCommentRepository.listCursor(id, { before, limit });
    const hasMore = rows.length > limit;
    const comments = hasMore ? rows.slice(0, limit) : rows;
    return {
      taskId: id,
      comments: comments.map((comment) => formatTaskComment(comment, context)),
      permissions: {
        canComment: context.membershipRole !== 'VIEWER',
        canModerate: canModerateTaskComments(context.membershipRole)
      },
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? encodeTaskCommentCursor(comments.at(-1)) : null
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
    const formatted = formatTaskComment(comment, context);
    await publishCommentEvent(
      PROJECT_EVENT_TYPES.TASK_COMMENT_CREATED,
      task.projectId,
      id,
      comment
    );
    return formatted;
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
    const formatted = formatTaskComment(result.comment, context);
    await publishCommentEvent(
      PROJECT_EVENT_TYPES.TASK_COMMENT_UPDATED,
      task.projectId,
      id,
      result.comment
    );
    return formatted;
  },

  async deleteTaskComment(taskId, commentId, context = {}) {
    const id = parseTaskId(taskId);
    const task = await ensureTaskExists(id);
    const parsedCommentId = parseCommentId(commentId);
    const existing = await taskCommentRepository.findActiveById(id, parsedCommentId);
    if (!existing) throw commentNotFound();
    const isAuthor = existing.authorUserId === context.actorUserId;
    if (!isAuthor && !canModerateTaskComments(context.membershipRole)) {
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
    const formatted = formatTaskComment(result.comment, context);
    await publishCommentEvent(
      PROJECT_EVENT_TYPES.TASK_COMMENT_DELETED,
      task.projectId,
      id,
      result.comment
    );
    return formatted;
  }
};
