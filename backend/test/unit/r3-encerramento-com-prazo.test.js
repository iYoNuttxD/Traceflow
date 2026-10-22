import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '../../src/shared/runtime/graceful-shutdown.js';
import { DISCONNECT_WAIT_MS } from '../../src/shared/runtime/disconnect-within.js';
import { createWorkerRuntime } from '../../src/shared/runtime/worker-runtime.js';

const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

function worker({ stop = async () => {}, disconnect = async () => {}, drainMs = 10 } = {}) {
  const log = logger();
  const exit = vi.fn();
  const runtime = createWorkerRuntime({
    services: [{ start: () => true, stop }],
    disconnect,
    logger: log,
    exit,
    drainMs,
    disconnectWaitMs: 40,
    watchEngine: () => {}
  });
  return { runtime, exit, log };
}

function api({ disconnect = async () => {}, close = (done) => done() } = {}) {
  const log = logger();
  const exit = vi.fn();
  const shutdown = createGracefulShutdown({
    server: { close },
    disconnect,
    logger: log,
    exit,
    timeoutMs: 40,
    disconnectWaitMs: 40
  });
  return { shutdown, exit, log };
}

const timeoutLogged = (log) =>
  expect(log.error).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ event: 'database_disconnect_timeout' })
  );

describe('TF-REV-013 — encerramento com prazo na API e no worker', () => {
  it('a espera padrão da desconexão é de 5 s', () => {
    expect(DISCONNECT_WAIT_MS).toBe(5000);
  });

  it('E-01 worker com a desconexão pendente sai com código 1 no prazo (A2)', async () => {
    const { runtime, exit, log } = worker({ disconnect: never });

    void runtime.stop('SIGTERM');
    await sleep(150);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    timeoutLogged(log);
  });

  it('E-02 API com a desconexão pendente sai com código 1 no prazo (A2b)', async () => {
    const { shutdown, exit, log } = api({ disconnect: never });

    void shutdown('SIGTERM');
    await sleep(150);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    timeoutLogged(log);
  });

  it('E-02 API presa no fechamento do servidor e na desconexão sai com código 1', async () => {
    const { shutdown, exit } = api({ disconnect: never, close: () => {} });

    void shutdown('SIGTERM');
    await sleep(200);

    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('E-03 desconexão rejeitada sai com código 1, na API e no worker', async () => {
    const failure = () => Promise.reject(Object.assign(new Error('falhou'), { code: 'P1001' }));
    const fromWorker = worker({ disconnect: failure });
    const fromApi = api({ disconnect: failure });

    await fromWorker.runtime.stop('SIGTERM');
    await fromApi.shutdown('SIGTERM');

    expect(fromWorker.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(fromApi.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('E-04 encerramento normal sai com código 0, na API e no worker', async () => {
    const fromWorker = worker();
    const fromApi = api();

    await fromWorker.runtime.stop('SIGTERM');
    await fromApi.shutdown('SIGTERM');

    expect(fromWorker.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(fromApi.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(fromWorker.log.error).not.toHaveBeenCalled();
    expect(fromApi.log.error).not.toHaveBeenCalled();
  });

  it('E-05 drenagem e desconexão pendentes: o worker sai em até drenagem + espera da desconexão', async () => {
    const { runtime, exit } = worker({ stop: never, disconnect: never, drainMs: 30 });
    const started = Date.now();

    const code = await runtime.stop('SIGTERM');

    expect(code).toBe(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(Date.now() - started).toBeLessThan(30 + 40 + 100);
  });
});
