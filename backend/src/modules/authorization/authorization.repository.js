import { prisma } from '../../database/prismaClient.js';

export const authorizationRepository = {
  projectExists(projectId) { return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }); },
  membership(projectId, userId) {
    return prisma.projectMembership.findFirst({ where: { projectId, userId, isActive: true } });
  },
  projectForRequirement(id) { return prisma.requirement.findUnique({ where: { id }, select: { projectId: true } }); },
  projectForTask(id) { return prisma.task.findUnique({ where: { id }, select: { projectId: true } }); },
  projectForArtifact(id) { return prisma.githubArtifact.findUnique({ where: { id }, select: { projectId: true } }); },
  projectForTraceLink(id) { return prisma.traceLink.findUnique({ where: { id }, select: { projectId: true } }); }
};
