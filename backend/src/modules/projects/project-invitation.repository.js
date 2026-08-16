import { prisma } from '../../database/prismaClient.js';
import { serializableTransaction } from '../../database/serializable-transaction.js';

const invitationSelect = {
  id: true,
  projectId: true,
  email: true,
  role: true,
  expiresAt: true,
  revokedAt: true,
  acceptedAt: true,
  declinedAt: true,
  createdAt: true,
  project: { select: { name: true } }
};

export const projectInvitationRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },
  createUnlessPending(data) {
    return serializableTransaction(async (tx) => {
      const activeMembership = await tx.projectMembership.findFirst({
        where: {
          projectId: data.projectId,
          isActive: true,
          user: { email: data.email }
        },
        select: { id: true }
      });
      if (activeMembership) return { alreadyMember: true };

      const pendingInvitation = await tx.projectInvitation.findFirst({
        where: {
          projectId: data.projectId,
          email: data.email,
          revokedAt: null,
          acceptedAt: null,
          declinedAt: null,
          expiresAt: { gt: new Date() }
        },
        select: { id: true }
      });
      if (pendingInvitation) return { alreadyPending: true };

      return {
        invitation: await tx.projectInvitation.create({
          data,
          include: { project: { select: { name: true } } }
        })
      };
    });
  },
  list(projectId) {
    return prisma.projectInvitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: invitationSelect
    });
  },
  findByHash(tokenHash) {
    return prisma.projectInvitation.findUnique({
      where: { tokenHash },
      select: invitationSelect
    });
  },
  revoke(projectId, id) {
    const revokedAt = new Date();
    return prisma.projectInvitation.updateMany({
      where: {
        id,
        projectId,
        revokedAt: null,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: revokedAt }
      },
      data: { revokedAt }
    });
  },
  accept(invitation, userId) {
    return serializableTransaction(async (tx) => {
      const existingMembership = await tx.projectMembership.findUnique({
        where: {
          projectId_userId: { projectId: invitation.projectId, userId }
        },
        select: { isActive: true }
      });
      if (existingMembership?.isActive) return { alreadyMember: true };

      const acceptedAt = new Date();
      const claim = await tx.projectInvitation.updateMany({
        where: {
          id: invitation.id,
          email: invitation.email,
          revokedAt: null,
          acceptedAt: null,
          declinedAt: null,
          expiresAt: { gt: acceptedAt }
        },
        data: { acceptedAt, acceptedById: userId }
      });
      if (!claim.count) return { claimed: false };

      const membership = await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        create: { projectId: invitation.projectId, userId, role: invitation.role },
        update: { role: invitation.role, isActive: true }
      });
      return { claimed: true, membership };
    });
  },
  decline(invitation, userId) {
    const declinedAt = new Date();
    return prisma.projectInvitation.updateMany({
      where: {
        id: invitation.id,
        email: invitation.email,
        revokedAt: null,
        acceptedAt: null,
        declinedAt: null,
        expiresAt: { gt: declinedAt }
      },
      data: { declinedAt, declinedById: userId }
    });
  }
};
