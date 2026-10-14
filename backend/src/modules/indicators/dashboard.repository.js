import { prisma } from '../../database/prismaClient.js';

export const dashboardRepository = {
  project(projectId) {
    return prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, name: true, githubIntegration: { select: { id: true } } }
    });
  },
  sprint(projectId, sprintId) {
    return prisma.sprint.findFirst({
      where: { id: sprintId, projectId, deletedAt: null },
      select: { id: true, name: true, status: true }
    });
  },
  responsible(projectId, userId) {
    return prisma.projectMembership.findFirst({
      where: { projectId, userId },
      select: { user: { select: { id: true, name: true, anonymizedAt: true } } }
    });
  }
};
