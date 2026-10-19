import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guardTransactions,
  RECOVERY_WAIT_MS,
  settleDeadlineMs
} from '../../src/database/transaction-guard.js';

const expired = () =>
  Object.assign(new Error('Transaction already closed'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2028'
  });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function guarded({ transaction, ...overrides } = {}) {
  const tx = {
    $executeRawUnsafe: vi.fn(async () => 0),
    $queryRawUnsafe: vi.fn(async () => [{ id: 41n }])
  };
  const original = vi.fn(
    transaction ??
      (async (argument, options) =>
        typeof argument === 'function' ? argument(tx) : { argument, options })
  );
  const deps = {
    killQuery: vi.fn(async () => undefined),
    killConnection: vi.fn(async () => undefined),
    log: { warn: vi.fn(), error: vi.fn() },
    onUnavailable: vi.fn(),
    ...overrides
  };
  const client = guardTransactions({ $transaction: original }, deps);
  return { client, deps, original, tx };
}

const settled = (promise) =>
  promise.then(
    (value) => ({ state: 'resolvida', value }),
    (error) => ({ state: 'rejeitada', error })
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('TF-REV-013 — prazo da recuperação e prazo duro da transação', () => {
  it('G-01 P2028 com descarte pendente rejeita em até 2 s depois do erro e marca UNCONFIRMED_RECOVERY (A1)', async () => {
    vi.useFakeTimers();
    const error = expired();
    const { client, deps } = guarded({ killConnection: vi.fn(() => new Promise(() => {})) });

    let outcome = null;
    void settled(
      client.$transaction(async () => {
        throw error;
      })
    ).then((result) => {
      outcome = result;
    });
    await vi.advanceTimersByTimeAsync(RECOVERY_WAIT_MS - 1);
    expect(outcome).toBeNull();
    expect(deps.onUnavailable).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toEqual({ state: 'rejeitada', error });
    expect(deps.killConnection).toHaveBeenCalledWith(41);
    expect(deps.onUnavailable).toHaveBeenCalledExactlyOnceWith('UNCONFIRMED_RECOVERY');
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_recovery_unconfirmed',
        connectionId: 41,
        reason: 'TIMEOUT'
      })
    );
  });

  it('G-02 descarte rejeitado marca UNCONFIRMED_RECOVERY e mantém o erro original', async () => {
    const error = expired();
    const { client, deps } = guarded({
      killConnection: vi.fn(async () => {
        throw Object.assign(new Error('sem conexão'), { code: 'P1001' });
      })
    });

    await expect(
      client.$transaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(deps.onUnavailable).toHaveBeenCalledExactlyOnceWith('UNCONFIRMED_RECOVERY');
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_transaction_kill_failed',
        scope: 'connection',
        causeCode: 'P1001'
      })
    );
    expect(deps.log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'database_recovery_unconfirmed', reason: 'REJECTED' })
    );
  });

  it('G-03 descarte confirmado dentro do prazo não marca indisponibilidade', async () => {
    vi.useFakeTimers();
    const kill = deferred();
    const error = expired();
    const { client, deps } = guarded({ killConnection: vi.fn(() => kill.promise) });

    const outcome = settled(
      client.$transaction(async () => {
        throw error;
      })
    );
    await vi.advanceTimersByTimeAsync(RECOVERY_WAIT_MS - 500);
    kill.resolve();

    expect(await outcome).toEqual({ state: 'rejeitada', error });
    expect(deps.onUnavailable).not.toHaveBeenCalled();
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'database_connection_discarded', connectionId: 41 })
    );
  });

  it.each([
    [undefined, 12000],
    [{ timeout: 15000, maxWait: 5000 }, 25000],
    [{ timeout: 30000, maxWait: 2000 }, 37000]
  ])(
    'G-04 trabalho que não assenta (opções %j) rejeita em %i ms e marca UNSETTLED_TRANSACTION',
    async (options, deadline) => {
      vi.useFakeTimers();
      const { client, deps } = guarded({ transaction: () => new Promise(() => {}) });

      expect(settleDeadlineMs(options)).toBe(deadline);
      let outcome = null;
      void settled(client.$transaction(async () => 'nunca', options)).then((result) => {
        outcome = result;
      });
      await vi.advanceTimersByTimeAsync(deadline - 1);
      expect(outcome).toBeNull();

      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toMatchObject({
        state: 'rejeitada',
        error: { name: 'TransactionDeadlineError', code: 'TRANSACTION_DEADLINE' }
      });
      expect(deps.onUnavailable).toHaveBeenCalledExactlyOnceWith('UNSETTLED_TRANSACTION');
      expect(deps.log.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ event: 'database_transaction_unsettled', deadlineMs: deadline })
      );
    }
  );

  it('G-05 a rejeição tardia do Prisma depois do prazo duro não vira unhandledRejection', async () => {
    vi.useFakeTimers();
    const late = deferred();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { client } = guarded({ transaction: () => late.promise });
      const outcome = settled(client.$transaction(async () => 'nunca'));
      await vi.advanceTimersByTimeAsync(settleDeadlineMs());
      expect((await outcome).state).toBe('rejeitada');

      late.reject(new Error('rejeição tardia'));
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('G-06 o caminho feliz e o erro comum não deixam timer nem marcam indisponibilidade', async () => {
    vi.useFakeTimers();
    const { client, deps } = guarded();

    await expect(client.$transaction(async () => 'ok')).resolves.toBe('ok');
    await expect(
      client.$transaction(async () => {
        throw new Error('falha comum');
      })
    ).rejects.toThrow('falha comum');

    expect(vi.getTimerCount()).toBe(0);
    expect(deps.onUnavailable).not.toHaveBeenCalled();
    expect(deps.killConnection).not.toHaveBeenCalled();
  });
});
