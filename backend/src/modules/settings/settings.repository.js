import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const accountSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  mustSetUsername: true,
  accountStatus: true,
  deactivatedAt: true,
  usernameChangedAt: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true
};

async function soleOwnerProjects(tx, userId) {
  const memberships = await tx.projectMembership.findMany({
    where: { userId, role: 'OWNER', isActive: true },
    select: { projectId: true, project: { select: { id: true, name: true, status: true } } }
  });
  const blocked = [];
  for (const membership of memberships) {
    const owners = await tx.projectMembership.count({
      where: { projectId: membership.projectId, role: 'OWNER', isActive: true }
    });
    if (owners <= 1 && membership.project.status !== 'EXCLUIDO') {
      blocked.push({ id: membership.project.id, name: membership.project.name });
    }
  }
  return blocked;
}

export const settingsRepository = {
  account(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { ...accountSelect, passwordHash: true }
    });
  },
  findUserByEmail(email) {
    return prisma.user.findUnique({ where: { email }, select: { id: true } });
  },
  findUserByUsername(username) {
    return prisma.user.findUnique({ where: { username }, select: { id: true } });
  },
  async updateProfile(userId, name, auditData) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { name },
        select: accountSelect
      });
      await auditRepository.create(auditData, tx);
      return user;
    });
  },
  async updateUsername(userId, username, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) return null;
        const changed = await tx.user.update({
          where: { id: userId },
          data: { username, usernameChangedAt: now, mustSetUsername: false },
          select: accountSelect
        });
        await auditRepository.create(auditData, tx);
        return changed;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  pendingEmailChange(userId) {
    return prisma.emailChangeRequest.findFirst({
      where: { userId, verifiedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, newEmail: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
  },
  async createEmailChange(userId, data, auditData) {
    return prisma.$transaction(
      async (tx) => {
        await tx.emailChangeRequest.updateMany({
          where: { userId, verifiedAt: null, cancelledAt: null },
          data: { cancelledAt: data.now }
        });
        const request = await tx.emailChangeRequest.create({
          data: {
            userId,
            currentEmailSnapshot: data.currentEmailSnapshot,
            newEmail: data.newEmail,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt
          },
          select: { id: true, newEmail: true, expiresAt: true, createdAt: true }
        });
        await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
        return request;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async cancelEmailChange(userId, now, auditData) {
    return prisma.$transaction(async (tx) => {
      const request = await tx.emailChangeRequest.findFirst({
        where: { userId, verifiedAt: null, cancelledAt: null },
        orderBy: { createdAt: 'desc' }
      });
      if (!request) return null;
      const updated = await tx.emailChangeRequest.update({
        where: { id: request.id },
        data: { cancelledAt: now }
      });
      await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
      return updated;
    });
  },
  async confirmEmailChange(tokenHash, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const request = await tx.emailChangeRequest.findUnique({
          where: { tokenHash },
          include: { user: true }
        });
        if (!request) return { outcome: 'invalid' };
        if (request.verifiedAt || request.cancelledAt) return { outcome: 'used' };
        if (request.expiresAt <= now) return { outcome: 'expired' };
        if (request.user.accountStatus !== 'ACTIVE') return { outcome: 'inactive' };
        const user = await tx.user.update({
          where: { id: request.userId },
          data: {
            email: request.newEmail,
            emailVerifiedAt: now,
            sessionVersion: { increment: 1 }
          },
          select: accountSelect
        });
        await tx.emailChangeRequest.update({
          where: { id: request.id },
          data: { verifiedAt: now }
        });
        await tx.emailChangeRequest.updateMany({
          where: {
            userId: request.userId,
            id: { not: request.id },
            verifiedAt: null,
            cancelledAt: null
          },
          data: { cancelledAt: now }
        });
        await tx.session.updateMany({
          where: { userId: request.userId, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create({ ...auditData, actorUserId: request.userId }, tx);
        return { outcome: 'confirmed', user, previousEmail: request.currentEmailSnapshot };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  listSessions(userId) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        publicId: true,
        rememberMe: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true
      },
      orderBy: { lastSeenAt: 'desc' }
    });
  },
  async changePassword(userId, currentSessionId, passwordHash, now, auditData) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, sessionVersion: { increment: 1 } }
      });
      await tx.session.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: now }
      });
      await tx.session.update({
        where: { id: currentSessionId },
        data: { sessionVersion: user.sessionVersion }
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now }
      });
      await auditRepository.create(auditData, tx);
      return user;
    });
  },
  async initializePassword(
    userId,
    currentSessionId,
    passwordHash,
    reauthenticatedAfter,
    now,
    auditData
  ) {
    return prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { githubIdentity: true }
        });
        if (!user) return { status: 'missing' };
        if (user.passwordHash) return { status: 'already_set' };
        if (!user.githubIdentity) return { status: 'identity_missing' };
        const session = await tx.session.findFirst({
          where: {
            id: currentSessionId,
            userId,
            revokedAt: null,
            expiresAt: { gt: now },
            lastReauthenticatedAt: { gte: reauthenticatedAfter }
          }
        });
        if (!session) return { status: 'reauth_required' };
        const updated = await tx.user.update({
          where: { id: userId },
          data: { passwordHash, mustSetPassword: false, sessionVersion: { increment: 1 } }
        });
        await tx.session.updateMany({
          where: { userId, id: { not: currentSessionId }, revokedAt: null },
          data: { revokedAt: now }
        });
        await tx.session.update({
          where: { id: currentSessionId },
          data: { sessionVersion: updated.sessionVersion, lastReauthenticatedAt: null }
        });
        await tx.passwordResetToken.updateMany({
          where: { userId, usedAt: null },
          data: { usedAt: now }
        });
        await auditRepository.create(auditData, tx);
        return { status: 'initialized' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async unlinkGithubIdentity(userId, currentSessionId, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          include: { githubIdentity: true }
        });
        if (!user?.githubIdentity) return { status: 'not_linked' };
        if (!user.passwordHash) return { status: 'password_required' };
        await tx.gitHubIdentity.delete({ where: { id: user.githubIdentity.id } });
        await tx.session.updateMany({
          where: { userId, id: { not: currentSessionId }, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create(auditData, tx);
        return { status: 'unlinked' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async revokeSession(userId, publicId, now, auditData) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({ where: { publicId, userId } });
      if (!session) return null;
      if (!session.revokedAt) {
        await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
        await auditRepository.create({ ...auditData, resourceId: publicId }, tx);
      }
      return { ...session, revokedAt: session.revokedAt || now };
    });
  },
  async revokeOtherSessions(userId, currentSessionId, now, auditData) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: now }
      });
      await auditRepository.create({ ...auditData, metadataJson: { count: result.count } }, tx);
      return result.count;
    });
  },
  async deactivate(userId, currentSessionId, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const blocked = await soleOwnerProjects(tx, userId);
        if (blocked.length) return { blocked };
        await tx.emailChangeRequest.updateMany({
          where: { userId, verifiedAt: null, cancelledAt: null },
          data: { cancelledAt: now }
        });
        const user = await tx.user.update({
          where: { id: userId },
          data: { accountStatus: 'DEACTIVATED', deactivatedAt: now, isActive: true },
          select: accountSelect
        });
        await tx.session.updateMany({
          where: { userId, id: { not: currentSessionId }, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create(auditData, tx);
        return { user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async createReactivationToken(userId, tokenHash, expiresAt, now, auditData) {
    return prisma.$transaction(async (tx) => {
      await tx.accountReactivationToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now }
      });
      const record = await tx.accountReactivationToken.create({
        data: { userId, tokenHash, expiresAt }
      });
      await auditRepository.create({ ...auditData, resourceId: String(record.id) }, tx);
      return record;
    });
  },
  async confirmReactivation(tokenHash, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const token = await tx.accountReactivationToken.findUnique({
          where: { tokenHash },
          include: { user: true }
        });
        if (!token || token.usedAt || token.expiresAt <= now) return null;
        if (token.user.accountStatus !== 'DEACTIVATED') return null;
        await tx.accountReactivationToken.update({
          where: { id: token.id },
          data: { usedAt: now }
        });
        const user = await tx.user.update({
          where: { id: token.userId },
          data: {
            accountStatus: 'ACTIVE',
            deactivatedAt: null,
            isActive: true,
            sessionVersion: { increment: 1 }
          },
          select: accountSelect
        });
        await tx.session.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create({ ...auditData, actorUserId: token.userId }, tx);
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  pendingDeletion(userId) {
    return prisma.privacyRequest.findFirst({
      where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' },
      orderBy: { requestedAt: 'desc' }
    });
  },
  async requestDeletion(userId, currentSessionId, now, scheduledFor, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const blocked = await soleOwnerProjects(tx, userId);
        if (blocked.length) return { blocked };
        const existing = await tx.privacyRequest.findFirst({
          where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' }
        });
        if (existing) return { request: existing };
        await tx.emailChangeRequest.updateMany({
          where: { userId, verifiedAt: null, cancelledAt: null },
          data: { cancelledAt: now }
        });
        const request = await tx.privacyRequest.create({
          data: { userId, type: 'ACCOUNT_DELETION', requestedAt: now, scheduledFor }
        });
        await tx.user.update({
          where: { id: userId },
          data: { accountStatus: 'DELETION_PENDING', isActive: true }
        });
        await tx.session.updateMany({
          where: { userId, id: { not: currentSessionId }, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
        return { request };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  async cancelDeletion(userId, now, auditData) {
    return prisma.$transaction(
      async (tx) => {
        const request = await tx.privacyRequest.findFirst({
          where: { userId, type: 'ACCOUNT_DELETION', status: 'PENDING' }
        });
        if (!request) {
          const cancelled = await tx.privacyRequest.findFirst({
            where: { userId, type: 'ACCOUNT_DELETION', status: 'CANCELLED' },
            orderBy: { cancelledAt: 'desc' }
          });
          return cancelled ? { request: cancelled, changed: false } : null;
        }
        if (request.scheduledFor <= now) return null;
        const updated = await tx.privacyRequest.update({
          where: { id: request.id },
          data: { status: 'CANCELLED', cancelledAt: now }
        });
        await tx.user.update({
          where: { id: userId },
          data: { accountStatus: 'ACTIVE', sessionVersion: { increment: 1 } }
        });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now }
        });
        await auditRepository.create({ ...auditData, resourceId: String(request.id) }, tx);
        return { request: updated, changed: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  },
  exportData(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...accountSelect,
        memberships: {
          select: {
            projectId: true,
            role: true,
            isActive: true,
            joinedAt: true,
            project: {
              select: {
                id: true,
                name: true,
                description: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                requirements: {
                  select: {
                    id: true,
                    title: true,
                    description: true,
                    type: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true
                  }
                }
              }
            }
          }
        },
        responsibleTasks: {
          select: {
            id: true,
            projectId: true,
            title: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        },
        sessions: {
          select: {
            publicId: true,
            rememberMe: true,
            createdAt: true,
            lastSeenAt: true,
            expiresAt: true,
            revokedAt: true
          }
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
        auditEvents: {
          select: {
            id: true,
            occurredAt: true,
            action: true,
            resourceType: true,
            resourceId: true,
            result: true,
            reasonCode: true
          }
        },
        githubInstallationAuthorizations: {
          select: {
            id: true,
            verifiedAt: true,
            createdAt: true,
            installation: {
              select: {
                accountLogin: true,
                accountType: true,
                status: true,
                installedAt: true,
                projectIntegrations: {
                  select: {
                    repositoryFullName: true,
                    status: true,
                    project: { select: { id: true, name: true } }
                  }
                }
              }
            }
          }
        }
      }
    });
  },
  async recordExport(userId, now, expiresAt, auditData) {
    return prisma.$transaction(async (tx) => {
      const record = await tx.personalDataExport.create({
        data: { userId, status: 'COMPLETED', format: 'ZIP_JSON', expiresAt, completedAt: now }
      });
      await auditRepository.create({ ...auditData, resourceId: String(record.id) }, tx);
      return record;
    });
  },
  listGithubAuthorizations(userId) {
    return prisma.gitHubInstallationAuthorization.findMany({
      where: { userId },
      include: {
        installation: {
          include: {
            projectIntegrations: {
              include: { project: { select: { id: true, name: true } } },
              orderBy: { projectId: 'asc' }
            }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  },
  async removeGithubAuthorization(userId, authorizationId, now, auditData) {
    return prisma.$transaction(async (tx) => {
      const authorization = await tx.gitHubInstallationAuthorization.findFirst({
        where: { id: authorizationId, userId },
        include: {
          installation: {
            include: {
              projectIntegrations: { include: { project: { select: { id: true, name: true } } } }
            }
          }
        }
      });
      if (!authorization) return null;
      await tx.gitHubRepositoryAuthorization.deleteMany({
        where: { installationId: authorization.installationId, userId }
      });
      await tx.gitHubInstallationAuthorization.delete({ where: { id: authorization.id } });
      await auditRepository.create({ ...auditData, resourceId: String(authorization.id) }, tx);
      return {
        id: authorization.id,
        projects: authorization.installation.projectIntegrations.map(({ project }) => project),
        removedAt: now
      };
    });
  }
};
