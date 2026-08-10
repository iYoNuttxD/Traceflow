import { prisma } from '../../database/prismaClient.js';

export const githubBranchRepository = {
  async syncObserved(projectId, branches, defaultBranch, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      await tx.gitBranch.updateMany({
        where: { projectId },
        data: { isActive: false, isDefault: false }
      });

      for (const branch of branches) {
        await tx.gitBranch.upsert({
          where: { projectId_name: { projectId, name: branch.name } },
          create: {
            projectId,
            name: branch.name,
            headSha: branch.headSha,
            isDefault: branch.name === defaultBranch,
            isActive: true,
            lastSeenAt: now
          },
          update: {
            headSha: branch.headSha,
            isDefault: branch.name === defaultBranch,
            isActive: true,
            lastSeenAt: now
          }
        });
      }

      return tx.gitBranch.findMany({
        where: { projectId, isActive: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
      });
    });
  },

  listByProjectId(projectId, { activeOnly = true } = {}) {
    return prisma.gitBranch.findMany({
      where: { projectId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });
  }
};
