// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from './active-project-write.js';
import { distributedSyncAt, eligibleIntegration } from '../github/github-sync-schedule.js';

export const projectRepository = {
  async createProject(data, ownerUserId) {
    if (!ownerUserId) return prisma.project.create({ data, include: { githubIntegration: true } });
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data, include: { githubIntegration: true } });
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
    return withActiveProjectWrite(id, (tx) =>
      tx.project.update({ where: { id }, data, include: { githubIntegration: true } })
    );
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
    await withActiveProjectWrite(id, async (tx) => {
      const current = await tx.projectGitHubIntegration.findUnique({
        where: { projectId: id },
        include: { installation: true }
      });
      const active = await tx.gitHubSyncRun.findUnique({ where: { activeProjectId: id } });
      const enabled = { ...current, autoSyncEnabled: githubAutoSyncEnabled };
      await tx.projectGitHubIntegration.update({
        where: { projectId: id },
        data: {
          autoSyncEnabled: githubAutoSyncEnabled,
          nextSyncAt:
            eligibleIntegration(enabled) && !active
              ? current.nextSyncAt || distributedSyncAt(id, new Date())
              : null
        }
      });
    });
    return this.findById(id);
  },

  async updateGithubRepositoryMetadata(id, data) {
    return withActiveProjectWrite(
      id,
      (tx) => tx.projectGitHubIntegration.update({ where: { projectId: id }, data }),
      SYNC_WRITE
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
      { ...SYNC_WRITE, inactiveResult: null }
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
      { ...SYNC_WRITE, inactiveResult: null }
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
      { ...SYNC_WRITE, inactiveResult: null }
    );
  }
};
