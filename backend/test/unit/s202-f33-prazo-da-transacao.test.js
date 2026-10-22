import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  guardTransactions,
  TransactionDeadlineError
} from '../../src/database/transaction-guard.js';
import { createErrorHandler } from '../../src/middlewares/error-handler.middleware.js';
import { createHealthHandlers } from '../../src/shared/http/health.js';

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

const expired = () =>
  Object.assign(
    new Error('Transaction already closed: Tarefa sigilosa de pessoa@example.invalid'),
    {
      name: 'PrismaClientKnownRequestError',
      code: 'P2028'
    }
  );

describe('S202-F33 — F2-03 segunda camada (unidade)', () => {
  it('P2028 de transação iniciada: encerra a conexão e registra', async () => {
    const { client, deps } = guarded();
    const error = expired();

    await expect(
      client.$transaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(deps.killConnection).toHaveBeenCalledWith(41);
    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'database_connection_discarded', connectionId: 41 })
    );
  });

  it('TransactionDeadlineError com P2028 na causa também encerra a conexão', async () => {
    vi.useFakeTimers();
    const { client, deps } = guarded();
    const work = deferred();

    const outcome = client.$transaction(() => work.promise).catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(5000);
    work.reject(expired());

    expect(await outcome).toMatchObject({
      name: 'TransactionDeadlineError',
      cause: { code: 'P2028' }
    });
    expect(deps.killConnection).toHaveBeenCalledWith(41);
  });

  it('P2028 sem transação iniciada (maxWait esgotado) e erro comum não encerram nada', async () => {
    const { client, original, deps } = guarded();
    original.mockImplementationOnce(async () => {
      throw expired();
    });

    await expect(client.$transaction(async () => 'nunca')).rejects.toMatchObject({
      code: 'P2028'
    });
    await expect(
      client.$transaction(async () => {
        throw new Error('falha comum');
      })
    ).rejects.toThrow('falha comum');

    expect(deps.killConnection).not.toHaveBeenCalled();
  });

  it('falha ao encerrar a conexão é registrada e não substitui o erro', async () => {
    const { client, deps } = guarded({
      killConnection: vi.fn(async () => {
        throw Object.assign(new Error('sem conexão'), { code: 'P1001' });
      })
    });
    const error = expired();

    await expect(
      client.$transaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);

    expect(deps.log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_transaction_kill_failed',
        scope: 'connection',
        connectionId: 41,
        causeCode: 'P1001'
      })
    );
  });
});

describe('S202-F33 — F2-02 e F2-05 handler e saúde', () => {
  function response() {
    return {
      headersSent: false,
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      setHeader(name, value) {
        this.headers[name] = value;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };
  }
  const request = { method: 'POST', path: '/api/tasks/7/comments', requestId: 'req-prazo' };
  const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  const TIMEOUT_BODY = {
    message: 'A operação demorou mais que o permitido e foi desfeita. Tente de novo em instantes.',
    code: 'OPERATION_TIMEOUT',
    requestId: 'req-prazo'
  };
  const leaked = /sigilosa|pessoa@example|1317|Raw query|Transaction already closed/;

  it('TransactionDeadlineError → 503 OPERATION_TIMEOUT com Retry-After e database_transaction_deadline', () => {
    const log = logger();
    const res = response();
    const cause = Object.assign(
      new Error('Raw query failed. Code: `1317`. Tarefa sigilosa de pessoa@example.invalid'),
      { name: 'PrismaClientKnownRequestError', code: 'P2010', meta: { code: '1317' } }
    );

    createErrorHandler({ logger: log })(
      new TransactionDeadlineError(5000, cause),
      request,
      res,
      vi.fn()
    );

    expect([res.statusCode, res.headers['Retry-After'], res.body]).toEqual([
      503,
      '5',
      TIMEOUT_BODY
    ]);
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_transaction_deadline',
        method: 'POST',
        path: '/api/tasks/7/comments',
        requestId: 'req-prazo',
        statusCode: 503,
        errorCode: 'OPERATION_TIMEOUT',
        causeCode: 'TRANSACTION_DEADLINE'
      })
    );
    expect(log.error).not.toHaveBeenCalled();
    expect(JSON.stringify([log.warn.mock.calls, res.body])).not.toMatch(leaked);
  });

  it('P2028 → 503 OPERATION_TIMEOUT com database_transaction_expired', () => {
    const log = logger();
    const res = response();

    createErrorHandler({ logger: log })(expired(), request, res, vi.fn());

    expect([res.statusCode, res.headers['Retry-After'], res.body]).toEqual([
      503,
      '5',
      TIMEOUT_BODY
    ]);
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_transaction_expired',
        requestId: 'req-prazo',
        causeCode: 'P2028'
      })
    );
    expect(JSON.stringify([log.error.mock.calls, res.body])).not.toMatch(leaked);
  });

  it('pânico do motor: 500, evento database_engine_panic e aviso à saúde do processo', () => {
    const log = logger();
    const res = response();
    const onEnginePanic = vi.fn();
    const panic = Object.assign(new Error('PANIC: Could not figure out an ID in create'), {
      name: 'PrismaClientRustPanicError'
    });

    createErrorHandler({ logger: log, onEnginePanic })(panic, request, res, vi.fn());

    expect([res.statusCode, res.body.code]).toEqual([500, 'INTERNAL_ERROR']);
    expect(onEnginePanic).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        event: 'database_engine_panic',
        requestId: 'req-prazo',
        causeCode: 'PrismaClientRustPanicError'
      })
    );
    expect(JSON.stringify([log.error.mock.calls, res.body])).not.toMatch(/figure out/);
  });

  it('saúde: depois do pânico, live e ready respondem 503; sem pânico, 200', async () => {
    const broken = createHealthHandlers({
      readinessCheck: async () => true,
      engineHealthy: () => false
    });
    const healthy = createHealthHandlers({
      readinessCheck: async () => true,
      engineHealthy: () => true
    });

    const live = response();
    broken.live({}, live);
    const ready = response();
    await broken.ready({}, ready);
    const liveOk = response();
    healthy.live({}, liveOk);
    const readyOk = response();
    await healthy.ready({}, readyOk);

    expect([live.statusCode, live.body.status]).toEqual([503, 'not_live']);
    expect([ready.statusCode, ready.body.status]).toEqual([503, 'not_ready']);
    expect([liveOk.statusCode, liveOk.body.status]).toEqual([200, 'ok']);
    expect([readyOk.statusCode, readyOk.body.status]).toEqual([200, 'ready']);
    expect([ready.headers['Cache-Control'], readyOk.headers['Cache-Control']]).toEqual([
      'no-store',
      'no-store'
    ]);
  });
});
