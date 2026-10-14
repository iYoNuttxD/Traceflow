import { prisma } from '../../database/prismaClient.js';

export const githubSchedulerRepository = {
  // Readiness must be checked before reserving work in a newly started process.
  checkSchema() {
    return prisma.gitHubSchedulerWorker.findFirst({ select: { id: true } });
  },
  async heartbeat(id, now) {
    await prisma.gitHubSchedulerWorker.upsert({
      where: { id },
      create: { id, heartbeatAt: now },
      update: { heartbeatAt: now }
    });
    // Only ephemeral liveness records, never sync history or project data.
    await prisma.gitHubSchedulerWorker.deleteMany({
      where: { heartbeatAt: { lt: new Date(now.getTime() - 86400000) } }
    });
  },
  remove(id) {
    return prisma.gitHubSchedulerWorker.deleteMany({ where: { id } });
  },
  latest() {
    return prisma.gitHubSchedulerWorker.findFirst({
      orderBy: { heartbeatAt: 'desc' },
      select: { heartbeatAt: true }
    });
  },
  schedule(projectId) {
    return prisma.projectGitHubIntegration.findUnique({
      where: { projectId },
      select: { nextSyncAt: true }
    });
  }
};
