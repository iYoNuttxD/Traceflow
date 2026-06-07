// Repository de artefatos GitHub importados para o RF06.
import { prisma } from '../../database/prismaClient.js';

function buildDateWhere(fieldName, dateFilter) {
  if (!dateFilter) {
    return {};
  }

  return {
    [fieldName]: dateFilter
  };
}

export const artifactRepository = {
  async findProjectById(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true
      }
    });
  },

  async listCommits(projectId, dateFilter) {
    return prisma.commit.findMany({
      where: {
        projectId,
        ...buildDateWhere('date', dateFilter)
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    });
  },

  async listPullRequests(projectId, dateFilter) {
    return prisma.pullRequest.findMany({
      where: {
        projectId,
        ...buildDateWhere('createdAtGithub', dateFilter)
      },
      orderBy: [{ createdAtGithub: 'desc' }, { id: 'desc' }]
    });
  },

  async listIssues(projectId, dateFilter) {
    return prisma.issue.findMany({
      where: {
        projectId,
        ...buildDateWhere('createdAtGithub', dateFilter)
      },
      orderBy: [{ createdAtGithub: 'desc' }, { id: 'desc' }]
    });
  }
};
