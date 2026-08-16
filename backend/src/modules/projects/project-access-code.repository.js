import { prisma } from '../../database/prismaClient.js';
import { serializableTransaction } from '../../database/serializable-transaction.js';
import { auditRepository } from '../audit/audit.repository.js';

const accessConfigurationSelect = {
  id: true,
  accessCode: true,
  accessCodeRole: true
};

const joinProjectSelect = {
  id: true,
  name: true,
  accessCodeRole: true
};

export const projectAccessCodeRepository = {
  findConfiguration(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: accessConfigurationSelect
    });
  },

  findByCode(accessCode) {
    return prisma.project.findUnique({
      where: { accessCode },
      select: joinProjectSelect
    });
  },

  findCodeOwner(accessCode) {
    return prisma.project.findUnique({
      where: { accessCode },
      select: { id: true }
    });
  },

  regenerate(projectId, accessCode, inviteLink) {
    return prisma.project.update({
      where: { id: projectId },
      data: { accessCode, inviteLink },
      select: accessConfigurationSelect
    });
  },

  updateRole(projectId, accessCodeRole) {
    return prisma.project.update({
      where: { id: projectId },
      data: { accessCodeRole },
      select: accessConfigurationSelect
    });
  },

  join(accessCode, userId, auditData) {
    return serializableTransaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { accessCode },
        select: joinProjectSelect
      });
      if (!project) return { invalidCode: true };

      const existing = await tx.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId } }
      });
      if (existing?.isActive) return { alreadyMember: true, project, membership: existing };
      if (existing) return { inactiveMembership: true, project, membership: existing };

      const membership = await tx.projectMembership.create({
        data: { projectId: project.id, userId, role: project.accessCodeRole }
      });
      if (auditData) {
        await auditRepository.create(
          { ...auditData, projectId: project.id, resourceId: String(membership.id) },
          tx
        );
      }
      return { project, membership };
    });
  }
};
