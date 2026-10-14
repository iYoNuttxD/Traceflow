import { vi } from 'vitest';

// Keep the first real row lock open until the competing transaction attempts
// the same lock. No timers or production hooks participate in the interleaving.
export function contendProjectLock(prisma) {
  const transaction = prisma.$transaction.bind(prisma);
  let release;
  const contender = new Promise((resolve) => {
    release = resolve;
  });
  let locked;
  const firstLocked = new Promise((resolve) => {
    locked = resolve;
  });
  let locks = 0;
  const spy = vi.spyOn(prisma, '$transaction').mockImplementation((callback, options) => {
    if (typeof callback !== 'function') return transaction(callback, options);
    return transaction(
      (tx) =>
        callback(
          new Proxy(tx, {
            get(target, property) {
              if (property !== '$queryRaw') return target[property];
              return async (...args) => {
                const sql = Array.isArray(args[0]) ? args[0].join('?') : String(args[0]);
                if (!/FROM\s+`?Project`?\b/i.test(sql) || !/FOR UPDATE/i.test(sql) || locks >= 2) {
                  return target.$queryRaw(...args);
                }
                const order = ++locks;
                if (order === 1) {
                  const result = await target.$queryRaw(...args);
                  locked();
                  await contender;
                  return result;
                }
                await firstLocked;
                const waiting = Promise.resolve(target.$queryRaw(...args));
                release();
                return waiting;
              };
            }
          })
        ),
      options
    );
  });
  return { restore: () => spy.mockRestore(), attempts: () => locks };
}
