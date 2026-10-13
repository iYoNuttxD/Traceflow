import { prisma } from '../../database/prismaClient.js';
import { isLockBusy } from '../../database/locks.js';
import { ProjectServiceError } from './project.schema.js';

const LOCK_RETRY_MS = 50;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * ms));

export const SYNC_WRITE = Object.freeze({ lockWaitLimitMs: 5000 });

export async function lockActiveProject(tx, projectId, { noWait = false } = {}) {
  // A locking read observes the current row even after an earlier RR snapshot.
  const rows = noWait
    ? await tx.$queryRaw`
        SELECT id FROM Project WHERE id = ${projectId} AND deletedAt IS NULL FOR UPDATE NOWAIT
      `
    : await tx.$queryRaw`
        SELECT id FROM Project WHERE id = ${projectId} AND deletedAt IS NULL FOR UPDATE
      `;
  if (!rows.length) throw new ProjectServiceError('Projeto não encontrado.', 404);
}

function writeOnce(projectId, write, { inactiveResult, noWait }) {
  return prisma.$transaction(async (tx) => {
    try {
      await lockActiveProject(tx, projectId, { noWait });
    } catch (error) {
      if (error instanceof ProjectServiceError && inactiveResult !== undefined) {
        return inactiveResult;
      }
      throw error;
    }
    return write(tx);
  });
}

// The same Project row lock is used by soft delete. The active check and writes
// therefore have one commit order, even if a sync fetched GitHub data earlier.
export async function withActiveProjectWrite(
  projectId,
  write,
  { inactiveResult, lockWaitLimitMs } = {}
) {
  if (lockWaitLimitMs === undefined)
    return writeOnce(projectId, write, { inactiveResult, noWait: false });
  const deadline = Date.now() + lockWaitLimitMs;
  for (;;) {
    try {
      return await writeOnce(projectId, write, { inactiveResult, noWait: true });
    } catch (error) {
      if (!isLockBusy(error) || Date.now() + 2 * LOCK_RETRY_MS > deadline) throw error;
      await pause(LOCK_RETRY_MS);
    }
  }
}
