import { expect, vi } from 'vitest';

// Both real interactive transactions must reach their callback before either
// executes production validation/locking. This controls arrival, not DB results:
// the original callback and MySQL locking still decide the winner.
export async function concurrentTransactions(prisma, operations, { settled = false } = {}) {
  const transaction = prisma.$transaction.bind(prisma);
  let arrivals = 0;
  let completedBeforeArrival = false;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(prisma, '$transaction').mockImplementation((work, options) => {
    if (typeof work !== 'function') return transaction(work, options);
    return transaction(async (tx) => {
      if (arrivals < operations.length) {
        arrivals += 1;
        if (arrivals === operations.length) release();
        await gate;
      }
      return work(tx);
    }, options);
  });
  try {
    const pending = operations.map((operation) =>
      Promise.resolve(typeof operation === 'function' ? operation() : operation).finally(() => {
        if (arrivals < operations.length) {
          completedBeforeArrival = true;
          release();
        }
      })
    );
    // Await every competitor even on rejection, before cleanup can touch the DB.
    const results = await Promise.allSettled(pending);
    expect(arrivals, 'all competing real transactions reached the arrival barrier').toBe(
      operations.length
    );
    expect(completedBeforeArrival, 'no operation finished before all transaction arrivals').toBe(
      false
    );
    if (settled) return results;
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    return results.map((result) => result.value);
  } finally {
    release();
    spy.mockRestore();
  }
}
