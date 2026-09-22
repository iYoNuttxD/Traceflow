import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const projectDeletionSelect = {
  id: true,
  name: true,
  deletedAt: true,
  deletionScheduledFor: true,
  deletedById: true,
  purgeStartedAt: true,
  githubIntegration: {
    select: {
      githubRepositoryId: true,
      repositoryFullName: true
    }
  }
};

export const projectDeletionRepository = {
  context(projectId, userId, client = prisma) {
    return client.project.findUnique({
      where: { id: projectId },
      select: {
        ...projectDeletionSelect,
        memberships: {
          where: { userId, isActive: true },
          select: { id: true, role: true }
        }
      }
    });
  },

  async requestDeletion({ projectId, userId, now, scheduledFor, auditData }) {
    return prisma.$transaction(async (tx) => {
      const project = await this.context(projectId, userId, tx);
      if (!project) return { outcome: 'NOT_FOUND' };
      const membership = project.memberships[0];
      if (!membership) return { outcome: 'NOT_FOUND' };
      if (membership.role !== 'OWNER') return { outcome: 'FORBIDDEN' };
      if (project.deletedAt) return { outcome: 'ALREADY_DELETED', project };

      const claimed = await tx.project.updateMany({
        where: { id: projectId, deletedAt: null },
        data: {
          deletedAt: now,
          deletionScheduledFor: scheduledFor,
          deletedById: userId,
          purgeStartedAt: null
        }
      });
      if (claimed.count !== 1) return { outcome: 'ALREADY_DELETED' };

      await tx.projectInvitation.updateMany({
        where: {
          projectId,
          revokedAt: null,
          acceptedAt: null,
          declinedAt: null
        },
        data: { revokedAt: now }
      });
      await auditRepository.create(auditData, tx);
      return {
        outcome: 'DELETED',
        project: await tx.project.findUnique({
          where: { id: projectId },
          select: projectDeletionSelect
        })
      };
    });
  },

  async restore({ projectId, userId, now, auditData }) {
    return prisma.$transaction(async (tx) => {
      const project = await this.context(projectId, userId, tx);
      if (!project?.deletedAt) return { outcome: 'NOT_FOUND' };
      const membership = project.memberships[0];
      if (!membership) return { outcome: 'NOT_FOUND' };
      if (membership.role !== 'OWNER') return { outcome: 'FORBIDDEN' };
      if (!project.deletionScheduledFor || project.deletionScheduledFor <= now)
        return { outcome: 'EXPIRED' };

      const restored = await tx.project.updateMany({
        where: {
          id: projectId,
          deletedAt: { not: null },
          deletionScheduledFor: { gt: now },
          purgeStartedAt: null
        },
        data: {
          deletedAt: null,
          deletionScheduledFor: null,
          deletedById: null
        }
      });
      if (restored.count !== 1) return { outcome: 'CONFLICT' };
      await auditRepository.create(auditData, tx);
      return {
        outcome: 'RESTORED',
        project: await tx.project.findUnique({
          where: { id: projectId },
          select: projectDeletionSelect
        })
      };
    });
  },

  claimPurge(projectId, now, { dueOnly = false, staleBefore = null } = {}) {
    return prisma.project.updateMany({
      where: {
        id: projectId,
        deletedAt: { not: null },
        ...(dueOnly ? { deletionScheduledFor: { lte: now } } : {}),
        OR: [
          { purgeStartedAt: null },
          ...(staleBefore ? [{ purgeStartedAt: { lt: staleBefore } }] : [])
        ]
      },
      data: { purgeStartedAt: now }
    });
  },

  releasePurge(projectId) {
    return prisma.project.updateMany({
      where: { id: projectId, deletedAt: { not: null } },
      data: { purgeStartedAt: null }
    });
  },

  evidence(projectId) {
    return prisma.testEvidence.findMany({
      where: { projectId },
      select: { storageKey: true }
    });
  },

  prepareStorageCleanup(projectId, items) {
    if (items.length === 0) return Promise.resolve();
    return prisma.$transaction(
      items.map((item) =>
        prisma.projectPurgeStorageCleanup.upsert({
          where: { storageKey: item.storageKey },
          create: { projectId, storageKey: item.storageKey, purgeKey: item.purgeKey },
          update: { projectId, purgeKey: item.purgeKey, status: 'PENDING', lastError: null }
        })
      )
    );
  },

  markStorageStaged(storageKey, status) {
    return prisma.projectPurgeStorageCleanup.update({
      where: { storageKey },
      data: { status }
    });
  },

  markStorageCleanupReady(projectId) {
    return prisma.projectPurgeStorageCleanup.updateMany({
      where: { projectId },
      data: { status: 'READY' }
    });
  },

  completeStorageCleanup(id) {
    return prisma.projectPurgeStorageCleanup.deleteMany({ where: { id } });
  },

  failStorageCleanup(id, errorCode) {
    return prisma.projectPurgeStorageCleanup.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: String(errorCode || 'STORAGE_CLEANUP_FAILED').slice(0, 191)
      }
    });
  },

  removeStorageCleanupForProject(projectId) {
    return prisma.projectPurgeStorageCleanup.deleteMany({ where: { projectId } });
  },

  pendingStorageCleanup() {
    return prisma.projectPurgeStorageCleanup.findMany({ orderBy: { id: 'asc' } });
  },

  projectExists(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  dueProjects(now) {
    return prisma.project.findMany({
      where: { deletedAt: { not: null }, deletionScheduledFor: { lte: now } },
      select: { id: true },
      orderBy: { deletionScheduledFor: 'asc' }
    });
  },

  async deleteProjectGraph(projectId, auditData) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, deletedAt: true, purgeStartedAt: true }
      });
      if (!project?.deletedAt || !project.purgeStartedAt) return false;

      await tx.defectRetest.deleteMany({ where: { defect: { projectId } } });
      await tx.defectTask.deleteMany({ where: { defect: { projectId } } });
      await tx.defectHistoryEntry.deleteMany({ where: { projectId } });
      await tx.defect.deleteMany({ where: { projectId } });
      await tx.testEvidence.deleteMany({ where: { projectId } });
      await tx.testExecutionStep.deleteMany({ where: { execution: { projectId } } });
      await tx.testExecution.deleteMany({ where: { projectId } });
      await tx.testCaseHistoryEntry.deleteMany({ where: { projectId } });
      await tx.testCaseVersion.deleteMany({ where: { testCase: { projectId } } });
      await tx.testCaseTask.deleteMany({ where: { testCase: { projectId } } });
      await tx.testCaseStep.deleteMany({ where: { testCase: { projectId } } });
      await tx.testCase.deleteMany({ where: { projectId } });
      await tx.taskMovement.deleteMany({ where: { projectId } });
      await tx.task.deleteMany({ where: { projectId } });
      await auditRepository.create(auditData, tx);
      await tx.project.delete({ where: { id: projectId } });
      await tx.projectPurgeStorageCleanup.updateMany({
        where: { projectId },
        data: { status: 'READY' }
      });
      return true;
    });
  }
};
