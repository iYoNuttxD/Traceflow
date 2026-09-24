import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';

export const githubBranchRepository = {
  async syncObserved(projectId, branches, defaultBranch, now = new Date()) {
    return withActiveProjectWrite(projectId, async (tx) => {
      const existing = await tx.gitBranch.findMany({ where: { projectId } });
      const existingByName = new Map(existing.map((branch) => [branch.name, branch]));
      const observedNames = branches.map(({ name }) => name);

      await tx.gitBranch.updateMany({
        where: { projectId, isActive: true, name: { notIn: observedNames } },
        data: { isActive: false, isDefault: false, inactiveAt: now }
      });

      for (const branch of branches) {
        const previous = existingByName.get(branch.name);
        const reactivated = previous && !previous.isActive;
        await tx.gitBranch.upsert({
          where: { projectId_name: { projectId, name: branch.name } },
          create: {
            projectId,
            name: branch.name,
            headSha: branch.headSha,
            isDefault: branch.name === defaultBranch,
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now
          },
          update: {
            headSha: branch.headSha,
            isDefault: branch.name === defaultBranch,
            isActive: true,
            lastSeenAt: now,
            ...(reactivated ? { reactivatedAt: now, reactivationCount: { increment: 1 } } : {})
          }
        });
      }

      return tx.gitBranch.findMany({
        where: { projectId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
      });
    });
  },

  markSuccessfullySynced(projectId, branchId, headSha) {
    return withActiveProjectWrite(projectId, (tx) =>
      tx.gitBranch.update({
        where: { id: branchId, projectId },
        data: { lastSyncedHeadSha: headSha || null }
      })
    );
  },

  listByProjectId(projectId, { activeOnly = true } = {}) {
    return prisma.gitBranch.findMany({
      where: { projectId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });
  }
};
