import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

export const privacyRepository = {
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
  dueDeletionRequests(now = new Date()) {
    const staleLease = new Date(now.getTime() - 30 * 60 * 1000);
    return prisma.privacyRequest.findMany({
      where: {
        type: 'ACCOUNT_DELETION',
        status: 'PENDING',
        scheduledFor: { lte: now },
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lte: staleLease } }]
      },
      select: { id: true, userId: true, scheduledFor: true, lastAttemptAt: true }
    });
  },
  markDeletionFailure(requestId, failureCode, now = new Date()) {
    return prisma.privacyRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { failureCode, lastAttemptAt: now, processingStartedAt: null }
    });
  },
  async anonymize(requestId, anonymous, startedAuditData, completedAuditData, now = new Date()) {
    return prisma.$transaction(
      async (tx) => {
        const request = await tx.privacyRequest.findUnique({ where: { id: requestId } });
        if (
          !request ||
          request.status !== 'PENDING' ||
          !request.scheduledFor ||
          request.scheduledFor > now
        )
          return null;
        const currentUser = await tx.user.findUnique({ where: { id: request.userId } });
        if (!currentUser || currentUser.accountStatus === 'ANONYMIZED') return null;
        const staleLease = new Date(now.getTime() - 30 * 60 * 1000);
        const claim = await tx.privacyRequest.updateMany({
          where: {
            id: request.id,
            status: 'PENDING',
            OR: [{ processingStartedAt: null }, { processingStartedAt: { lte: staleLease } }]
          },
          data: { processingStartedAt: now, lastAttemptAt: now, failureCode: null }
        });
        if (!claim.count) return null;
        await auditRepository.create(startedAuditData, tx);
        const owned = await tx.projectMembership.findMany({
          where: { userId: request.userId, role: 'OWNER', isActive: true },
          select: { projectId: true }
        });
        for (const membership of owned) {
          if (
            (await tx.projectMembership.count({
              where: { projectId: membership.projectId, role: 'OWNER', isActive: true }
            })) <= 1
          ) {
            await tx.privacyRequest.update({
              where: { id: request.id },
              data: { processingStartedAt: null, failureCode: 'SOLE_PROJECT_OWNER' }
            });
            return { blocked: true };
          }
        }
        await tx.session.deleteMany({ where: { userId: request.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: request.userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubAppConnectionState.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubOAuthState.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubIdentity.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubInstallationAuthorization.deleteMany({ where: { userId: request.userId } });
        await tx.emailChangeRequest.deleteMany({ where: { userId: request.userId } });
        await tx.accountReactivationToken.deleteMany({ where: { userId: request.userId } });
        await tx.projectInvitation.updateMany({
          where: {
            createdById: request.userId,
            revokedAt: null,
            acceptedAt: null,
            declinedAt: null
          },
          data: { revokedAt: now }
        });
        await tx.projectInvitation.updateMany({
          where: { email: currentUser.email },
          data: { email: anonymous.email, revokedAt: now }
        });
        await tx.projectInvitation.updateMany({
          where: { acceptedById: request.userId },
          data: { acceptedById: null }
        });
        await tx.projectInvitation.updateMany({
          where: { declinedById: request.userId },
          data: { declinedById: null }
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
        await tx.commit.updateMany({
          where: { authorEmail: currentUser.email },
          data: {
            authorName: anonymous.name,
            authorEmail: anonymous.email,
            authorUsername: anonymous.username
          }
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
            sessionVersion: { increment: 1 },
            accountStatus: 'ANONYMIZED',
            anonymizedAt: now,
            deactivatedAt: null
          }
        });
        await tx.privacyRequest.update({
          where: { id: request.id },
          data: {
            status: 'COMPLETED',
            completedAt: now,
            processingStartedAt: null,
            failureCode: null
          }
        });
        await auditRepository.create(completedAuditData, tx);
        return { userId: request.userId, requestId: request.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
};
