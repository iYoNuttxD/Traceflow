import { once } from 'node:events';
import { afterAll } from 'vitest';

const servers = new Set();
const serversByApp = new WeakMap();

// Supertest otherwise starts/stops wildcard listeners for individual requests,
// then sends to IPv4. Own one IPv4 listener per suite, including concurrent clients.
export function startTestServer(app) {
  if (!serversByApp.has(app)) {
    const ready = (async () => {
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      servers.add(server);
      return server;
    })();
    serversByApp.set(app, ready);
  }
  return serversByApp.get(app);
}

afterAll(async () => {
  for (const server of servers) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  servers.clear();
});
