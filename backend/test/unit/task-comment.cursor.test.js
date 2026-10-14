import { describe, expect, it } from 'vitest';
import {
  decodeTaskCommentCursor,
  encodeTaskCommentCursor,
  parseTaskCommentLimit
} from '../../src/modules/tasks/services/task-comment.cursor.js';

describe('task comment cursor', () => {
  it('codifica e decodifica createdAt + id sem expor parsing ao consumidor', () => {
    const cursor = encodeTaskCommentCursor({ id: 41, createdAt: '2026-09-02T12:00:00.000Z' });
    expect(cursor).toBe('WyIyMDI2LTA5LTAyVDEyOjAwOjAwLjAwMFoiLDQxXQ');
    expect(decodeTaskCommentCursor('WyIyMDI2LTA5LTAyVDEyOjAwOjAwLjAwMFoiLDQyXQ')).toEqual({
      id: 42,
      createdAt: new Date('2026-09-02T12:00:00.000Z')
    });
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
    expect(parseTaskCommentLimit()).toBe(30);
    expect(parseTaskCommentLimit(1)).toBe(1);
    for (const invalid of [0, -1, 1.5, NaN]) {
      expect(() => parseTaskCommentLimit(invalid)).toThrowError(
        expect.objectContaining({ statusCode: 400 })
      );
    }
    expect(parseTaskCommentLimit(100)).toBe(100);
    expect(() => parseTaskCommentLimit(101)).toThrowError(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});
