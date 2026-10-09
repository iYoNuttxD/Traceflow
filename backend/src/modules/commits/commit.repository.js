// Repository de commits importados do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';

export const commitRepository = {
  async findByProjectIdAndHash(projectId, hash) {
    return prisma.commit.findUnique({
      where: {
        projectId_hash: {
          projectId,
          hash
        }
      }
    });
  },

  async findHashesByProjectId(projectId, hashes) {
    const commits = await prisma.commit.findMany({
      where: {
        projectId,
        ...(Array.isArray(hashes) ? { hash: { in: hashes } } : {})
      },
      select: { hash: true }
    });

    return commits.map((commit) => commit.hash);
  },

  async findByProjectIdAndHashes(projectId, hashes) {
    if (!hashes.length) return [];
    return prisma.commit.findMany({
      where: { projectId, hash: { in: hashes } },
      select: { id: true, projectId: true, hash: true, message: true, authorGithubUserId: true }
    });
  },

  async create(data) {
    return prisma.commit.create({ data });
  },

  async createMany(data) {
    if (data.length === 0) {
      return { count: 0 };
    }

    return withActiveProjectWrite(data[0].projectId, (tx) =>
      tx.commit.createMany({ data, skipDuplicates: true })
    );
  },

  async fillGithubAuthorIds(projectId, commits) {
    const identified = commits.filter(({ authorGithubUserId }) => authorGithubUserId != null);
    if (!identified.length) return;
    await withActiveProjectWrite(projectId, async (tx) => {
      for (const commit of identified) {
        await tx.commit.updateMany({
          where: { projectId, hash: commit.hash, authorGithubUserId: null },
          data: { authorGithubUserId: commit.authorGithubUserId }
        });
      }
    });
  },

  async createBranchLinks(projectId, data) {
    if (data.length === 0) return { count: 0 };
    return withActiveProjectWrite(projectId, (tx) =>
      tx.commitBranch.createMany({ data, skipDuplicates: true })
    );
  },

  async findByBranchId(branchId) {
    const links = await prisma.commitBranch.findMany({
      where: { branchId },
      select: { commit: { select: { id: true, projectId: true, hash: true, message: true } } }
    });
    return links.map(({ commit }) => commit);
  },

  async listByProjectId(projectId, filters = {}) {
    return prisma.commit.findMany({
      where: {
        projectId,
        ...(filters.branch ? { branchLinks: { some: { branch: { name: filters.branch } } } } : {}),
        ...(filters.search
          ? {
              OR: [
                { hash: { contains: filters.search } },
                { message: { contains: filters.search } },
                { authorName: { contains: filters.search } },
                { authorUsername: { contains: filters.search } },
                { branchLinks: { some: { branch: { name: { contains: filters.search } } } } }
              ]
            }
          : {})
      },
      include: {
        branchLinks: {
          include: { branch: { select: { name: true, isActive: true, isDefault: true } } },
          orderBy: { branch: { name: 'asc' } }
        }
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
