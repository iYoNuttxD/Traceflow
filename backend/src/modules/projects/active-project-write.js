import { prisma } from '../../database/prismaClient.js';
import { lockProjectLifecycle } from './project-lifecycle-lock.js';
import { ProjectServiceError } from './project.schema.js';

// The same Project row lock is used by soft delete. The active check and writes
// therefore have one commit order, even if a sync fetched GitHub data earlier.
export function withActiveProjectWrite(projectId, write, { inactiveResult } = {}) {
  return prisma.$transaction(async (tx) => {
    const exists = await lockProjectLifecycle(tx, projectId);
    const project = exists
      ? await tx.project.findUnique({ where: { id: projectId }, select: { deletedAt: true } })
      : null;
    if (!project || project.deletedAt) {
      if (inactiveResult !== undefined) return inactiveResult;
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }
    return write(tx);
  });
}
