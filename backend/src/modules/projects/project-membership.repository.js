import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const memberSelect = {
  id: true, projectId: true, userId: true, role: true, isActive: true,
  joinedAt: true, createdAt: true, updatedAt: true,
  user: { select: { id: true, name: true, email: true, isActive: true } }
};

export const projectMembershipRepository = {
  list(projectId) {
    return prisma.projectMembership.findMany({ where: { projectId }, select: memberSelect, orderBy: [{ isActive: 'desc' }, { joinedAt: 'asc' }] });
  },
  find(projectId, id) {
    return prisma.projectMembership.findFirst({ where: { id, projectId }, select: memberSelect });
  },
  async updateRoleSafely(projectId, id, role, auditData) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.projectMembership.findFirst({ where: { id, projectId } });
      if (!current) return null;
      if (current.isActive && current.role === 'OWNER' && role !== 'OWNER') {
        const owners = await tx.projectMembership.count({ where: { projectId, role: 'OWNER', isActive: true } });
        if (owners <= 1) return { lastOwner: true };
      }
      const updated = await tx.projectMembership.update({ where: { id }, data: { role }, select: memberSelect });
      if (auditData) await auditRepository.create({ ...auditData, metadataJson: { previousRole: current.role, newRole: role } }, tx);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
  async setActiveSafely(projectId, id, isActive, auditData) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.projectMembership.findFirst({ where: { id, projectId } });
      if (!current) return null;
      if (!isActive && current.isActive && current.role === 'OWNER') {
        const owners = await tx.projectMembership.count({ where: { projectId, role: 'OWNER', isActive: true } });
        if (owners <= 1) return { lastOwner: true };
      }
      const updated = await tx.projectMembership.update({ where: { id }, data: { isActive }, select: memberSelect });
      if (auditData) await auditRepository.create(auditData, tx);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
  findByUser(projectId, userId) {
    return prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId } }, select: memberSelect });
  },
  async transferOwnership(projectId, requesterId, targetId, auditData) {
    return prisma.$transaction(async (tx) => {
      const requester = await tx.projectMembership.findFirst({ where: { projectId, userId: requesterId, isActive: true, role: 'OWNER' } });
      const target = await tx.projectMembership.findFirst({ where: { id: targetId, projectId, isActive: true }, select: memberSelect });
      if (!requester || !target) return null;
      const updated = await tx.projectMembership.update({ where: { id: target.id }, data: { role: 'OWNER' }, select: memberSelect });
      if (auditData) await auditRepository.create(auditData, tx);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
};
