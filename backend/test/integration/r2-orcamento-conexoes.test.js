import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { get } from 'node:http';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureTestDatabaseEnvironment } from '../helpers/test-database.js';

const COMMANDS = [
  'src/jobs/cli/notify-overdue-tasks.js',
  'src/jobs/cli/dispatch-github-event-notifications.js',
  'src/jobs/cli/reconcile-traceability-alerts.js',
  'src/jobs/cli/notification-metrics.js'
];

beforeAll(() => {
  configureTestDatabaseEnvironment();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const silent = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

const busyQuery = (client, seconds) =>
  client.$queryRawUnsafe(`SELECT CONNECTION_ID() AS id, SLEEP(${seconds}) AS pause`);

const connectionIds = (rows) => new Set(rows.map(([row]) => Number(row.id)));

const connectionIdOf = async (client) =>
  Number((await client.$queryRawUnsafe('SELECT CONNECTION_ID() AS id'))[0].id);

const panic = () =>
  Object.assign(new Error('engine crashed'), { name: 'PrismaClientRustPanicError' });

function fakeClient() {
  const tx = {
    $executeRawUnsafe: vi.fn(async () => 0),
    $queryRawUnsafe: vi.fn(async () => [{ id: 41n }])
  };
  return { $transaction: vi.fn(async (argument) => argument(tx)) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function requestStatus(port, path) {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path, headers: { connection: 'close' } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
}

describe('ADR-024 D3 — cliente de recuperação', () => {
  it('O-01 usa uma só conexão e espera no máximo 2 s por ela', async () => {
    const { recoveryPrisma, disconnectRecoveryPrisma } =
      await import('../../src/database/recovery-prisma.js');
    const client = recoveryPrisma();
    try {
      const rows = await Promise.all([0, 1, 2].map(() => busyQuery(client, 0.2)));
      expect(connectionIds(rows).size).toBe(1);

      const held = busyQuery(client, 3).then((result) => result);
      await new Promise((done) => setTimeout(done, 200));
      const startedAt = Date.now();
      const waiting = await client.$queryRawUnsafe('SELECT 1 AS one').catch((error) => error);
      const waitedMs = Date.now() - startedAt;
      await held;

      expect(waiting).toMatchObject({ code: 'P2024' });
      expect(waitedMs).toBeGreaterThanOrEqual(1900);
      expect(waitedMs).toBeLessThan(3000);
    } finally {
      await disconnectRecoveryPrisma();
    }
  }, 20000);
});

describe('ADR-024 D4 — espera limitada dos KILL', () => {
  async function expiredTransaction(killQuery) {
    vi.useFakeTimers();
    const { guardTransactions } = await import('../../src/database/transaction-guard.js');
    const onUnavailable = vi.fn();
    const log = silent();
    const client = guardTransactions(fakeClient(), {
      killQuery,
      killConnection: vi.fn(async () => undefined),
      log,
      onUnavailable
    });
    const work = deferred();
    const outcome = client.$transaction(() => work.promise).catch((error) => error);
    await vi.advanceTimersByTimeAsync(5000);
    work.resolve('terminou');
    return { outcome, onUnavailable, log };
  }

  it('O-02 KILL sem confirmação em 2 s envenena a conexão e deixa o motor indisponível', async () => {
    const { outcome, onUnavailable, log } = await expiredTransaction(() => new Promise(() => {}));

    await vi.advanceTimersByTimeAsync(1999);
    expect(onUnavailable).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toMatchObject({ name: 'TransactionDeadlineError' });
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith('POISONED_CONNECTION');
    expect(log.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'database_connection_poisoned', connectionId: 41 })
    );
  });

  it('O-02 KILL confirmado dentro de 2 s não envenena a conexão', async () => {
    const kill = deferred();
    const { outcome, onUnavailable } = await expiredTransaction(() => kill.promise);

    await vi.advanceTimersByTimeAsync(1500);
    kill.resolve();

    expect(await outcome).toMatchObject({ name: 'TransactionDeadlineError' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});

describe('ADR-024 D5 — saída controlada', () => {
  it('O-03 pânico do motor numa transação deixa o motor indisponível', async () => {
    const { guardTransactions } = await import('../../src/database/transaction-guard.js');
    const onUnavailable = vi.fn();
    const client = guardTransactions(fakeClient(), {
      killQuery: vi.fn(),
      killConnection: vi.fn(),
      log: silent(),
      onUnavailable
    });
    const error = panic();

    await expect(
      client.$transaction(async () => {
        throw error;
      })
    ).rejects.toBe(error);
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith('ENGINE_PANIC');
  });

  it('O-03 pânico na API: deixa de aceitar requisições, drena, desconecta e sai com código 1', async () => {
    vi.resetModules();
    const { default: express } = await import('express');
    const { createErrorHandler } =
      await import('../../src/middlewares/error-handler.middleware.js');
    const { createGracefulShutdown } =
      await import('../../src/shared/runtime/graceful-shutdown.js');
    const { exitCodeFor, stopWhenEngineUnavailable } =
      await import('../../src/shared/runtime/engine-exit.js');
    const logger = silent();
    const app = express();
    app.get('/panico', () => {
      throw panic();
    });
    app.use(createErrorHandler({ logger }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const exits = [];
    const disconnect = vi.fn(async () => undefined);
    const shutdown = createGracefulShutdown({
      server,
      disconnect,
      logger,
      exit: (code) => exits.push(exitCodeFor(code))
    });
    stopWhenEngineUnavailable(shutdown, { logger });

    expect(await requestStatus(server.address().port, '/panico')).toBe(500);

    await vi.waitFor(() => expect(exits).toEqual([1]), { timeout: 5000 });
    expect(server.listening).toBe(false);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'database_unavailable_shutdown', reason: 'ENGINE_PANIC' })
    );
  });

  it('O-03 conexão envenenada no worker: para os serviços, desconecta e sai com código 1', async () => {
    vi.resetModules();
    const { createWorkerRuntime } = await import('../../src/shared/runtime/worker-runtime.js');
    const { markEngineUnavailable } = await import('../../src/database/engine-health.js');
    const service = { start: vi.fn(() => true), stop: vi.fn(async () => undefined) };
    const disconnect = vi.fn(async () => undefined);
    const exit = vi.fn();
    const runtime = createWorkerRuntime({
      services: [service],
      disconnect,
      logger: silent(),
      exit
    });

    expect(runtime.start()).toBe(true);
    markEngineUnavailable('POISONED_CONNECTION');

    await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(1));
    expect(service.stop).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('O-03 no worker, o serviço que não para no prazo de drenagem não segura a saída', async () => {
    vi.resetModules();
    const { createWorkerRuntime } = await import('../../src/shared/runtime/worker-runtime.js');
    const logger = silent();
    const disconnect = vi.fn(async () => undefined);
    const exit = vi.fn();
    const runtime = createWorkerRuntime({
      services: [{ start: () => true, stop: () => new Promise(() => {}) }],
      disconnect,
      logger,
      exit,
      drainMs: 50
    });
    runtime.start();

    await runtime.stop('SIGTERM');

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: 'worker_shutdown_incomplete', signal: 'SIGTERM' })
    );
  });

  it('O-03 SIGTERM com o motor saudável encerra o worker com código 0', async () => {
    vi.resetModules();
    const { createWorkerRuntime } = await import('../../src/shared/runtime/worker-runtime.js');
    const exit = vi.fn();
    const runtime = createWorkerRuntime({
      services: [{ start: () => true, stop: async () => undefined }],
      disconnect: async () => undefined,
      logger: silent(),
      exit
    });
    runtime.start();

    await runtime.stop('SIGTERM');

    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});

describe('ADR-024 D3 — desconexão dos dois clientes', () => {
  it('O-04 o encerramento fecha as conexões do cliente da aplicação e do de recuperação', async () => {
    vi.resetModules();
    const { prisma, disconnectDatabase } = await import('../../src/database/prismaClient.js');
    const { recoveryPrisma } = await import('../../src/database/recovery-prisma.js');
    const recovery = recoveryPrisma();
    const ids = [await connectionIdOf(prisma), await connectionIdOf(recovery)];

    await disconnectDatabase();

    expect(recoveryPrisma()).not.toBe(recovery);
    const { PrismaClient } = await import('@prisma/client');
    const observer = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
    try {
      await vi.waitFor(
        async () => {
          const open = await observer.$queryRawUnsafe(
            `SELECT ID FROM information_schema.PROCESSLIST WHERE ID IN (${ids.join(', ')})`
          );
          expect(open).toEqual([]);
        },
        { timeout: 5000, interval: 100 }
      );
    } finally {
      await observer.$disconnect();
    }
  }, 20000);

  it('O-04 o worker desconecta os dois clientes no encerramento', () => {
    const source = readFileSync(new URL('../../src/github-worker.js', import.meta.url), 'utf8');
    expect(source).toMatch(/disconnect: disconnectDatabase/);
    expect(source).not.toMatch(/\$disconnect\(/);
  });

  it.each(COMMANDS)('O-04 o comando %s desconecta os dois clientes ao terminar', (file) => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(source).toMatch(/finally \{\s+await disconnectDatabase\(\);\s+\}/);
    expect(source).not.toMatch(/\$disconnect\(/);
  });
});

describe('ADR-024 D2 — orçamento de conexões', () => {
  it('O-05 o connection_limit da URL limita as conexões do cliente da aplicação; o DATABASE_POOL_LIMIT não muda nada (TF-REV-016)', async () => {
    const limited = new URL(process.env.TEST_DATABASE_URL);
    limited.searchParams.set('connection_limit', '2');
    vi.stubEnv('TEST_DATABASE_URL', limited.toString());
    vi.stubEnv('DATABASE_POOL_LIMIT', '4');
    vi.resetModules();
    const { prisma, disconnectDatabase } = await import('../../src/database/prismaClient.js');
    try {
      const rows = await Promise.all([0, 1, 2, 3].map(() => busyQuery(prisma, 0.3)));
      expect(connectionIds(rows).size).toBe(2);
    } finally {
      await disconnectDatabase();
    }
  }, 20000);
});
