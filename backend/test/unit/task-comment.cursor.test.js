import { describe, expect, it } from 'vitest';
import {
  TASK_COMMENT_DEFAULT_LIMIT,
  decodeTaskCommentCursor,
  encodeTaskCommentCursor,
  parseTaskCommentLimit
} from '../../src/modules/tasks/services/task-comment.cursor.js';

describe('task comment cursor', () => {
  it('codifica e decodifica createdAt + id sem expor parsing ao consumidor', () => {
    const cursor = encodeTaskCommentCursor({ id: 41, createdAt: '2026-09-02T12:00:00.000Z' });
    expect(cursor).not.toContain('2026-09-02');
    expect(decodeTaskCommentCursor(cursor)).toEqual({
      id: 41,
      createdAt: new Date('2026-09-02T12:00:00.000Z')
    });
  });

  it.each([
    'inválido',
    Buffer.from('{}').toString('base64url'),
    Buffer.from('["x",0]').toString('base64url')
  ])('rejeita cursor inválido %s', (cursor) => {
    expect(() => decodeTaskCommentCursor(cursor)).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it('aplica limit default 30 e máximo 100', () => {
    expect(parseTaskCommentLimit()).toBe(TASK_COMMENT_DEFAULT_LIMIT);
    expect(parseTaskCommentLimit(100)).toBe(100);
    expect(() => parseTaskCommentLimit(101)).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});
