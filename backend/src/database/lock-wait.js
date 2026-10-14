const DEFAULT_TIMEOUT_MS = 5000;
const MARGIN_MS = 3000;
const MAX_SECONDS = 5;

export function lockWaitSecondsFor(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const seconds = Math.floor((timeoutMs - MARGIN_MS) / 1000);
  return Math.min(MAX_SECONDS, Math.max(1, seconds));
}

export function isLockWaitTimeout(error) {
  if (error?.code === 'P2010') return String(error.meta?.code) === '1205';
  return (
    error?.name === 'PrismaClientUnknownRequestError' &&
    /\bcode: 1205\b/.test(String(error.message))
  );
}
