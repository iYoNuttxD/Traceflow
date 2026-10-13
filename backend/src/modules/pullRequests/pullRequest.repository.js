// Repository de Pull Requests importados do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { SYNC_WRITE, withActiveProjectWrite } from '../projects/active-project-write.js';
import { githubEventRepository } from '../notifications/github-event.repository.js';

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

  async upsertMany(data, { detectedAt } = {}) {
    if (data.length === 0) {
      return { created: 0, updated: 0, transitions: 0, linkedTasks: 0, anomalies: 0 };
    }

    const projectId = data[0].projectId;
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const existing = await tx.pullRequest.findMany({
          where: { projectId, githubId: { in: data.map(({ githubId }) => githubId) } },
          select: {
            id: true,
            githubId: true,
            state: true,
            closedAtGithub: true,
            mergedAtGithub: true
          }
        });
        const previous = new Map(existing.map((row) => [row.githubId, row]));
        for (const pullRequest of data) {
          await tx.pullRequest.upsert({
            where: { projectId_githubId: { projectId, githubId: pullRequest.githubId } },
            update: buildPullRequestUpdate(pullRequest),
            create: pullRequest
          });
        }
        const updated = data.filter(({ githubId }) => previous.has(githubId)).length;
        const recorded = await githubEventRepository.recordTransitions(tx, {
          projectId,
          kind: 'PULL_REQUEST',
          previous,
          incoming: data,
          detectedAt: detectedAt ?? new Date()
        });
        return { created: data.length - updated, updated, ...recorded };
      },
      SYNC_WRITE
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
