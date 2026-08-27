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

async function withMilestoneLocks(projectId, milestoneId, run) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    if (milestoneId) {
      await tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
    }

    const milestone = milestoneId
      ? await tx.milestone.findUnique({ where: { id: milestoneId }, select: milestoneSelect })
      : null;
    const sprintCount = milestoneId ? await tx.sprint.count({ where: { milestoneId } }) : 0;

    return run(tx, { milestone, sprintCount });
  });
}

const milestoneMutations = {
  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, null, async (tx, retrato) => {
      await validate(retrato);
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

  async updateWithinProjectLock(id, projectId, data, auditEvent, validate) {
    return withMilestoneLocks(projectId, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      await validate(retrato);
      const milestone = await tx.milestone.update({ where: { id }, data, select: milestoneSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return milestone;
    });
  },

  async deleteWithinProjectLock(id, projectId, auditEvent, validate) {
    return withMilestoneLocks(projectId, id, async (tx, retrato) => {
      if (!retrato.milestone) return null;
      await validate(retrato);
      await tx.milestone.delete({ where: { id } });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { id };
    });
  }
};

export const milestoneRepository = {
  findById(id) {
    return prisma.milestone.findUnique({ where: { id }, select: milestoneSelect });
  },

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

  ...milestoneMutations
};
