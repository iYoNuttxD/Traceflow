export function createLifecycle() {
  let state = 'starting';
  return Object.freeze({
    ready() {
      if (state === 'starting') state = 'ready';
    },
    drain() {
      state = 'draining';
    },
    isReady: () => state === 'ready',
    isDraining: () => state === 'draining'
  });
}
