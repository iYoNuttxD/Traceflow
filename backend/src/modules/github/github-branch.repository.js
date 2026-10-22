import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { changedFields } from '../../shared/persistence/changed-fields.js';
import { randomUUID } from 'node:crypto';

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
