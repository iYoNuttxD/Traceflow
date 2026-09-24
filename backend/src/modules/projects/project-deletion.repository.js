import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { lockProjectLifecycle, lockProjectMembership } from './project-lifecycle-lock.js';

const projectDeletionSelect = {
  id: true,
  name: true,
  deletedAt: true,
  deletionScheduledFor: true,
  deletedById: true,
  purgeStartedAt: true,
  purgeClaimId: true,
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
      if (!(await lockProjectLifecycle(tx, projectId))) return { outcome: 'NOT_FOUND' };
      await lockProjectMembership(tx, projectId, userId);
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
          purgeStartedAt: null,
          purgeClaimId: null
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
      if (!(await lockProjectLifecycle(tx, projectId))) return { outcome: 'NOT_FOUND' };
      await lockProjectMembership(tx, projectId, userId);
      const project = await this.context(projectId, userId, tx);
      if (!project?.deletedAt) return { outcome: 'NOT_FOUND' };
      const membership = project.memberships[0];
      if (!membership) return { outcome: 'NOT_FOUND' };
      if (membership.role !== 'OWNER') return { outcome: 'FORBIDDEN' };
      if (!project.deletionScheduledFor || project.deletionScheduledFor <= now)
        return { outcome: 'EXPIRED' };
      if (await tx.projectPurgeStorageCleanup.count({ where: { projectId } })) {
        return { outcome: 'CONFLICT' };
      }

      const restored = await tx.project.updateMany({
        where: {
          id: projectId,
          deletedAt: { not: null },
          deletionScheduledFor: { gt: now },
          purgeStartedAt: null,
          purgeClaimId: null
        },
        data: {
          deletedAt: null,
          deletionScheduledFor: null,
          deletedById: null,
          purgeClaimId: null
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

  async claimPurge(
    projectId,
    now,
    { dueOnly = false, staleBefore = null, userId = null, confirmationName = null } = {}
  ) {
    return prisma.$transaction(async (tx) => {
      if (!(await lockProjectLifecycle(tx, projectId))) return { outcome: 'NOT_FOUND' };
      if (userId) await lockProjectMembership(tx, projectId, userId);
      const project = userId
        ? await this.context(projectId, userId, tx)
        : await tx.project.findUnique({ where: { id: projectId }, select: projectDeletionSelect });
      if (!project?.deletedAt) return { outcome: 'NOT_FOUND' };
      if (userId) {
        const membership = project.memberships[0];
        if (!membership) return { outcome: 'NOT_FOUND' };
        if (membership.role !== 'OWNER') return { outcome: 'FORBIDDEN' };
        if (confirmationName !== project.name) return { outcome: 'INVALID_CONFIRMATION' };
      }
      if (dueOnly && project.deletionScheduledFor > now) return { outcome: 'CONFLICT' };
      if (
        project.purgeClaimId &&
        (!staleBefore || !project.purgeStartedAt || project.purgeStartedAt >= staleBefore)
      ) {
        return { outcome: 'CONFLICT' };
      }
      const token = randomUUID();
      await tx.project.update({
        where: { id: projectId },
        data: { purgeStartedAt: now, purgeClaimId: token }
      });
      await tx.projectPurgeStorageCleanup.updateMany({
        where: { projectId, status: { not: 'READY' } },
        data: { claimToken: token, claimedAt: now }
      });
      return { outcome: 'CLAIMED', token };
    });
  },

  releasePurge(projectId, token) {
    return prisma.project.updateMany({
      where: { id: projectId, deletedAt: { not: null }, purgeClaimId: token },
      data: { purgeStartedAt: null, purgeClaimId: null }
    });
  },

  evidence(projectId) {
    return prisma.testEvidence.findMany({
      where: { projectId },
      select: { storageKey: true }
    });
  },

  async prepareStorageCleanup(projectId, token, items, now) {
    return prisma.$transaction(async (tx) => {
      if (!(await lockProjectLifecycle(tx, projectId))) return null;
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { purgeClaimId: true, deletedAt: true }
      });
      if (!project?.deletedAt || project.purgeClaimId !== token) return null;
      for (const item of items) {
        await tx.projectPurgeStorageCleanup.upsert({
          where: { storageKey: item.storageKey },
          create: {
            projectId,
            storageKey: item.storageKey,
            purgeKey: item.purgeKey,
            claimToken: token,
            claimedAt: now
          },
          // Keep the original purge key: a worker can die after rename but before
          // recording STAGED, so a successor must use the same physical path.
          update: { claimToken: token, claimedAt: now }
        });
      }
      return tx.projectPurgeStorageCleanup.findMany({
        where: { projectId, status: { not: 'READY' } },
        orderBy: { id: 'asc' }
      });
    });
  },

  async stageStorageItem(projectId, token, item, storage) {
    return prisma.$transaction(async (tx) => {
      if (!(await lockProjectLifecycle(tx, projectId))) return false;
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { purgeClaimId: true, deletedAt: true }
      });
      if (!project?.deletedAt || project.purgeClaimId !== token) return false;
      const journal = await tx.projectPurgeStorageCleanup.findUnique({
        where: { storageKey: item.storageKey }
      });
      if (journal?.claimToken !== token || journal.status === 'READY') return false;
      const status = await storage.stageForPurge(journal.storageKey, journal.purgeKey);
      await tx.projectPurgeStorageCleanup.update({
        where: { id: journal.id },
        data: { status }
      });
      return true;
    });
  },

  async restoreStorageItem(projectId, token, item, storage) {
    return prisma.$transaction(async (tx) => {
      if (!(await lockProjectLifecycle(tx, projectId))) return false;
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { purgeClaimId: true }
      });
      if (project?.purgeClaimId !== token) return false;
      const journal = await tx.projectPurgeStorageCleanup.findUnique({ where: { id: item.id } });
      if (journal?.claimToken !== token) return false;
      await storage.restoreFromPurge(journal.storageKey, journal.purgeKey);
      await tx.projectPurgeStorageCleanup.delete({ where: { id: journal.id } });
      return true;
    });
  },

  async cleanupReadyStorageItem(id, token, storage) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ProjectPurgeStorageCleanup WHERE id = ${id} FOR UPDATE`;
      const journal = await tx.projectPurgeStorageCleanup.findUnique({ where: { id } });
      if (journal?.status !== 'READY' || journal.claimToken !== token) return false;
      await storage.deletePurged(journal.storageKey, journal.purgeKey);
      await tx.projectPurgeStorageCleanup.delete({ where: { id } });
      return true;
    });
  },

  failStorageCleanup(id, token, errorCode) {
    return prisma.projectPurgeStorageCleanup.updateMany({
      where: { id, status: 'READY', claimToken: token },
      data: {
        attempts: { increment: 1 },
        lastError: String(errorCode || 'STORAGE_CLEANUP_FAILED').slice(0, 191),
        claimToken: null,
        claimedAt: null
      }
    });
  },

  pendingStorageCleanup({ projectId = null, readyOnly = false } = {}) {
    return prisma.projectPurgeStorageCleanup.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(readyOnly ? { status: 'READY' } : {})
      },
      orderBy: { id: 'asc' }
    });
  },

  claimReadyStorageCleanup(id, now, staleBefore) {
    const token = randomUUID();
    return prisma.projectPurgeStorageCleanup
      .updateMany({
        where: {
          id,
          status: 'READY',
          OR: [{ claimToken: null }, { claimedAt: { lt: staleBefore } }]
        },
        data: { claimToken: token, claimedAt: now }
      })
      .then((result) => (result.count === 1 ? token : null));
  },

  dueProjects(now) {
    return prisma.project.findMany({
      where: { deletedAt: { not: null }, deletionScheduledFor: { lte: now } },
      select: { id: true },
      orderBy: { deletionScheduledFor: 'asc' }
    });
  },

  async deleteProjectGraph(projectId, token, auditData) {
    return prisma.$transaction(
      async (tx) => {
        if (!(await lockProjectLifecycle(tx, projectId))) return false;
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, deletedAt: true, purgeClaimId: true }
        });
        if (!project?.deletedAt || project.purgeClaimId !== token) return false;

        const [evidence, staged] = await Promise.all([
          tx.testEvidence.findMany({ where: { projectId }, select: { storageKey: true } }),
          tx.projectPurgeStorageCleanup.findMany({
            where: { projectId, claimToken: token, status: { in: ['STAGED', 'MISSING'] } },
            select: { storageKey: true }
          })
        ]);
        const stagedKeys = new Set(staged.map(({ storageKey }) => storageKey));
        if (evidence.some(({ storageKey }) => !stagedKeys.has(storageKey))) {
          throw new AppError({
            message: 'Journal de evidência incompleto; purge pode ser tentado novamente.',
            statusCode: 409,
            code: ERROR_CODES.CONFLICT,
            exposeTechnicalDetails: true
          });
        }

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
          where: { projectId, claimToken: token },
          data: { status: 'READY' }
        });
        return true;
      },
      { maxWait: 5000, timeout: 15000 }
    );
  }
};
