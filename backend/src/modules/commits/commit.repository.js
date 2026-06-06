// Repository de commits importados do GitHub.
// TODO: Evoluir consultas quando commits forem vinculados a tarefas e requisitos.
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

  async findHashesByProjectId(projectId) {
    const commits = await prisma.commit.findMany({
      where: { projectId },
      select: { hash: true }
    });

    return commits.map((commit) => commit.hash);
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

  async listByProjectId(projectId) {
    return prisma.commit.findMany({
      where: { projectId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
