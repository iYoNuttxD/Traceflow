import { prisma } from '../../database/prismaClient.js';

const activeStatuses = ['QUEUED', 'RUNNING'];

export const githubSyncRunRepository = {
  create(projectId, requestedByUserId) {
    return prisma.gitHubSyncRun.create({
      data: {
        projectId,
        requestedByUserId,
        activeProjectId: projectId
      }
    });
  },

  findById(id) {
    return prisma.gitHubSyncRun.findUnique({ where: { id } });
  },

  findActive(projectId) {
    return prisma.gitHubSyncRun.findFirst({
      where: { projectId, activeProjectId: projectId, status: { in: activeStatuses } },
      orderBy: { createdAt: 'desc' }
    });
  },

  findLatest(projectId) {
    return prisma.gitHubSyncRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  },

  async claim(id, now = new Date()) {
    const claimed = await prisma.gitHubSyncRun.updateMany({
      where: { id, status: 'QUEUED', activeProjectId: { not: null } },
      data: {
        status: 'RUNNING',
        step: 'REPOSITORY',
        startedAt: now,
        heartbeatAt: now
      }
    });
    return claimed.count === 1;
  },

  updateProgress(id, data, now = new Date()) {
    return prisma.gitHubSyncRun.update({
      where: { id },
      data: { ...data, heartbeatAt: now }
    });
  },

  succeed(id, summary, finishedAt, durationMs) {
    return prisma.gitHubSyncRun.update({
      where: { id },
      data: {
        status: 'SUCCEEDED',
        step: 'COMPLETED',
        activeProjectId: null,
        currentBranch: null,
        heartbeatAt: finishedAt,
        finishedAt,
        durationMs,
        branchCount: summary.branches?.found ?? 0,
        processedBranches: summary.branches?.active ?? 0,
        commitsFound: summary.commits?.found ?? 0,
        commitsObserved: summary.commits?.foundAcrossBranches ?? 0,
        commitsCreated: summary.commits?.created ?? 0,
        commitLinksCreated: summary.commits?.linksCreated ?? 0,
        pullRequestsFound: summary.pullRequests?.found ?? 0,
        pullRequestsCreated: summary.pullRequests?.created ?? 0,
        pullRequestsUpdated: summary.pullRequests?.updated ?? 0,
        issuesFound: summary.issues?.found ?? 0,
        issuesCreated: summary.issues?.created ?? 0,
        issuesUpdated: summary.issues?.updated ?? 0,
        errorCode: null,
        errorMessage: null
      }
    });
  },

  fail(id, { errorCode, errorMessage, finishedAt, durationMs }) {
    return prisma.gitHubSyncRun.update({
      where: { id },
      data: {
        status: 'FAILED',
        activeProjectId: null,
        heartbeatAt: finishedAt,
        finishedAt,
        durationMs,
        errorCode,
        errorMessage
      }
    });
  },

  expireIfStillStale(id, projectId, cutoff, now = new Date()) {
    return prisma.gitHubSyncRun.updateMany({
      where: {
        id,
        projectId,
        activeProjectId: projectId,
        status: { in: activeStatuses },
        OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null, updatedAt: { lt: cutoff } }]
      },
      data: {
        status: 'FAILED',
        activeProjectId: null,
        heartbeatAt: now,
        finishedAt: now,
        errorCode: 'GITHUB_SYNC_STALE',
        errorMessage: 'A execução foi interrompida antes da conclusão.'
      }
    });
  },

  isActiveConflict(error) {
    return error?.code === 'P2002';
  }
};
