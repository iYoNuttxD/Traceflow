import { prisma } from '../../database/prismaClient.js';

export const projectInvitationRepository = {
  createReplacingActive(data) {
    return prisma.$transaction(async (tx) => {
      await tx.projectInvitation.updateMany({
        where: { projectId: data.projectId, email: data.email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() }
      });
      return tx.projectInvitation.create({ data, include: { project: { select: { name: true } } } });
    });
  },
  list(projectId) { return prisma.projectInvitation.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, expiresAt: true, revokedAt: true, acceptedAt: true, createdAt: true } }); },
  findByHash(tokenHash) { return prisma.projectInvitation.findUnique({ where: { tokenHash } }); },
  revoke(projectId, id) { return prisma.projectInvitation.updateMany({ where: { id, projectId, revokedAt: null, acceptedAt: null }, data: { revokedAt: new Date() } }); },
  async accept(invitation, userId) {
    return prisma.$transaction(async (tx) => {
      const membership = await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
        create: { projectId: invitation.projectId, userId, role: invitation.role },
        update: { role: invitation.role, isActive: true }
      });
      await tx.projectInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date(), acceptedById: userId } });
      return membership;
    });
  }
};
