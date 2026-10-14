import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { changedFields } from '../../shared/persistence/changed-fields.js';

export const githubBranchRepository = {
  async syncObserved(projectId, branches, defaultBranch, now = new Date()) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const existing = await tx.gitBranch.findMany({ where: { projectId } });
        const existingByName = new Map(existing.map((branch) => [branch.name, branch]));
        const observedNames = branches.map(({ name }) => name);

        await tx.gitBranch.updateMany({
          where: { projectId, isActive: true, name: { notIn: observedNames } },
          data: { isActive: false, isDefault: false, inactiveAt: now }
        });

        const known = branches.filter(({ name }) => existingByName.has(name));
        if (known.length)
          await tx.gitBranch.updateMany({
            where: { projectId, name: { in: known.map(({ name }) => name) } },
            data: { lastSeenAt: now }
          });

        const fresh = branches.filter(({ name }) => !existingByName.has(name));
        if (fresh.length)
          await tx.gitBranch.createMany({
            data: fresh.map((branch) => ({
              projectId,
              name: branch.name,
              headSha: branch.headSha,
              isDefault: branch.name === defaultBranch,
              isActive: true,
              firstSeenAt: now,
              lastSeenAt: now
            }))
          });

        for (const branch of known) {
          const previous = existingByName.get(branch.name);
          const reactivated = !previous.isActive;
          const changes = changedFields(
            previous,
            { headSha: branch.headSha, isDefault: branch.name === defaultBranch },
            ['headSha', 'isDefault']
          );
          if (!reactivated && Object.keys(changes).length === 0) continue;
          await tx.gitBranch.updateMany({
            where: { id: previous.id },
            data: {
              ...changes,
              ...(reactivated
                ? { isActive: true, reactivatedAt: now, reactivationCount: { increment: 1 } }
                : {})
            }
          });
        }

        return tx.gitBranch.findMany({
          where: { projectId, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
        });
      },
      SYNC_WRITE
    );
  },

  markSuccessfullySynced(projectId, branchId, headSha) {
    return withActiveProjectWrite(
      projectId,
      (tx) =>
        tx.gitBranch.update({
          where: { id: branchId, projectId },
          data: { lastSyncedHeadSha: headSha || null }
        }),
      SYNC_WRITE
    );
  },

  listByProjectId(projectId, { activeOnly = true } = {}) {
    return prisma.gitBranch.findMany({
      where: { projectId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });
  }
};
