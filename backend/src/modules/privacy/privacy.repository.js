import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const sessionSelect = {
  id: true,
  expiresAt: true,
  lastSeenAt: true,
  revokedAt: true,
  createdAt: true
};

export const privacyRepository = {
  findUser(id) {
    return prisma.user.findUnique({ where: { id } });
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },
  listSessions(userId) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: sessionSelect,
      orderBy: { lastSeenAt: 'desc' }
    });
  },
  lastOwnedProjects(userId) {
    return prisma.project
      .findMany({
        where: { memberships: { some: { userId, role: 'OWNER', isActive: true } } },
        select: {
          id: true,
          name: true,
          _count: { select: { memberships: { where: { role: 'OWNER', isActive: true } } } }
        }
      })
      .then((projects) =>
        projects
          .filter((project) => project._count.memberships <= 1)
          .map(({ _count, ...project }) => project)
      );
  },
  personalData(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            id: true,
            projectId: true,
            role: true,
            isActive: true,
            joinedAt: true,
            project: { select: { name: true } }
          }
        },
        responsibleTasks: {
          select: { id: true, projectId: true, title: true, status: true, createdAt: true }
        },
        taskMovements: {
          select: {
            id: true,
            projectId: true,
            taskId: true,
            fromStatus: true,
            toStatus: true,
            movedAt: true
          }
        },
        createdInvitations: {
          select: {
            id: true,
            projectId: true,
            role: true,
            expiresAt: true,
            revokedAt: true,
            acceptedAt: true,
            createdAt: true
          }
        },
        acceptedInvitations: {
          select: { id: true, projectId: true, role: true, acceptedAt: true, createdAt: true }
        },
        privacyRequests: {
          select: {
            id: true,
            type: true,
            status: true,
            requestedAt: true,
            scheduledFor: true,
            completedAt: true,
            cancelledAt: true
          }
        },
        personalDataExports: {
          select: { id: true, status: true, format: true, expiresAt: true, createdAt: true }
        },
        reviewedTaskCommitSuggestions: {
          select: {
            id: true,
            projectId: true,
            taskId: true,
            commitId: true,
            status: true,
            reviewedAt: true
          }
        }
      }
    });
  },
  githubData(email) {
    return prisma.commit.findMany({
      where: { authorEmail: email },
      select: { id: true, projectId: true, hash: true, date: true, authorUsername: true },
      orderBy: { date: 'desc' },
      take: 500
    });
  },
  async updateProfile(userId, data, auditData) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, email: true, isActive: true, updatedAt: true }
      });
      await auditRepository.create(auditData, tx);
      return user;
    });
  },
  async revokeSession(userId, sessionId, auditData) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      if (result.count) await auditRepository.create(auditData, tx);
      return result.count;
    });
  },
  async revokeAllSessions(userId, auditData) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await auditRepository.create(auditData, tx);
      return result.count;
    });
  },
  async createExport(userId, expiresAt, auditData, completedAuditData) {
    return prisma.$transaction(async (tx) => {
      const record = await tx.personalDataExport.create({
        data: { userId, status: 'COMPLETED', format: 'JSON', expiresAt, completedAt: new Date() }
      });
      await auditRepository.create(auditData, tx);
      await auditRepository.create({ ...completedAuditData, resourceId: String(record.id) }, tx);
      return record;
    });
  },
  findExport(userId, id) {
    return prisma.personalDataExport.findFirst({ where: { id, userId } });
  },
  expireExport(id) {
    return prisma.personalDataExport.update({ where: { id }, data: { status: 'EXPIRED' } });
  },
  pendingDeletion(userId) {
    return prisma.privacyRequest.findFirst({
      where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' },
      orderBy: { requestedAt: 'desc' }
    });
  },
  async requestDeletion(userId, scheduledFor, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const existing = await tx.privacyRequest.findFirst({
          where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' }
        });
        if (existing) return existing;
        const request = await tx.privacyRequest.create({
          data: { userId, type: 'ACCOUNT_DELETION', scheduledFor }
        });
        await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
        return request;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async cancelDeletion(userId, auditData) {
    return prisma.$transaction(async (tx) => {
      const request = await tx.privacyRequest.findFirst({
        where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' }
      });
      if (!request) return null;
      const updated = await tx.privacyRequest.update({
        where: { id: request.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      });
      await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
      return updated;
    });
  },
  async deactivate(userId, auditData, completedAuditData) {
    return prisma.$transaction(
      async (tx) => {
        const owned = await tx.projectMembership.findMany({
          where: { userId, role: 'OWNER', isActive: true },
          select: { projectId: true, project: { select: { name: true } } }
        });
        const blocked = [];
        for (const membership of owned) {
          if (
            (await tx.projectMembership.count({
              where: { projectId: membership.projectId, role: 'OWNER', isActive: true }
            })) <= 1
          )
            blocked.push({ id: membership.projectId, name: membership.project.name });
        }
        if (blocked.length) return { lastOwnerProjects: blocked };
        const request = await tx.privacyRequest.create({
          data: {
            userId,
            type: 'ACCOUNT_DEACTIVATION',
            status: 'COMPLETED',
            completedAt: new Date()
          }
        });
        await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
        await tx.projectMembership.updateMany({ where: { userId }, data: { isActive: false } });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() }
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: new Date() }
        });
        await tx.user.update({
          where: { id: userId },
          data: { isActive: false, sessionVersion: { increment: 1 } }
        });
        await auditRepository.create({ ...completedAuditData, resourceId: String(request.id) }, tx);
        return request;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  dueDeletionRequests(now = new Date()) {
    return prisma.privacyRequest.findMany({
      where: { type: 'ACCOUNT_DELETION', status: 'PENDING', scheduledFor: { lte: now } },
      select: { id: true, userId: true }
    });
  },
  async anonymize(requestId, anonymous, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const request = await tx.privacyRequest.findUnique({ where: { id: requestId } });
        if (!request || request.status !== 'PENDING') return null;
        const owned = await tx.projectMembership.findMany({
          where: { userId: request.userId, role: 'OWNER', isActive: true },
          select: { projectId: true }
        });
        for (const membership of owned) {
          if (
            (await tx.projectMembership.count({
              where: { projectId: membership.projectId, role: 'OWNER', isActive: true }
            })) <= 1
          )
            return { blocked: true };
        }
        const currentUser = await tx.user.findUnique({
          where: { id: request.userId },
          select: { email: true }
        });
        await tx.session.deleteMany({ where: { userId: request.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: request.userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubAppConnectionState.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubInstallationAuthorization.deleteMany({ where: { userId: request.userId } });
        await tx.projectInvitation.updateMany({
          where: { OR: [{ createdById: request.userId }, { email: currentUser.email }] },
          data: { revokedAt: new Date() }
        });
        await tx.projectInvitation.updateMany({
          where: { acceptedById: request.userId },
          data: { acceptedById: null }
        });
        await tx.projectMembership.updateMany({
          where: { userId: request.userId },
          data: { isActive: false }
        });
        await tx.task.updateMany({
          where: { responsibleUserId: request.userId },
          data: { responsible: anonymous.name }
        });
        await tx.taskMovement.updateMany({
          where: { movedByUserId: request.userId },
          data: { movedBy: anonymous.name }
        });
        await tx.user.update({
          where: { id: request.userId },
          data: {
            name: anonymous.name,
            username: anonymous.username,
            email: anonymous.email,
            passwordHash: null,
            isActive: false,
            emailVerifiedAt: null,
            mustSetPassword: false,
            mustSetUsername: false,
            sessionVersion: { increment: 1 }
          }
        });
        await tx.privacyRequest.update({
          where: { id: request.id },
          data: { status: 'COMPLETED', completedAt: new Date() }
        });
        await auditRepository.create(auditData, tx);
        return { userId: request.userId, requestId: request.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
};
