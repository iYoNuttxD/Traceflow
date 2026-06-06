// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
// TODO: Implementar o CRUD completo de projetos em tarefas futuras.
import { prisma } from '../../database/prismaClient.js';

export const projectRepository = {
  async findById(id) {
    return prisma.project.findUnique({
      where: { id }
    });
  },

  async findByGithubRepositoryId(githubRepositoryId) {
    return prisma.project.findFirst({
      where: { githubRepositoryId }
    });
  },

  async findByGithubRepositoryFullName(githubRepositoryFullName) {
    return prisma.project.findFirst({
      where: { githubRepositoryFullName }
    });
  },

  async createFromGithub(data) {
    return prisma.project.create({ data });
  },

  async updateGithubSyncSettings(id, githubAutoSyncEnabled) {
    return prisma.project.update({
      where: { id },
      data: { githubAutoSyncEnabled }
    });
  },

  async updateGithubLastSyncAt(id, githubLastSyncAt) {
    return prisma.project.update({
      where: { id },
      data: { githubLastSyncAt }
    });
  }
};
