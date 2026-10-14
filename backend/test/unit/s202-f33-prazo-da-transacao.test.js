import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardTransactions } from '../../src/database/transaction-guard.js';

function fakeClient() {
  const calls = [];
  const tx = {
    $executeRawUnsafe: vi.fn(async (sql) => {
      calls.push(sql);
      return 0;
    }),
    $queryRawUnsafe: vi.fn(async (sql) => {
      calls.push(sql);
      return [{ id: 41n }];
    })
  };
  const original = vi.fn(async (argument, options) =>
    typeof argument === 'function' ? argument(tx) : { argument, options }
  );
  return { client: { $transaction: original }, original, tx, calls };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function guarded(overrides = {}) {
  const fake = fakeClient();
  const deps = {
    killQuery: vi.fn(async () => undefined),
    killConnection: vi.fn(async () => undefined),
    log: { warn: vi.fn(), error: vi.fn() },
    ...overrides
  };
  guardTransactions(fake.client, deps);
  return { ...fake, deps };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('S202-F33 — F1-06 envoltório do prazo próprio', () => {
  it.each([
    [undefined, 6000],
    [{}, 6000],
    [{ timeout: 5000 }, 6000],
    [{ timeout: 15000, maxWait: 5000 }, 16000],
    [{ timeout: 3000, isolationLevel: 'Serializable' }, 4000]
  ])(
    'opções %j → prazo do Prisma de %i ms, demais opções preservadas',
    async (options, timeout) => {
      const { client, original } = guarded();

      await client.$transaction(async () => 'ok', options);

      expect(original.mock.calls[0][1]).toEqual({ ...options, timeout });
    }
  );

  it('começa pelo limite de espera do prazo pedido e pela conexão, depois o callback, e devolve o resultado', async () => {
    const { client, calls } = guarded();

    const result = await client.$transaction(
      async () => {
        calls.push('callback');
        return 'resultado';
      },
      { timeout: 15000 }
    );

    expect(result).toBe('resultado');
    expect(calls).toEqual([
      'SET SESSION innodb_lock_wait_timeout = 5',
      'SELECT CONNECTION_ID() AS id',
      'callback'
    ]);
  });

  it('a forma em lote segue sem mudança', async () => {
    const { client, original } = guarded();
    const batch = ['a', 'b'];

    await expect(client.$transaction(batch, { isolationLevel: 'Serializable' })).resolves.toEqual({
      argument: batch,
      options: { isolationLevel: 'Serializable' }
    });
    expect(original).toHaveBeenCalledWith(batch, { isolationLevel: 'Serializable' });
  });

  it('o temporizador é limpo quando o callback termina antes do prazo, com sucesso ou erro', async () => {
    vi.useFakeTimers();
    const { client, deps } = guarded();

    await client.$transaction(async () => 'rapido');
    await expect(
      client.$transaction(async () => {
        throw new Error('falha comum');
      })
    ).rejects.toThrow('falha comum');
    await vi.advanceTimersByTimeAsync(20000);

    expect(deps.killQuery).not.toHaveBeenCalled();
  });

  it('no prazo pedido, interrompe a conexão da transação e repete a cada 100 ms enquanto o callback roda', async () => {
    vi.useFakeTimers();
    const { client, deps } = guarded();
    const work = deferred();

    const outcome = client
      .$transaction(() => work.promise)
      .then(
        (value) => ({ value }),
        (error) => ({ error })
      );
    await vi.advanceTimersByTimeAsync(4999);
    expect(deps.killQuery).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(deps.killQuery).toHaveBeenCalledWith(41);
    await vi.advanceTimersByTimeAsync(300);
    expect(deps.killQuery).toHaveBeenCalledTimes(4);

    work.resolve('terminou');
    const { value, error } = await outcome;
    await vi.advanceTimersByTimeAsync(1000);

    expect(deps.killQuery).toHaveBeenCalledTimes(4);
    expect(value).toBeUndefined();
    expect(error).toMatchObject({ name: 'TransactionDeadlineError', code: 'TRANSACTION_DEADLINE' });
  });

  it('depois do disparo, o erro do callback vira TransactionDeadlineError com a causa', async () => {
    vi.useFakeTimers();
    const { client } = guarded();
    const work = deferred();
    const interrupted = Object.assign(new Error('Query execution was interrupted'), {
      code: 'P2010',
      meta: { code: '1317' }
    });

    const outcome = client.$transaction(() => work.promise).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5000);
    work.reject(interrupted);

    const error = await outcome;
    expect(error).toMatchObject({ name: 'TransactionDeadlineError', code: 'TRANSACTION_DEADLINE' });
    expect(error.cause).toBe(interrupted);
  });

  it('espera os KILL QUERY já enviados antes de devolver a conexão', async () => {
    vi.useFakeTimers();
    const kill = deferred();
    const { client } = guarded({ killQuery: vi.fn(() => kill.promise) });
    const work = deferred();
    let settled = false;

    const outcome = client
      .$transaction(() => work.promise)
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(5000);
    work.resolve('terminou');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    kill.resolve();
    await outcome;
    expect(settled).toBe(true);
  });

  it('falha do KILL QUERY é registrada e não substitui o erro da transação', async () => {
    vi.useFakeTimers();
    const { client, deps } = guarded({
      killQuery: vi.fn(async () => {
        throw Object.assign(new Error('sem conexão'), { code: 'P1001' });
      })
    });
    const work = deferred();

    const outcome = client.$transaction(() => work.promise).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5000);
    work.resolve('terminou');

    expect(await outcome).toMatchObject({ name: 'TransactionDeadlineError' });
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_transaction_kill_failed',
        connectionId: 41,
        causeCode: 'P1001'
      })
    );
  });
});
