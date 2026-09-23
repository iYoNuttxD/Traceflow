// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from './active-project-write.js';

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
      where: {
        deletedAt: null,
        ...(userId ? { memberships: { some: { userId, isActive: true } } } : {})
      },
      orderBy: { createdAt: 'desc' },
      include: { githubIntegration: true }
    });
  },

  findRecentlyDeletedOwnedProjects(userId, now = new Date()) {
    return prisma.project.findMany({
      where: {
        deletedAt: { not: null },
        deletionScheduledFor: { gt: now },
        memberships: { some: { userId, role: 'OWNER', isActive: true } }
      },
      orderBy: { deletionScheduledFor: 'asc' },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        deletionScheduledFor: true,
        githubIntegration: {
          select: { githubRepositoryId: true, repositoryFullName: true }
        }
      }
    });
  },

  async updateProject(id, data) {
    return withActiveProjectWrite(id, (tx) => tx.project.update({ where: { id }, data }));
  },

  async findById(id) {
    return prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { githubIntegration: { include: { installation: true } } }
    });
  },

  async findByIdIncludingDeleted(id) {
    return prisma.project.findUnique({
      where: { id },
      include: { githubIntegration: { include: { installation: true } } }
    });
  },

  async isActive(id) {
    return Boolean(
      await prisma.project.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
    );
  },

  async updateGithubSyncSettings(id, githubAutoSyncEnabled) {
    await withActiveProjectWrite(id, (tx) =>
      tx.projectGitHubIntegration.update({
        where: { projectId: id },
        data: { autoSyncEnabled: githubAutoSyncEnabled }
      })
    );
    return this.findById(id);
  },

  async updateGithubRepositoryMetadata(id, data) {
    return withActiveProjectWrite(id, (tx) =>
      tx.projectGitHubIntegration.update({ where: { projectId: id }, data })
    );
  },

  async markGithubSyncStarted(id, attemptedAt) {
    return withActiveProjectWrite(
      id,
      (tx) =>
        tx.projectGitHubIntegration.update({
          where: { projectId: id },
          data: { lastSyncStatus: 'SINCRONIZANDO', lastSyncAttemptAt: attemptedAt }
        }),
      { inactiveResult: null }
    );
  },

  async markGithubSyncSucceeded(id, syncedAt) {
    const updated = await withActiveProjectWrite(
      id,
      (tx) =>
        tx.projectGitHubIntegration.update({
          where: { projectId: id },
          data: {
            lastSyncAt: syncedAt,
            lastSyncAttemptAt: syncedAt,
            lastSyncStatus: 'SINCRONIZADO',
            lastSyncError: null
          }
        }),
      { inactiveResult: null }
    );
    if (!updated) return null;
    return this.findById(id);
  },

  async markGithubSyncFailed(id, attemptedAt, errorMessage) {
    return withActiveProjectWrite(
      id,
      (tx) =>
        tx.projectGitHubIntegration.update({
          where: { projectId: id },
          data: {
            lastSyncAttemptAt: attemptedAt,
            lastSyncStatus: 'FALHA',
            lastSyncError: errorMessage
          }
        }),
      { inactiveResult: null }
    );
  }
};
