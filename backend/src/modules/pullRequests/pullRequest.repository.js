// Repository de Pull Requests importados do GitHub.
// TODO: Expandir consultas quando PRs forem vinculados a tarefas e commits.
import { prisma } from '../../database/prismaClient.js';

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

  async findGithubIdsByProjectId(projectId) {
    const pullRequests = await prisma.pullRequest.findMany({
      where: { projectId },
      select: { githubId: true }
    });

    return pullRequests.map((pullRequest) => pullRequest.githubId);
  },

  async upsertMany(data) {
    if (data.length === 0) {
      return { created: 0, updated: 0 };
    }

    const existingGithubIds = new Set(await this.findGithubIdsByProjectId(data[0].projectId));
    let created = 0;
    let updated = 0;

    for (const pullRequest of data) {
      const isExisting = existingGithubIds.has(pullRequest.githubId);

      await prisma.pullRequest.upsert({
        where: {
          projectId_githubId: {
            projectId: pullRequest.projectId,
            githubId: pullRequest.githubId
          }
        },
        update: buildPullRequestUpdate(pullRequest),
        create: pullRequest
      });

      if (isExisting) {
        updated += 1;
      } else {
        created += 1;
        existingGithubIds.add(pullRequest.githubId);
      }
    }

    return { created, updated };
  },

  async listByProjectId(projectId) {
    return prisma.pullRequest.findMany({
      where: { projectId },
      orderBy: [{ updatedAtGithub: 'desc' }, { createdAtGithub: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
