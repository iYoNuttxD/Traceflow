// Repository do modulo de requisitos. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';

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

  async findTasksByRequirement(requirementId) {
    return prisma.task.findMany({
      where: { requirementId },
      select: linkedTaskSelect,
      orderBy: { createdAt: 'desc' }
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
