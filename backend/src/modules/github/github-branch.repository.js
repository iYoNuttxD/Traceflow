import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';
import { randomUUID } from 'node:crypto';

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

  reconcileMembership(projectId, branchId, headSha, commitIds) {
    if (!headSha) throw new Error('Head da branch ausente; membership não pode ser confirmado.');
    const generation = randomUUID();
    const uniqueIds = [...new Set(commitIds)];
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const branch = await tx.gitBranch.findFirst({
          where: { id: branchId, projectId, isActive: true }
        });
        if (!branch || branch.headSha !== headSha) {
          throw new Error('Head da branch mudou durante a sincronização.');
        }
        let created = 0;
        for (let offset = 0; offset < uniqueIds.length; offset += 500) {
          const ids = uniqueIds.slice(offset, offset + 500);
          const owned = await tx.commit.count({ where: { projectId, id: { in: ids } } });
          if (owned !== ids.length) {
            throw new Error('Commit observado não pertence ao projeto da branch.');
          }
          const result = await tx.commitBranch.createMany({
            data: ids.map((commitId) => ({
              commitId,
              branchId,
              lastObservedGeneration: generation
            })),
            skipDuplicates: true
          });
          created += result.count;
          await tx.commitBranch.updateMany({
            where: { branchId, commitId: { in: ids } },
            data: { lastObservedGeneration: generation }
          });
        }
        await tx.commitBranch.deleteMany({
          where: {
            branchId,
            OR: [{ lastObservedGeneration: null }, { lastObservedGeneration: { not: generation } }]
          }
        });
        await tx.gitBranch.update({
          where: { id: branchId, projectId },
          data: { lastSyncedHeadSha: headSha, lastSyncedGeneration: generation }
        });
        return { count: created };
      },
      { timeout: 120000 }
    );
  },

  listByProjectId(projectId, { activeOnly = true } = {}) {
    return prisma.gitBranch.findMany({
      where: { projectId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });
  }
};
