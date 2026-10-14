import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm, readdir, symlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGracefulShutdown } from '../../src/shared/runtime/graceful-shutdown.js';
import { createBackgroundTasks } from '../../src/shared/runtime/background-tasks.js';
import { createLifecycle } from '../../src/shared/runtime/lifecycle.js';
import { createReadinessCheck } from '../../src/shared/http/health.js';
import { checkDatabaseReadiness } from '../../src/database/readiness.js';
import { LocalTestEvidenceStorage } from '../../src/modules/testCases/storage/local-test-evidence.storage.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const log = () => ({ info: vi.fn(), error: vi.fn() });
afterEach(() => vi.useRealTimers());
describe('bounded lifecycle', () => {
  it('drains HTTP and streams before waiting for late registered manual work and disconnect', async () => {
    const http = deferred(),
      background = deferred();
    const tasks = createBackgroundTasks();
    const lifecycle = createLifecycle();
    lifecycle.ready();
    const order = [];
    const disconnect = vi.fn(async () => {
      order.push('disconnect');
    });
    const shutdown = createGracefulShutdown({
      server: {
        close: (done) => {
          order.push('http');
          void http.promise.then(() => done());
        }
      },
      beginDrain: () => {
        lifecycle.drain();
        order.push('drain');
      },
      closeStreams: () => order.push('sse'),
      waitForBackground: tasks.wait,
      disconnect,
      exit: vi.fn(),
      logger: log()
    });
    const result = shutdown('SIGTERM');
    expect(lifecycle.isReady()).toBe(false);
    expect(lifecycle.isDraining()).toBe(true);
    const active = tasks.track(() => background.promise);
    http.resolve();
    await Promise.resolve();
    expect(disconnect).not.toHaveBeenCalled();
    expect(tasks.size).toBe(1);
    background.resolve();
    await active;
    expect(await result).toBe(0);
    expect(tasks.size).toBe(0);
    expect(order).toEqual(['drain', 'http', 'sse', 'disconnect']);
  });
  it('expires active work without disconnecting underneath it or mutating its outcome', async () => {
    vi.useFakeTimers();
    const background = deferred();
    const exit = vi.fn(),
      disconnect = vi.fn();
    const shutdown = createGracefulShutdown({
      server: { close: (done) => done(), closeAllConnections: vi.fn() },
      waitForBackground: () => background.promise,
      disconnect,
      exit,
      logger: log(),
      timeoutMs: 50
    });
    const result = shutdown();
    expect(shutdown('SIGTERM')).toBe(result);
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBe(1);
    expect(disconnect).not.toHaveBeenCalled();
    background.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(disconnect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });
  it('includes stalled Prisma disconnect in the same deadline', async () => {
    vi.useFakeTimers();
    const disconnect = vi.fn(() => new Promise(() => {}));
    const exit = vi.fn();
    const result = createGracefulShutdown({
      server: { close: (done) => done(), closeAllConnections: vi.fn() },
      disconnect,
      exit,
      logger: log(),
      timeoutMs: 50
    })();
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBe(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
  it('removes rejected and finished background promises', async () => {
    const tasks = createBackgroundTasks();
    await expect(
      tasks.track(() => {
        throw new Error('synthetic');
      })
    ).rejects.toThrow('synthetic');
    await tasks.wait();
    expect(tasks.size).toBe(0);
  });
});
describe('read-only bounded readiness', () => {
  it('checks configuration/startup/draining before probing dependencies', async () => {
    const lifecycle = createLifecycle(),
      databaseCheck = vi.fn(async () => true);
    const configuration = { configurationValid: true, readinessTimeoutMs: 50 };
    const check = createReadinessCheck({ configuration, lifecycle, databaseCheck });
    expect(await check()).toBe(false);
    expect(databaseCheck).not.toHaveBeenCalled();
    lifecycle.ready();
    expect(await check()).toBe(true);
    lifecycle.drain();
    lifecycle.ready();
    expect(await check()).toBe(false);
    expect(
      await createReadinessCheck({ configuration: { configurationValid: false }, databaseCheck })()
    ).toBe(false);
  });
  it('bounds a hung database with at most one in-flight query and recovers after settlement', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    const databaseCheck = vi.fn(() => pending.promise);
    const check = createReadinessCheck({
      configuration: { configurationValid: true },
      timeoutMs: 50,
      databaseCheck
    });
    const result = check();
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBe(false);
    expect(await check()).toBe(false);
    expect(databaseCheck).toHaveBeenCalledOnce();
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(await check()).toBe(true);
  });
  it('fails safely on storage/db errors and does not probe DB if storage failed', async () => {
    const configuration = { configurationValid: true, readinessTimeoutMs: 50 },
      databaseCheck = vi.fn();
    expect(
      await createReadinessCheck({
        configuration,
        databaseCheck,
        storageCheck: async () => {
          throw new Error('private diagnostic');
        }
      })()
    ).toBe(false);
    expect(databaseCheck).not.toHaveBeenCalled();
    expect(
      await createReadinessCheck({
        configuration,
        databaseCheck: async () => {
          throw new Error('secret');
        }
      })()
    ).toBe(false);
  });
  it('checks schema ledger with SELECT only and rejects missing/failed migrations', async () => {
    const names = (await readdir(new URL('../../prisma/migrations/', import.meta.url))).filter(
      (name) => /^\d/.test(name)
    );
    let rows = [];
    const query = vi.fn(async (sql) => (sql.includes('_prisma_migrations') ? rows : []));
    const client = { $queryRawUnsafe: query };
    expect(await checkDatabaseReadiness(client)).toBe(false);
    rows = names.map((migration_name) => ({
      migration_name,
      finished_at: new Date(),
      rolled_back_at: null
    }));
    expect(await checkDatabaseReadiness(client)).toBe(true);
    rows.push({ migration_name: 'failed', finished_at: null, rolled_back_at: null });
    expect(await checkDatabaseReadiness(client)).toBe(false);
    expect(query.mock.calls.every(([sql]) => /^SELECT /.test(sql))).toBe(true);
  });
  it('requires existing private storage and preserves symlink rejection without writes', async () => {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'oci03-storage-'));
    try {
      const storage = (directory) =>
        new LocalTestEvidenceStorage({ directory, environment: 'production' });
      expect(await storage(root).checkReadiness()).toBe(true);
      await expect(storage(join(root, 'missing')).checkReadiness()).rejects.toMatchObject({
        code: 'TEST_EVIDENCE_STORAGE_UNAVAILABLE'
      });
      expect(await readdir(root)).toEqual([]);
      await symlink(root, join(root, 'link'));
      await expect(storage(join(root, 'link')).checkReadiness()).rejects.toThrow();
      await chmod(root, 0o755);
      await expect(storage(root).checkReadiness()).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
