// Repository do modulo de requisitos. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

const linkedTaskSelect = {
  id: true,
  title: true,
  status: true,
  responsible: true,
  deadline: true,
  description: true
};

const requirementInclude = {
  project: {
    select: {
      id: true,
      name: true
    }
  },
  tasks: {
    select: linkedTaskSelect,
    orderBy: { createdAt: 'desc' }
  }
};

export const requirementRepository = {
  async findProjectById(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId }
    });
  },

  async createRequirement(projectId, data) {
    return prisma.requirement.create({
      data: {
        ...data,
        projectId
      },
      include: requirementInclude
    });
  },

  async findRequirementsByProject(projectId, filters = {}) {
    const search = typeof filters.search === 'string' ? filters.search.trim() : '';

    return prisma.requirement.findMany({
      where: {
        projectId,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { type: { contains: search } },
                { status: { contains: search } }
              ]
            }
          : {})
      },
      include: requirementInclude,
      orderBy: { createdAt: 'desc' }
    });
  },

  async findRequirementById(id) {
    return prisma.requirement.findUnique({
      where: { id },
      include: requirementInclude
    });
  },

  async updateRequirement(id, data) {
    return prisma.requirement.update({
      where: { id },
      data,
      include: requirementInclude
    });
  },

  async updateRequirementStatus(id, status) {
    return prisma.requirement.update({
      where: { id },
      data: { status },
      include: requirementInclude
    });
  },

  async deleteRequirement(id) {
    return prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { requirementId: id },
        data: { requirementId: null }
      });

      return tx.requirement.delete({
        where: { id }
      });
    });
  },

  async findTasksByRequirement(requirementId) {
    return prisma.task.findMany({
      where: { requirementId },
      select: linkedTaskSelect,
      orderBy: { createdAt: 'desc' }
    });
  },

  async findTasksByIds(taskIds) {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, projectId: true, requirementId: true, status: true }
    });
  },

  async findRequirementsByIds(requirementIds) {
    return prisma.requirement.findMany({
      where: { id: { in: requirementIds } },
      select: {
        id: true,
        status: true,
        tasks: { select: { id: true, status: true } }
      }
    });
  },

  async replaceRequirementTasks({
    requirementId,
    taskIds,
    status,
    relatedStatusUpdates,
    auditEvents
  }) {
    return prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { requirementId, ...(taskIds.length ? { id: { notIn: taskIds } } : {}) },
        data: { requirementId: null }
      });
      if (taskIds.length) {
        await tx.task.updateMany({
          where: { id: { in: taskIds } },
          data: { requirementId }
        });
      }
      if (status) {
        await tx.requirement.update({ where: { id: requirementId }, data: { status } });
      }
      for (const update of relatedStatusUpdates) {
        await tx.requirement.update({ where: { id: update.id }, data: { status: update.status } });
      }
      if (auditEvents.length) await auditRepository.createMany(auditEvents, tx);
      return tx.requirement.findUnique({
        where: { id: requirementId },
        include: requirementInclude
      });
    });
  },

  async countRequirementsByProject(projectId) {
    return prisma.requirement.count({
      where: { projectId }
    });
  },

  async countRequirementsWithTasksByProject(projectId) {
    return prisma.requirement.count({
      where: {
        projectId,
        tasks: {
          some: {}
        }
      }
    });
  }
};
