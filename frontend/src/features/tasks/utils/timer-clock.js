// Server timestamps and the browser wall clock are not interchangeable. Anchor
// each received running-session snapshot to the local monotonic clock instead.
// Weak keys keep timing metadata out of API payloads and release discarded reads.
const anchors = new WeakMap();

export function observeTimerSnapshots(value, reference) {
  if (!value || typeof value !== 'object') return value;
  const clock = reference && reference.id === value.id ? reference : value;
  if (clock.startedAt && clock.serverNow && !anchors.has(value)) {
    const started = new Date(clock.startedAt).getTime();
    const observed = new Date(clock.serverNow).getTime();
    if (Number.isFinite(started) && Number.isFinite(observed)) {
      anchors.set(
        value,
        anchors.get(clock) || {
          elapsedMs: Math.max(0, observed - started),
          receivedAt: performance.now()
        }
      );
    }
  }
  for (const child of Object.values(value)) observeTimerSnapshots(child);
  return value;
}

export function runningTimerSeconds(running, legacyNow = Date.now()) {
  if (!running) return 0;
  observeTimerSnapshots(running);
  const anchor = anchors.get(running);
  const milliseconds = anchor
    ? anchor.elapsedMs + Math.max(0, performance.now() - anchor.receivedAt)
    : legacyNow - new Date(running.startedAt).getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 1000)) : 0;
}
