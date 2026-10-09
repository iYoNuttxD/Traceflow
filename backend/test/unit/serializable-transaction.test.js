import { describe, expect, it, vi } from 'vitest';
import { serializableTransaction } from '../../src/database/serializable-transaction.js';

describe('serializableTransaction', () => {
  it('repete somente conflitos P2034 e limita as tentativas', async () => {
    const client = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
        .mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: 'P2034' }))
        .mockResolvedValueOnce({ ok: true })
    };
    const operation = vi.fn();
    await expect(serializableTransaction(operation, { client })).resolves.toEqual({ ok: true });
    expect(client.$transaction).toHaveBeenCalledTimes(3);
    expect(client.$transaction).toHaveBeenCalledWith(
      operation,
      expect.objectContaining({ isolationLevel: 'Serializable' })
    );
  });

  it('propaga o último conflito após exatamente três tentativas esgotadas', async () => {
    const failures = ['first', 'second', 'last'].map((message) =>
      Object.assign(new Error(message), { code: 'P2034' })
    );
    const client = {
      $transaction: vi
        .fn()
        .mockRejectedValue(failures[2])
        .mockRejectedValueOnce(failures[0])
        .mockRejectedValueOnce(failures[1])
    };
    await expect(serializableTransaction(vi.fn(), { client })).rejects.toBe(failures[2]);
    expect(client.$transaction).toHaveBeenCalledTimes(3);
  });

  it('não repete falha não transacional', async () => {
    const failure = Object.assign(new Error('database unavailable'), { code: 'P1001' });
    const client = { $transaction: vi.fn().mockRejectedValue(failure) };
    await expect(serializableTransaction(vi.fn(), { client })).rejects.toBe(failure);
    expect(client.$transaction).toHaveBeenCalledOnce();
  });
});
