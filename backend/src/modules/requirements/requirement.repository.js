// Repository do modulo de requisitos. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';

const requirementInclude = {
  project: {
    select: {
      id: true,
      name: true
    }
  },
  tasks: {
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
      }
    });
  },

  async findRequirementsByProject(projectId) {
    return prisma.requirement.findMany({
      where: { projectId },
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
      data
    });
  },

  async updateRequirementStatus(id, status) {
    return prisma.requirement.update({
      where: { id },
      data: { status }
    });
  },

  async findTasksByRequirement(requirementId) {
    return prisma.task.findMany({
      where: { requirementId },
      orderBy: { createdAt: 'desc' }
    });
  },

  async findTaskById(id) {
    return prisma.task.findUnique({ where: { id } });
  },

  async findTaskWithRequirement(id) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        requirement: {
          select: {
            id: true,
            projectId: true,
            title: true,
            description: true,
            type: true,
            status: true
          }
        }
      }
    });
  },

  async linkTaskToRequirement(taskId, requirementId) {
    return prisma.task.update({
      where: { id: taskId },
      data: { requirementId }
    });
  },

  async unlinkTaskFromRequirement(taskId) {
    return prisma.task.update({
      where: { id: taskId },
      data: { requirementId: null }
    });
  },

  async findRequirementsWithTasksByProject(projectId) {
    return prisma.requirement.findMany({
      where: { projectId },
      include: {
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            responsible: true
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
};
