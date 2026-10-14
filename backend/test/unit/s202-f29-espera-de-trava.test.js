import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkArchitecture } from '../../scripts/check-architecture.js';
import { isLockWaitTimeout, lockWaitSecondsFor } from '../../src/database/lock-wait.js';
import { guardTransactions } from '../../src/database/transaction-guard.js';
import { createErrorHandler } from '../../src/middlewares/error-handler.middleware.js';
import { githubSyncFailure } from '../../src/modules/github/github-error.js';

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
      $executeRawUnsafe: vi.fn(async (sql) => calls.push(sql)),
      $queryRawUnsafe: vi.fn(async (sql) => {
        calls.push(sql);
        return [{ id: 7n }];
      })
    };
    const client = {
      $transaction: vi.fn(async (argument, options) =>
        typeof argument === 'function' ? argument(tx) : [argument, options]
      )
    };
    guardTransactions(client, { killQuery: vi.fn() });

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
    const original = vi.fn(async (argument, options) => ({ argument, options }));
    const client = { $transaction: original };
    guardTransactions(client, { killQuery: vi.fn() });
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

const lockWait = Object.assign(new Error('Raw query failed. Code: `1205`.'), {
  name: 'PrismaClientKnownRequestError',
  code: 'P2010',
  meta: { code: '1205', message: 'Lock wait timeout exceeded; try restarting transaction' }
});
const unknownLockWait = Object.assign(
  new Error('QueryError(Server(MysqlError { code: 1205, message: "Lock wait timeout exceeded" }))'),
  { name: 'PrismaClientUnknownRequestError' }
);
const unknownDeadlock = Object.assign(
  new Error('QueryError(Server(MysqlError { code: 1213, message: "Deadlock found" }))'),
  { name: 'PrismaClientUnknownRequestError' }
);
const busyNowait = Object.assign(new Error('NOWAIT'), {
  name: 'PrismaClientKnownRequestError',
  code: 'P2010',
  meta: { code: '3572' }
});

describe('S202-F29 — F2-03 classificação do 1205', () => {
  it.each([
    ['P2010 com 1205', lockWait, true],
    ['erro desconhecido com 1205', unknownLockWait, true],
    ['NOWAIT (3572)', busyNowait, false],
    ['deadlock P2034', Object.assign(new Error('deadlock'), { code: 'P2034' }), false],
    ['erro desconhecido com 1213', unknownDeadlock, false],
    ['erro comum com o texto', new Error('Lock wait timeout exceeded; code: 1205'), false]
  ])('%s → %s', (_, error, expected) => {
    expect(isLockWaitTimeout(error)).toBe(expected);
  });

  it('a sincronização GitHub classifica o 1205 como projeto ocupado', () => {
    for (const error of [lockWait, unknownLockWait])
      expect(githubSyncFailure(error)).toMatchObject({
        code: 'GITHUB_SYNC_PROJECT_BUSY',
        causeCode: null
      });
  });
});

describe('S202-F29 — F2-02 handler de erro', () => {
  function response() {
    return {
      headersSent: false,
      statusCode: null,
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
      json(body) {
        this.body = body;
        return this;
      }
    };
  }
  const request = { method: 'POST', path: '/api/tasks/7/comments', requestId: 'req-espera' };
  const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

  it('o 1205 vira 409 RESOURCE_BUSY com Retry-After e log próprio', () => {
    for (const error of [lockWait, unknownLockWait]) {
      const log = logger();
      const res = response();

      createErrorHandler({ logger: log })(error, request, res, vi.fn());

      expect(res.statusCode).toBe(409);
      expect(res.headers['Retry-After']).toBe('2');
      expect(res.body).toEqual({
        message: 'Outra alteração está em andamento. Tente de novo em instantes.',
        code: 'RESOURCE_BUSY',
        requestId: 'req-espera'
      });
      expect(log.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          event: 'database_lock_wait_timeout',
          method: 'POST',
          path: '/api/tasks/7/comments',
          requestId: 'req-espera'
        })
      );
    }
  });

  it.each([['deadlock desconhecido', unknownDeadlock, 'PrismaClientUnknownRequestError']])(
    'erro do Prisma (%s) continua 500, com o código no log',
    (_, error, causeCode) => {
      const log = logger();
      const res = response();

      createErrorHandler({ logger: log })(error, request, res, vi.fn());

      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(log.error).toHaveBeenCalledWith(
        'HTTP request failed.',
        expect.objectContaining({ errorCode: 'INTERNAL_ERROR', causeCode })
      );
    }
  );

  it('o log leva o código do Prisma, nunca o texto do erro com dados da pessoa', () => {
    const uniqueFailure = Object.assign(
      new Error('Unique constraint failed: Tarefa sigilosa de pessoa@example.invalid'),
      { name: 'PrismaClientKnownRequestError', code: 'P2002' }
    );
    for (const error of [uniqueFailure, unknownLockWait]) {
      const log = logger();

      createErrorHandler({ logger: log })(error, request, response(), vi.fn());

      const logged = JSON.stringify([log.warn.mock.calls, log.error.mock.calls]);
      expect(logged).toMatch(/P2002|PrismaClientUnknownRequestError/);
      expect(logged).not.toMatch(/sigilosa|pessoa@example|MysqlError|Lock wait/);
    }
  });

  it('erro que não é do Prisma não ganha causeCode', () => {
    const log = logger();

    createErrorHandler({ logger: log })(new Error('falha'), request, response(), vi.fn());

    expect(log.error.mock.calls[0][1]).not.toHaveProperty('causeCode');
  });
});
