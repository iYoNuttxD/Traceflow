import { prisma } from '../../database/prismaClient.js';

export const authorizationRepository = {
  membership(projectId, userId) {
    return prisma.projectMembership.findFirst({ where: { projectId, userId, isActive: true } });
  },
  projectForRequirement(id) {
    return prisma.requirement.findUnique({ where: { id }, select: { projectId: true } });
  },
  projectForTask(id) {
    return prisma.task.findUnique({ where: { id }, select: { projectId: true } });
  },
  projectForSprint(id) {
    return prisma.sprint.findUnique({ where: { id }, select: { projectId: true } });
  },
  projectForMilestone(id) {
    return prisma.milestone.findUnique({ where: { id }, select: { projectId: true } });
  }
};
