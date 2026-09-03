import { TaskServiceError } from '../task.schema.js';

export const TASK_COMMENT_DEFAULT_LIMIT = 30;
export const TASK_COMMENT_MAX_LIMIT = 100;

function invalidCursor() {
  return new TaskServiceError('Cursor de comentários inválido.', 400);
}

export function encodeTaskCommentCursor(comment) {
  return Buffer.from(
    JSON.stringify([new Date(comment.createdAt).toISOString(), Number(comment.id)])
  ).toString('base64url');
}

export function decodeTaskCommentCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) throw invalidCursor();
    const [createdAtValue, idValue] = parsed;
    const createdAt = new Date(createdAtValue);
    const id = Number(idValue);
    if (
      typeof createdAtValue !== 'string' ||
      Number.isNaN(createdAt.getTime()) ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      throw invalidCursor();
    }
    return { createdAt, id };
  } catch (error) {
    if (error instanceof TaskServiceError) throw error;
    throw invalidCursor();
  }
}

export function parseTaskCommentLimit(value) {
  const limit = value == null ? TASK_COMMENT_DEFAULT_LIMIT : Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > TASK_COMMENT_MAX_LIMIT) {
    throw new TaskServiceError(
      `limit deve ser um inteiro entre 1 e ${TASK_COMMENT_MAX_LIMIT}.`,
      400
    );
  }
  return limit;
}
