import { prisma } from '../../database/prismaClient.js';
import { ProjectServiceError } from './project.schema.js';

export async function lockActiveProject(tx, projectId) {
  // A locking read observes the current row even after an earlier RR snapshot.
  const rows = await tx.$queryRaw`
    SELECT id FROM Project WHERE id = ${projectId} AND deletedAt IS NULL FOR UPDATE
  `;
  if (!rows.length) throw new ProjectServiceError('Projeto não encontrado.', 404);
}

// The same Project row lock is used by soft delete. The active check and writes
// therefore have one commit order, even if a sync fetched GitHub data earlier.
export function withActiveProjectWrite(projectId, write, { inactiveResult } = {}) {
  return prisma.$transaction(async (tx) => {
    try {
      await lockActiveProject(tx, projectId);
    } catch (error) {
      if (error instanceof ProjectServiceError && inactiveResult !== undefined) {
        return inactiveResult;
      }
      throw error;
    }
    return write(tx);
  });
}
