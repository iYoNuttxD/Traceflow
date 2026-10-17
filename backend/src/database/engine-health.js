const listeners = new Set();
let unavailableReason = null;

export const isEnginePanic = (error) => error?.name === 'PrismaClientRustPanicError';

export function markEngineUnavailable(reason) {
  if (unavailableReason) return;
  unavailableReason = reason;
  for (const listener of listeners) queueMicrotask(() => listener(reason));
}

export function markEnginePanic() {
  markEngineUnavailable('ENGINE_PANIC');
}

export function noteDatabaseFailure(error) {
  if (isEnginePanic(error) || isEnginePanic(error?.cause)) markEnginePanic();
}

export function isEngineHealthy() {
  return unavailableReason === null;
}

export function onEngineUnavailable(listener) {
  listeners.add(listener);
  if (unavailableReason) {
    const reason = unavailableReason;
    queueMicrotask(() => listener(reason));
  }
  return () => listeners.delete(listener);
}
