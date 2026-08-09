// Repository de marcos. Todo acesso ao banco passa pelo Prisma parametrizado.
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const milestoneSelect = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  dueDate: true,
  status: true,
  createdAt: true,
  updatedAt: true
};

export const milestoneRepository = {
  findById(id) {
    return prisma.milestone.findUnique({ where: { id }, select: milestoneSelect });
  },

  // Filtro por projeto no where, nao apenas por id: defesa em profundidade contra IDOR.
  findByIdInProject(id, projectId) {
    return prisma.milestone.findFirst({ where: { id, projectId }, select: milestoneSelect });
  },

  findByProject(projectId, filters = {}) {
    return prisma.milestone.findMany({
      where: { projectId, ...(filters.status ? { status: filters.status } : {}) },
      select: milestoneSelect,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
    });
  },

  async create(projectId, data, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.create({
        data: { ...data, projectId },
        select: milestoneSelect
      });
      if (auditEvent) {
        await auditRepository.create({ ...auditEvent, resourceId: String(milestone.id) }, tx);
      }
      return milestone;
    });
  },

  async update(id, data, auditEvent) {
    return prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.update({ where: { id }, data, select: milestoneSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return milestone;
    });
  },

  async delete(id, auditEvent) {
    return prisma.$transaction(async (tx) => {
      await tx.milestone.delete({ where: { id } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
    });
  }
};
