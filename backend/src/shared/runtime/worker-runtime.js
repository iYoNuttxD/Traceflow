import { exitCodeFor, stopWhenEngineUnavailable } from './engine-exit.js';

export const WORKER_DRAIN_MS = 60000;

export function createWorkerRuntime({
  services,
  disconnect,
  logger,
  exit = (code) => process.exit(code),
  drainMs = WORKER_DRAIN_MS,
  watchEngine = stopWhenEngineUnavailable
}) {
  let stopping = null;

  async function drain(signal) {
    let timer;
    const expired = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), drainMs);
    });
    const stopped = Promise.allSettled(services.map((service) => service.stop())).then((results) =>
      results.every((result) => result.status === 'fulfilled')
    );
    try {
      const drained = await Promise.race([stopped, expired]);
      if (!drained)
        logger.error('O worker não encerrou todos os serviços no prazo.', {
          event: 'worker_shutdown_incomplete',
          signal,
          drainMs
        });
      return drained;
    } finally {
      clearTimeout(timer);
    }
  }

  function stop(signal = 'shutdown') {
    stopping ||= (async () => {
      logger.info('Encerramento do worker iniciado.', { event: 'worker_shutdown_started', signal });
      const drained = await drain(signal);
      let disconnected = true;
      try {
        await disconnect();
      } catch (error) {
        disconnected = false;
        logger.error('O worker não desconectou o banco no encerramento.', {
          event: 'worker_disconnect_failed',
          signal,
          errorCode: error?.code || 'DISCONNECT_FAILED'
        });
      }
      const code = exitCodeFor(drained && disconnected ? 0 : 1);
      logger.info('Encerramento do worker concluído.', {
        event: 'worker_shutdown_completed',
        signal,
        code
      });
      exit(code);
      return code;
    })();
    return stopping;
  }

  return {
    start() {
      watchEngine(stop, { logger });
      return services.map((service) => service.start()).some(Boolean);
    },
    stop
  };
}
