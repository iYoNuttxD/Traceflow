// Repository de commits importados do GitHub.
import { prisma } from '../../database/prismaClient.js';

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
      select: { id: true, projectId: true, hash: true, message: true }
    });
  },

  async create(data) {
    return prisma.commit.create({ data });
  },

  async createMany(data) {
    if (data.length === 0) {
      return { count: 0 };
    }

    return prisma.commit.createMany({
      data,
      skipDuplicates: true
    });
  },

  async createBranchLinks(data) {
    if (data.length === 0) return { count: 0 };
    return prisma.commitBranch.createMany({ data, skipDuplicates: true });
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
                { branch: { contains: filters.search } },
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
