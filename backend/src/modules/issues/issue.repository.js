// Repository de Issues importadas do GitHub.
import { prisma } from '../../database/prismaClient.js';

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
  async findGithubIdsByProjectId(projectId) {
    const issues = await prisma.issue.findMany({
      where: { projectId },
      select: { githubId: true }
    });

    return issues.map((issue) => issue.githubId);
  },

  async upsertMany(data) {
    if (data.length === 0) {
      return { created: 0, updated: 0 };
    }

    const existingGithubIds = new Set(await this.findGithubIdsByProjectId(data[0].projectId));
    let created = 0;
    let updated = 0;

    for (const issue of data) {
      const isExisting = existingGithubIds.has(issue.githubId);

      await prisma.issue.upsert({
        where: {
          projectId_githubId: {
            projectId: issue.projectId,
            githubId: issue.githubId
          }
        },
        update: buildIssueUpdate(issue),
        create: issue
      });

      if (isExisting) {
        updated += 1;
      } else {
        created += 1;
        existingGithubIds.add(issue.githubId);
      }
    }

    return { created, updated };
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
