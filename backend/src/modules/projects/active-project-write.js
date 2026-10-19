import { prisma } from '../../database/prismaClient.js';
import { ProjectServiceError } from './project.schema.js';
import { assertProjectWriteGuard, projectWriteUsesNowait } from './project-write-context.js';

const LOCK_RETRY_MS = 50;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms + Math.random() * ms));

export const SYNC_WRITE = Object.freeze({ lockWaitLimitMs: 5000 });

export function isProjectWriteBusy(error) {
  return (
    error?.code === 'PROJECT_WRITE_BUSY' ||
    (error?.code === 'P2010' && String(error.meta?.code) === '3572')
  );
}

export async function lockActiveProject(
  tx,
  projectId,
  { nowait = projectWriteUsesNowait(projectId) } = {}
) {
  // A locking read observes the current row even after an earlier RR snapshot.
  let rows;
  try {
    rows = nowait
      ? await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} AND deletedAt IS NULL FOR UPDATE NOWAIT`
      : await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} AND deletedAt IS NULL FOR UPDATE`;
  } catch (error) {
    if (isProjectWriteBusy(error))
      throw new ProjectServiceError(
        'O projeto está ocupado. Tente novamente em instantes.',
        503,
        'PROJECT_WRITE_BUSY'
      );
    throw error;
  }
  if (!rows.length) throw new ProjectServiceError('Projeto não encontrado.', 404);
}

function writeOnce(projectId, write, { inactiveResult, timeout, nowait }) {
  return prisma.$transaction(
    async (tx) => {
      try {
        await lockActiveProject(tx, projectId, { nowait });
      } catch (error) {
        if (
          error instanceof ProjectServiceError &&
          error.statusCode === 404 &&
          inactiveResult !== undefined
        ) {
          return inactiveResult;
        }
        throw error;
      }
      await assertProjectWriteGuard(tx, projectId);
      return write(tx);
    },
    timeout ? { timeout } : undefined
  );
}

// The same Project row lock is used by soft delete. The active check and writes
// therefore have one commit order, even if a sync fetched GitHub data earlier.
export async function withActiveProjectWrite(
  projectId,
  write,
  { inactiveResult, timeout, nowait, lockWaitLimitMs } = {}
) {
  if (lockWaitLimitMs === undefined)
    return writeOnce(projectId, write, { inactiveResult, timeout, nowait });
  const deadline = Date.now() + lockWaitLimitMs;
  for (;;) {
    try {
      return await writeOnce(projectId, write, { inactiveResult, timeout, nowait: true });
    } catch (error) {
      if (!isProjectWriteBusy(error) || Date.now() + 2 * LOCK_RETRY_MS > deadline) throw error;
      await pause(LOCK_RETRY_MS);
    }
  }
}
