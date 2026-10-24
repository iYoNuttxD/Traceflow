import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const children = new Set();
afterEach(() => {
  for (const child of children) child.kill('SIGKILL');
  children.clear();
});
async function start(mode) {
  const child = fork(
    fileURLToPath(new URL('../fixtures/production-lifecycle-process.js', import.meta.url)),
    [mode],
    { execArgv: [], env: { PATH: process.env.PATH }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }
  );
  children.add(child);
  const events = [],
    waiting = new Map();
  child.on('message', (message) => {
    events.push(message);
    waiting.get(message.event)?.(message);
  });
  const event = (name) =>
    events.find((item) => item.event === name) ||
    new Promise((resolve) => waiting.set(name, resolve));
  const ended = new Promise((resolve) =>
    child.on('exit', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    })
  );
  const ready = await event('ready');
  expect(ready.address.address).toBe('127.0.0.1');
  return { child, ended, event, events, url: `http://127.0.0.1:${ready.address.port}` };
}
describe('real process SIGTERM scenarios A-G', () => {
  it.each(['idle', 'http', 'sse', 'manual', 'over-budget', 'disconnect'])(
    'bounds %s shutdown under real process signals',
    async (mode) => {
      const runtime = await start(mode);
      let response;
      if (!['idle', 'disconnect'].includes(mode)) {
        response = fetch(runtime.url, { signal: AbortSignal.timeout(5000) });
        await runtime.event('active');
      }
      runtime.child.kill('SIGTERM');
      await runtime.event('draining');
      runtime.child.kill('SIGTERM');
      if (['http', 'manual'].includes(mode)) {
        expect(runtime.events.filter((entry) => entry.event === 'disconnect')).toHaveLength(0);
        runtime.child.send('release');
      }
      const result = await runtime.ended;
      expect(result).toEqual({
        code: ['over-budget', 'disconnect'].includes(mode) ? 1 : 0,
        signal: null
      });
      expect(runtime.events.filter((entry) => entry.event === 'draining')).toHaveLength(1);
      expect(runtime.events.filter((entry) => entry.event === 'disconnect')).toHaveLength(
        mode === 'over-budget' ? 0 : 1
      );
      if (response) {
        const data = await response;
        expect(data.status).toBe(200);
        expect(await data.text()).toBe(
          mode === 'http' ? 'complete' : mode === 'sse' ? ': ready\n\n' : 'accepted'
        );
      }
    }
  );
});
