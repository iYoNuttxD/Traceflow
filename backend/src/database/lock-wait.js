const DEFAULT_TIMEOUT_MS = 5000;
const MARGIN_MS = 3000;
const MAX_SECONDS = 5;

export function lockWaitSecondsFor(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const seconds = Math.floor((timeoutMs - MARGIN_MS) / 1000);
  return Math.min(MAX_SECONDS, Math.max(1, seconds));
}

export function limitLockWaits(client) {
  const transaction = client.$transaction;
  client.$transaction = function limitedTransaction(argument, options) {
    if (typeof argument !== 'function') return transaction.call(this, argument, options);
    const seconds = lockWaitSecondsFor(options?.timeout);
    return transaction.call(
      this,
      async (tx) => {
        await tx.$executeRawUnsafe(`SET SESSION innodb_lock_wait_timeout = ${seconds}`);
        return argument(tx);
      },
      options
    );
  };
  return client;
}
