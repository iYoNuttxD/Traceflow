import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

export const privacyRepository = {
  dueDeletionRequests(now = new Date()) {
    const staleLease = new Date(now.getTime() - 30 * 60 * 1000);
    return prisma.privacyRequest.findMany({
      where: {
        type: 'ACCOUNT_DELETION',
        status: 'PENDING',
        scheduledFor: { lte: now },
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lte: staleLease } }]
      },
      select: {
        id: true,
        userId: true,
        scheduledFor: true,
        lastAttemptAt: true,
        user: {
          select: {
            githubIdentity: { select: { githubUserId: true } }
          }
        }
      }
    });
  },
  markDeletionFailure(requestId, failureCode, auditData, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.privacyRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { failureCode, lastAttemptAt: now, processingStartedAt: null }
      });
      if (updated.count) await auditRepository.create(auditData, tx);
      return updated;
    });
  },
  async anonymize(
    requestId,
    anonymous,
    { startedAuditData, blockedAuditData, returnedActiveAuditData, completedAuditData },
    now = new Date()
  ) {
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
        const currentUser = await tx.user.findUnique({
          where: { id: request.userId },
          include: { githubIdentity: true }
        });
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
          select: { projectId: true, project: { select: { status: true } } }
        });
        for (const membership of owned) {
          if (
            membership.project.status !== 'EXCLUIDO' &&
            (await tx.projectMembership.count({
              where: { projectId: membership.projectId, role: 'OWNER', isActive: true }
            })) <= 1
          ) {
            await tx.privacyRequest.update({
              where: { id: request.id },
              data: {
                status: 'REJECTED',
                completedAt: now,
                reasonCode: 'SOLE_PROJECT_OWNER',
                processingStartedAt: null,
                failureCode: null
              }
            });
            await tx.user.update({
              where: { id: request.userId },
              data: {
                accountStatus: 'ACTIVE',
                isActive: true,
                deactivatedAt: null,
                sessionVersion: { increment: 1 }
              }
            });
            await tx.session.updateMany({
              where: { userId: request.userId, revokedAt: null },
              data: { revokedAt: now }
            });
            await auditRepository.create(blockedAuditData, tx);
            await auditRepository.create(returnedActiveAuditData, tx);
            return {
              blocked: true,
              reasonCode: 'SOLE_PROJECT_OWNER',
              userId: request.userId,
              requestId: request.id
            };
          }
        }
        if (currentUser.githubIdentity) {
          if (!anonymous.githubUserFingerprint) {
            throw new Error('GITHUB_IDENTITY_FINGERPRINT_REQUIRED');
          }
          await tx.gitHubIdentityTombstone.upsert({
            where: { githubUserFingerprint: anonymous.githubUserFingerprint },
            create: { githubUserFingerprint: anonymous.githubUserFingerprint },
            update: {}
          });
        }
        await tx.session.deleteMany({ where: { userId: request.userId } });
        await tx.passwordResetToken.deleteMany({ where: { userId: request.userId } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubAppConnectionState.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubOAuthState.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubIdentity.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubInstallationAuthorization.deleteMany({ where: { userId: request.userId } });
        await tx.gitHubRepositoryAuthorization.deleteMany({ where: { userId: request.userId } });
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
          where: {
            email: currentUser.email,
            revokedAt: null,
            acceptedAt: null,
            declinedAt: null
          },
          data: { email: anonymous.email, revokedAt: now }
        });
        await tx.projectInvitation.updateMany({
          where: {
            email: currentUser.email,
            OR: [
              { revokedAt: { not: null } },
              { acceptedAt: { not: null } },
              { declinedAt: { not: null } }
            ]
          },
          data: { email: anonymous.email }
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
        if (currentUser.githubIdentity) {
          const githubLogin = currentUser.githubIdentity.githubLogin;
          await tx.commit.updateMany({
            where: { authorUsername: githubLogin },
            data: { authorUsername: anonymous.username }
          });
          await tx.pullRequest.updateMany({
            where: { authorUsername: githubLogin },
            data: { authorUsername: anonymous.username }
          });
          await tx.issue.updateMany({
            where: { authorUsername: githubLogin },
            data: { authorUsername: anonymous.username }
          });
          await tx.issue.updateMany({
            where: { assigneeUsername: githubLogin },
            data: { assigneeUsername: anonymous.username }
          });
        }
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
