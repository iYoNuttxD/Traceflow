import { createServer } from 'node:http';
import { createGracefulShutdown } from '../../src/shared/runtime/graceful-shutdown.js';
import { createBackgroundTasks } from '../../src/shared/runtime/background-tasks.js';
const mode = process.argv[2],
  tasks = createBackgroundTasks(),
  streams = new Set();
let release;
const pending = new Promise((resolve) => {
  release = resolve;
});
process.on('message', (message) => {
  if (message === 'release') release();
});
const server = createServer(async (req, res) => {
  if (mode === 'http') {
    process.send({ event: 'active' });
    await pending;
    res.end('complete');
  } else if (mode === 'sse') {
    streams.add(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': ready\n\n');
    process.send({ event: 'active' });
  } else {
    void tasks.track(() => pending);
    res.end('accepted');
    process.send({ event: 'active' });
  }
});
server.listen(0, '127.0.0.1', () => process.send({ event: 'ready', address: server.address() }));
const shutdown = createGracefulShutdown({
  server,
  timeoutMs: 300,
  beginDrain: () => process.send({ event: 'draining' }),
  closeStreams: () => {
    for (const stream of streams) stream.end();
  },
  waitForBackground: tasks.wait,
  disconnect: () => {
    process.send({ event: 'disconnect' });
    return mode === 'disconnect' ? new Promise(() => {}) : Promise.resolve();
  },
  logger: { info: () => {}, error: () => {} }
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
