let panicked = false;

export function markEnginePanic() {
  panicked = true;
}

export function isEngineHealthy() {
  return !panicked;
}
