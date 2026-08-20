// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
import { prisma } from '../../database/prismaClient.js';

export const projectRepository = {
  async createProject(data, ownerUserId) {
    if (!ownerUserId) return prisma.project.create({ data });
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data });
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: ownerUserId, role: 'OWNER' }
      });
      return project;
    });
  },
  async createGithubAppProject(data, ownerUserId, installationId, repository) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data });
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: ownerUserId, role: 'OWNER' }
      });
      await tx.projectGitHubIntegration.create({
        data: {
          projectId: project.id,
          installationId,
          githubRepositoryId: repository.githubRepositoryId,
          repositoryName: repository.name,
          repositoryFullName: repository.fullName,
          repositoryUrl: repository.url,
          defaultBranch: repository.defaultBranch,
          repositoryPrivate: repository.private,
          integratedAt: new Date(),
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
          lastSyncStatus: 'PENDENTE'
        }
      });
      return tx.project.findUnique({
        where: { id: project.id },
        include: { githubIntegration: true }
      });
    });
  },

  async findAllProjects(userId) {
    return prisma.project.findMany({
      ...(userId ? { where: { memberships: { some: { userId, isActive: true } } } } : {}),
      orderBy: { createdAt: 'desc' },
      include: { githubIntegration: true }
    });
  },

  async updateProject(id, data) {
    return prisma.project.update({
      where: { id },
      data
    });
  },

  async findById(id) {
    return prisma.project.findUnique({
      where: { id },
      include: { githubIntegration: { include: { installation: true } } }
    });
  },

  async updateGithubSyncSettings(id, githubAutoSyncEnabled) {
    await prisma.projectGitHubIntegration.update({
      where: { projectId: id },
      data: { autoSyncEnabled: githubAutoSyncEnabled }
    });
    return this.findById(id);
  },

  async updateGithubRepositoryMetadata(id, data) {
    return prisma.projectGitHubIntegration.update({
      where: { projectId: id },
      data
    });
  },

  async markGithubSyncStarted(id, attemptedAt) {
    return prisma.projectGitHubIntegration.update({
      where: { projectId: id },
      data: {
        lastSyncStatus: 'SINCRONIZANDO',
        lastSyncAttemptAt: attemptedAt
      }
    });
  },

  async markGithubSyncSucceeded(id, syncedAt) {
    await prisma.projectGitHubIntegration.update({
      where: { projectId: id },
      data: {
        lastSyncAt: syncedAt,
        lastSyncAttemptAt: syncedAt,
        lastSyncStatus: 'SINCRONIZADO',
        lastSyncError: null
      }
    });
    return this.findById(id);
  },

  async markGithubSyncFailed(id, attemptedAt, errorMessage) {
    return prisma.projectGitHubIntegration.update({
      where: { projectId: id },
      data: {
        lastSyncAttemptAt: attemptedAt,
        lastSyncStatus: 'FALHA',
        lastSyncError: errorMessage
      }
    });
  }
};
