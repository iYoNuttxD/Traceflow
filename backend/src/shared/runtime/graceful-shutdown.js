export function createGracefulShutdown({
  server,
  disconnect,
  logger,
  beginDrain = () => {},
  closeStreams = () => {},
  waitForBackground = async () => {},
  timeoutMs = 10000,
  exit = (code) => process.exit(code),
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let shutdownPromise;
  const responses = new Set();
  server.on?.('request', (_req, res) => {
    responses.add(res);
    const finished = () => {
      if (!responses.delete(res)) return;
      // SSE may already have sent keep-alive headers before draining. Let Node finish
      // the response, then close only sockets it now considers idle.
      if (shutdownPromise) setImmediate(() => server.closeIdleConnections?.());
    };
    res.once('finish', finished);
    res.once('close', finished);
  });
  return function shutdown(signal = 'shutdown') {
    if (shutdownPromise) return shutdownPromise;
    let resolveShutdown;
    shutdownPromise = new Promise((resolve) => {
      resolveShutdown = resolve;
    });
    let completed = false;
    let timer;
    const finish = (code) => {
      if (completed) return;
      completed = true;
      clearTimer(timer);
      if (code) logger.error('Graceful shutdown failed.', { signal, event: 'shutdown_incomplete' });
      else logger.info('Graceful shutdown completed.', { signal });
      resolveShutdown(code);
      exit(code);
    };
    logger.info('Graceful shutdown started.', { signal });
    timer = setTimer(() => {
      // Do not disconnect underneath active runs: termination leaves their persisted lease
      // for recovery. There is no artificial success/failure or authority release here.
      try {
        server.closeAllConnections?.();
      } finally {
        finish(1);
      }
    }, timeoutMs);
    // Keep the deadline referenced even if disconnect/background promises never settle.
    void (async () => {
      let failed = false;
      try {
        beginDrain();
        // Active responses must not turn into idle keep-alive sockets after close().
        for (const response of responses) response.shouldKeepAlive = false;
        const httpClosed = new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        try {
          closeStreams();
        } catch {
          failed = true;
        }
        await httpClosed;
      } catch {
        failed = true;
      }
      try {
        await waitForBackground();
      } catch {
        failed = true;
      }
      if (completed) return;
      try {
        await disconnect();
      } catch {
        failed = true;
      }
      finish(failed ? 1 : 0);
    })();
    return shutdownPromise;
  };
}
