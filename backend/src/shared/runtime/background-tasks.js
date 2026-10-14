// Process-local observation only: persisted runs, leases and fencing remain authoritative.
export function createBackgroundTasks() {
  const active = new Set();
  return Object.freeze({
    track(work) {
      const promise = Promise.resolve().then(work);
      active.add(promise);
      // Handle both outcomes without creating an unobserved rejected finally-promise.
      promise.then(
        () => active.delete(promise),
        () => active.delete(promise)
      );
      return promise;
    },
    async wait() {
      while (active.size) await Promise.allSettled([...active]);
    },
    get size() {
      return active.size;
    }
  });
}
