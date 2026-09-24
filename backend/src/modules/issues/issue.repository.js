// Repository de Issues importadas do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';

function buildIssueUpdate(data) {
  return {
    number: data.number,
    title: data.title,
    description: data.description,
    state: data.state,
    authorUsername: data.authorUsername,
    assigneeUsername: data.assigneeUsername,
    labels: data.labels,
    milestone: data.milestone,
    githubUrl: data.githubUrl,
    createdAtGithub: data.createdAtGithub,
    updatedAtGithub: data.updatedAtGithub,
    closedAtGithub: data.closedAtGithub
  };
}

export const issueRepository = {
  async findGithubIdsByProjectId(projectId, githubIds) {
    const issues = await prisma.issue.findMany({
      where: {
        projectId,
        ...(Array.isArray(githubIds) ? { githubId: { in: githubIds } } : {})
      },
      select: { githubId: true }
    });

    return issues.map((issue) => issue.githubId);
  },

  async upsertMany(data) {
    if (data.length === 0) {
      return { created: 0, updated: 0 };
    }

    const projectId = data[0].projectId;
    return withActiveProjectWrite(projectId, async (tx) => {
      const existing = await tx.issue.findMany({
        where: { projectId, githubId: { in: data.map(({ githubId }) => githubId) } },
        select: { githubId: true }
      });
      const existingGithubIds = new Set(existing.map(({ githubId }) => githubId));
      for (const issue of data) {
        await tx.issue.upsert({
          where: { projectId_githubId: { projectId, githubId: issue.githubId } },
          update: buildIssueUpdate(issue),
          create: issue
        });
      }
      const updated = data.filter(({ githubId }) => existingGithubIds.has(githubId)).length;
      return { created: data.length - updated, updated };
    });
  },

  async listByProjectId(projectId, filters = {}) {
    const search = typeof filters.search === 'string' ? filters.search.trim() : '';
    const numericSearch = search.replace(/\D/g, '');
    const issueNumber = numericSearch ? Number(numericSearch) : null;

    return prisma.issue.findMany({
      where: {
        projectId,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { authorUsername: { contains: search } },
                ...(Number.isInteger(issueNumber) && issueNumber > 0
                  ? [{ number: issueNumber }]
                  : [])
              ]
            }
          : {})
      },
      orderBy: [{ updatedAtGithub: 'desc' }, { createdAtGithub: 'desc' }, { createdAt: 'desc' }]
    });
  }
};
