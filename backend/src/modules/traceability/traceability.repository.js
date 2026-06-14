// Repository de rastreabilidade. Consolida vinculos existentes sem criar novos registros.
import { prisma } from '../../database/prismaClient.js';

const traceabilityRequirementSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  createdAt: true,
  tasks: {
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      responsible: true,
      deadline: true,
      pullRequest: {
        select: {
          id: true,
          number: true,
          title: true,
          state: true,
          authorUsername: true,
          sourceBranch: true,
          targetBranch: true,
          githubUrl: true,
          createdAtGithub: true,
          updatedAtGithub: true,
          closedAtGithub: true,
          mergedAtGithub: true
        }
      },
      issueLinks: {
        select: {
          issue: {
            select: {
              id: true,
              number: true,
              title: true,
              state: true,
              authorUsername: true,
              assigneeUsername: true,
              labels: true,
              githubUrl: true,
              createdAtGithub: true,
              updatedAtGithub: true,
              closedAtGithub: true
            }
          }
        }
      },
      commitLinks: {
        select: {
          commit: {
            select: {
              id: true,
              hash: true,
              message: true,
              authorName: true,
              authorEmail: true,
              authorUsername: true,
              date: true,
              branch: true,
              githubUrl: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  }
};

export const traceabilityRepository = {
  async findProjectById(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true
      }
    });
  },

  async findRequirementsTraceabilityByProject(projectId) {
    return prisma.requirement.findMany({
      where: { projectId },
      select: traceabilityRequirementSelect,
      orderBy: { createdAt: 'desc' }
    });
  },

  async findRequirementTraceabilityByProject(projectId, requirementId) {
    return prisma.requirement.findFirst({
      where: {
        id: requirementId,
        projectId
      },
      select: traceabilityRequirementSelect
    });
  }
};
