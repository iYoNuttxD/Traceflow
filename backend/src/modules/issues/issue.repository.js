// Repository de Issues importadas do GitHub.
import { prisma } from '../../database/prismaClient.js';
import { withActiveProjectWrite } from '../projects/active-project-write.js';
import { githubEventRepository } from '../notifications/github-event.repository.js';

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

  async upsertMany(data, { detectedAt } = {}) {
    if (data.length === 0) {
      return { created: 0, updated: 0, transitions: 0, linkedTasks: 0, anomalies: 0 };
    }

    const projectId = data[0].projectId;
    return withActiveProjectWrite(projectId, async (tx) => {
      const existing = await tx.issue.findMany({
        where: { projectId, githubId: { in: data.map(({ githubId }) => githubId) } },
        select: { id: true, githubId: true, state: true, closedAtGithub: true }
      });
      const previous = new Map(existing.map((row) => [row.githubId, row]));
      for (const issue of data) {
        await tx.issue.upsert({
          where: { projectId_githubId: { projectId, githubId: issue.githubId } },
          update: buildIssueUpdate(issue),
          create: issue
        });
      }
      const updated = data.filter(({ githubId }) => previous.has(githubId)).length;
      const recorded = await githubEventRepository.recordTransitions(tx, {
        projectId,
        kind: 'ISSUE',
        previous,
        incoming: data,
        detectedAt: detectedAt ?? new Date()
      });
      return { created: data.length - updated, updated, ...recorded };
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
