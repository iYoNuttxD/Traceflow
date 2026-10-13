import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkArchitecture } from '../../scripts/check-architecture.js';
import { limitLockWaits, lockWaitSecondsFor } from '../../src/database/lock-wait.js';

describe('S202-F29 — F1-08 regra do limite e envoltório do cliente', () => {
  it.each([
    [undefined, 2],
    [5000, 2],
    [15000, 5],
    [60000, 5],
    [3000, 1],
    [1000, 1],
    [6500, 3]
  ])('prazo %s ms → limite de %i s', (timeout, seconds) => {
    expect(lockWaitSecondsFor(timeout)).toBe(seconds);
  });

  it('a forma interativa executa o limite antes do callback e devolve o resultado dele', async () => {
    const calls = [];
    const tx = {
      $executeRawUnsafe: vi.fn(async (sql) => calls.push(sql))
    };
    const client = {
      $transaction: vi.fn(async (argument, options) =>
        typeof argument === 'function' ? argument(tx) : [argument, options]
      )
    };
    limitLockWaits(client);

    const result = await client.$transaction(
      async () => {
        calls.push('callback');
        return 'resultado';
      },
      { timeout: 15000 }
    );

    expect(result).toBe('resultado');
    expect(calls).toEqual(['SET SESSION innodb_lock_wait_timeout = 5', 'callback']);
  });

  it('a forma em lote segue sem mudança', async () => {
    const original = vi.fn(async (argument, options) => ({ argument, options }));
    const client = { $transaction: original };
    limitLockWaits(client);
    const batch = ['a', 'b'];

    await expect(client.$transaction(batch, { isolationLevel: 'Serializable' })).resolves.toEqual({
      argument: batch,
      options: { isolationLevel: 'Serializable' }
    });
    expect(original).toHaveBeenCalledWith(batch, { isolationLevel: 'Serializable' });
  });

  it('a regra de arquitetura recusa PrismaClient criado fora de src/database', () => {
    const rules = checkArchitecture({
      backendRoot: resolve(process.cwd(), 'test/fixtures/architecture/invalid'),
      frontendRoot: resolve(process.cwd(), 'test/fixtures/architecture/empty-frontend')
    }).map((violation) => violation.rule);

    expect(rules).toContain('prisma-client-only-in-database');
  });
});
