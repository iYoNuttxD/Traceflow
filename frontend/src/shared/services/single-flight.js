const pendingOperations = new Map();

export function runSingleFlight(key, operation) {
  const pending = pendingOperations.get(key);
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (pendingOperations.get(key) === promise) pendingOperations.delete(key);
    });
  pendingOperations.set(key, promise);
  return promise;
}
