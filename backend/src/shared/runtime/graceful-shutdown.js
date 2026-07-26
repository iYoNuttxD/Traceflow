export function createGracefulShutdown({
  server,
  disconnect,
  logger,
  timeoutMs = 10000,
  exit = (code) => process.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let shutdownPromise;

  return function shutdown(signal = 'shutdown') {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise((resolve) => {
      logger.info('Graceful shutdown started.', { signal });
      let completed = false;
      let timeout;
      const finish = async (code, error) => {
        if (completed) return;
        completed = true;
        clearTimer(timeout);

        try {
          await disconnect();
        } catch (disconnectError) {
          error ||= disconnectError;
          code = 1;
        }

        if (error) {
          logger.error('Graceful shutdown failed.', {
            signal,
            error: { name: error.name, message: error.message }
          });
        } else {
          logger.info('Graceful shutdown completed.', { signal });
        }

        exit(code);
        resolve(code);
      };

      timeout = setTimer(() => {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        void finish(1, new Error('Graceful shutdown timeout.'));
      }, timeoutMs);
      timeout.unref?.();

      try {
        server.close((error) => void finish(error ? 1 : 0, error));
      } catch (error) {
        void finish(1, error);
      }
    });

    return shutdownPromise;
  };
}
