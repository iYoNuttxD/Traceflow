import assert from 'node:assert/strict';
import { connectOwnedPrisma } from './oci-compatibility-probes.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// These are bounded, synthetic database experiments, not retries of failed tests.
// The application retry helper itself must recover a real InnoDB deadlock.
export async function concurrencyProbe() {
  const { client } = await connectOwnedPrisma();
  let other, runtimePrisma;
  const report = {};
  const ids = [];
  try {
    other = (await connectOwnedPrisma()).client;
    ({ prisma: runtimePrisma } = await import('../../src/database/prismaClient.js'));
    const { serializableTransaction } =
      await import('../../src/database/serializable-transaction.js');
    for (const suffix of ['a', 'b']) {
      const row = await client.user.create({
        data: {
          name: 'Synthetic contention',
          username: `oci_contention_${suffix}`,
          email: `contention-${suffix}@example.invalid`,
          sessionVersion: 1
        }
      });
      ids.push(row.id);
    }
    const ready = [deferred(), deferred()];
    const attempts = [0, 0];
    const errors = [];
    const workers = [client, other].map((connection, index) =>
      serializableTransaction(
        async (tx) => {
          attempts[index] += 1;
          const first = ids[index],
            second = ids[1 - index];
          await tx.user.update({
            where: { id: first },
            data: { sessionVersion: { increment: 1 } }
          });
          if (attempts[index] === 1) {
            ready[index].resolve();
            await ready[1 - index].promise;
          }
          await tx.user.update({
            where: { id: second },
            data: { sessionVersion: { increment: 1 } }
          });
        },
        {
          client: {
            $transaction: async (operation, options) => {
              assert.equal(options.isolationLevel, 'Serializable');
              try {
                return await connection.$transaction(operation, options);
              } catch (error) {
                errors.push(error.code);
                throw error;
              }
            }
          }
        }
      )
    );
    const completed = await Promise.allSettled(workers);
    for (const item of completed) assert.equal(item.status, 'fulfilled', String(item.reason));
    assert.deepEqual(errors, ['P2034']);
    assert.equal(attempts[0] + attempts[1], 3);
    for (const id of ids)
      assert.equal((await client.user.findUnique({ where: { id } })).sessionVersion, 3);
    report.deadlock = {
      errors,
      attempts,
      committedTransactions: 2,
      configuredIsolation: 'Serializable',
      finalCounterPerRow: 3,
      partialWrites: false
    };

    const locked = deferred(),
      release = deferred();
    const holder = client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${ids[0]} FOR UPDATE`;
        locked.resolve();
        await release.promise;
      },
      { timeout: 10000 }
    );
    // Attach immediately so an early failure cannot become an unhandled rejection.
    const holderOutcome = holder.then(
      () => null,
      (error) => {
        locked.resolve();
        return error;
      }
    );
    await locked.promise;
    try {
      let started = Date.now();
      await assert.rejects(
        () =>
          other.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM User WHERE id = ${ids[0]} FOR UPDATE NOWAIT`;
          }),
        (error) => {
          report.nowait = {
            prismaCode: error.code,
            mysqlCode: String(error.meta?.code),
            elapsedMs: Date.now() - started
          };
          return error.code === 'P2010' && String(error.meta?.code) === '3572';
        }
      );
      assert(report.nowait.elapsedMs < 2000);
      started = Date.now();
      await assert.rejects(
        () =>
          other.$transaction(
            async (tx) => {
              await tx.$executeRawUnsafe('SET SESSION innodb_lock_wait_timeout = 1');
              await tx.$executeRaw`UPDATE User SET sessionVersion = 99 WHERE id = ${ids[0]}`;
            },
            { timeout: 8000 }
          ),
        (error) => {
          report.lockTimeout = {
            prismaCode: error.code,
            mysqlCode: String(error.meta?.code),
            elapsedMs: Date.now() - started
          };
          return error.code === 'P2010' && String(error.meta?.code) === '1205';
        }
      );
      assert(report.lockTimeout.elapsedMs >= 800 && report.lockTimeout.elapsedMs < 5000);
    } finally {
      release.resolve();
      await holderOutcome;
      await holder;
    }
    assert.equal((await client.user.findUnique({ where: { id: ids[0] } })).sessionVersion, 3);
    await assert.rejects(
      () =>
        client.$transaction(
          async (tx) => {
            await tx.user.update({ where: { id: ids[0] }, data: { sessionVersion: 99 } });
            await new Promise((done) => setTimeout(done, 250));
          },
          { timeout: 100 }
        ),
      (error) => {
        report.transactionTimeout = { prismaCode: error.code, writesRolledBack: true };
        return error.code === 'P2028';
      }
    );
    assert.equal((await client.user.findUnique({ where: { id: ids[0] } })).sessionVersion, 3);
    await client.$transaction(
      async (tx) => {
        const before = await tx.user.findUnique({ where: { id: ids[0] } });
        await other.user.update({ where: { id: ids[0] }, data: { sessionVersion: 4 } });
        const after = await tx.user.findUnique({ where: { id: ids[0] } });
        assert.equal(before.sessionVersion, 3);
        assert.equal(after.sessionVersion, 3);
      },
      { isolationLevel: 'RepeatableRead' }
    );
    assert.equal((await client.user.findUnique({ where: { id: ids[0] } })).sessionVersion, 4);
    report.repeatableRead = {
      snapshotPreserved: true,
      concurrentCommitVisibleAfterTransaction: true
    };
    return report;
  } finally {
    // Only fixture IDs created by this probe in its already verified instance.
    try {
      if (ids.length) await client.user.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await Promise.all([client.$disconnect(), other?.$disconnect(), runtimePrisma?.$disconnect()]);
    }
  }
}
