// Repository de Pull Requests importados do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';

function buildPullRequestUpdate(data) {
  return {
    number: data.number,
    title: data.title,
    description: data.description,
    state: data.state,
    authorUsername: data.authorUsername,
    sourceBranch: data.sourceBranch,
    targetBranch: data.targetBranch,
    githubUrl: data.githubUrl,
    createdAtGithub: data.createdAtGithub,
    updatedAtGithub: data.updatedAtGithub,
    closedAtGithub: data.closedAtGithub,
    mergedAtGithub: data.mergedAtGithub
  };
}

export const pullRequestRepository = {
  async findByProjectIdAndGithubId(projectId, githubId) {
    return prisma.pullRequest.findUnique({
      where: {
        projectId_githubId: {
          projectId,
          githubId
        }
      }
    });
  },

  async findGithubIdsByProjectId(projectId, githubIds) {
    const pullRequests = await prisma.pullRequest.findMany({
      where: {
        projectId,
        ...(Array.isArray(githubIds) ? { githubId: { in: githubIds } } : {})
      },
      select: { githubId: true }
    });

    return pullRequests.map((pullRequest) => pullRequest.githubId);
  },

  async upsertMany(data) {
    if (data.length === 0) {
      return { created: 0, updated: 0 };
    }

    const projectId = data[0].projectId;
    return withActiveProjectWrite(projectId, async (tx) => {
      const existing = await tx.pullRequest.findMany({
        where: { projectId, githubId: { in: data.map(({ githubId }) => githubId) } },
        select: { githubId: true }
      });
      const existingGithubIds = new Set(existing.map(({ githubId }) => githubId));
      for (const pullRequest of data) {
        await tx.pullRequest.upsert({
          where: { projectId_githubId: { projectId, githubId: pullRequest.githubId } },
          update: buildPullRequestUpdate(pullRequest),
          create: pullRequest
        });
      }
      const updated = data.filter(({ githubId }) => existingGithubIds.has(githubId)).length;
      return { created: data.length - updated, updated };
    });
  },

  async appendLifecycleEvents(projectId, events, completedAt = new Date()) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const numbers = [...new Set(events.map(({ number }) => number))];
        const byNumber = new Map();
        for (let offset = 0; offset < numbers.length; offset += 500) {
          const pullRequests = await tx.pullRequest.findMany({
            where: { projectId, number: { in: numbers.slice(offset, offset + 500) } },
            select: { id: true, number: true }
          });
          pullRequests.forEach((pullRequest) => byNumber.set(pullRequest.number, pullRequest.id));
        }
        if (byNumber.size !== numbers.length) {
          throw new Error('Evento de PR sem Pull Request correspondente no projeto.');
        }
        let count = 0;
        for (let offset = 0; offset < events.length; offset += 500) {
          const batch = events.slice(offset, offset + 500);
          const result = await tx.pullRequestLifecycleEvent.createMany({
            data: batch.map(({ number, ...event }) => ({
              ...event,
              projectId,
              pullRequestId: byNumber.get(number)
            })),
            skipDuplicates: true
          });
          count += result.count;
        }
        await tx.projectGitHubIntegration.updateMany({
          where: { projectId },
          data: { pullRequestLifecycleSyncedAt: completedAt }
        });
        await tx.projectGitHubIntegration.updateMany({
          where: { projectId, pullRequestLifecycleCoverageFrom: null },
          data: { pullRequestLifecycleCoverageFrom: completedAt }
        });
        return { count };
      },
      { timeout: 120000 }
    );
  },

  async listByProjectId(projectId, filters = {}) {
    const numericSearch = String(filters.search || '').replace(/\D/g, '');
    const pullRequestNumber = Number(numericSearch);

    return prisma.pullRequest.findMany({
      where: {
        projectId,
        AND: [
          ...(filters.branch
            ? [{ OR: [{ sourceBranch: filters.branch }, { targetBranch: filters.branch }] }]
            : []),
          ...(filters.search
            ? [
                {
                  OR: [
                    { title: { contains: filters.search } },
                    { authorUsername: { contains: filters.search } },
                    ...(numericSearch && Number.isInteger(pullRequestNumber)
                      ? [{ number: pullRequestNumber }]
                      : [])
                  ]
                }
              ]
            : [])
        ]
      },
      orderBy: [{ updatedAtGithub: 'desc' }, { createdAtGithub: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
