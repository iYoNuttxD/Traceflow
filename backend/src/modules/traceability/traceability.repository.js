// Repository canônico de rastreabilidade. Nenhum model genérico de vínculo é utilizado.
import { prisma } from '../../database/prismaClient.js';

const requirementFields = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  createdAt: true
};

const commitFields = {
  id: true,
  hash: true,
  message: true,
  authorName: true,
  authorUsername: true,
  date: true,
  branch: true,
  githubUrl: true
};

const issueFields = {
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
};

const pullRequestFields = {
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
};

const taskFields = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  responsible: true,
  responsibleUserId: true,
  responsibleUser: { select: { id: true, name: true } },
  deadline: true,
  estimatedEffort: true,
  actualEffort: true
};

const taskSummarySelect = {
  id: true,
  status: true,
  pullRequestId: true,
  _count: { select: { commitLinks: true, issueLinks: true } }
};

const taskGraphSelect = {
  ...taskFields,
  pullRequest: { select: pullRequestFields },
  commitLinks: {
    select: { commit: { select: commitFields } },
    orderBy: { createdAt: 'desc' },
    take: 100
  },
  issueLinks: {
    select: { issue: { select: issueFields } },
    orderBy: { createdAt: 'desc' },
    take: 100
  }
};

export const traceabilityRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findRequirementsSummaryByProject(projectId) {
    return prisma.requirement.findMany({
      where: { projectId },
      select: { ...requirementFields, tasks: { select: taskSummarySelect } },
      orderBy: { createdAt: 'desc' }
    });
  },

  async findRequirementsMatrixPage(projectId, { skip, take }) {
    const [total, requirements] = await prisma.$transaction([
      prisma.requirement.count({ where: { projectId } }),
      prisma.requirement.findMany({
        where: { projectId },
        select: { ...requirementFields, tasks: { select: taskSummarySelect } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);
    return { total, requirements };
  },

  async findRequirementGraphPage(projectId, requirementId, { skip, take }) {
    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, projectId },
      select: requirementFields
    });
    if (!requirement) return null;
    const [total, tasks] = await prisma.$transaction([
      prisma.task.count({ where: { projectId, requirementId } }),
      prisma.task.findMany({
        where: { projectId, requirementId },
        select: taskGraphSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);
    return { ...requirement, projectId, tasks, total };
  },

  async findTaskGraphPage(projectId, taskId, { skip, take }) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: {
        ...taskFields,
        pullRequest: { select: pullRequestFields },
        requirement: { select: requirementFields },
        _count: { select: { commitLinks: true, issueLinks: true } }
      }
    });
    if (!task) return null;

    const pullRequestCount = task.pullRequest ? 1 : 0;
    const commitsCount = task._count.commitLinks;
    const issuesCount = task._count.issueLinks;
    let remaining = take;
    const includePullRequest = pullRequestCount === 1 && skip === 0 && remaining > 0;
    if (includePullRequest) remaining -= 1;

    const commitSkip = Math.max(skip - pullRequestCount, 0);
    const commitTake = Math.max(Math.min(remaining, commitsCount - commitSkip), 0);
    remaining -= commitTake;
    const issueSkip = Math.max(skip - pullRequestCount - commitsCount, 0);
    const issueTake = Math.max(Math.min(remaining, issuesCount - issueSkip), 0);

    const [commitLinks, issueLinks] = await Promise.all([
      commitTake === 0
        ? []
        : prisma.taskCommit.findMany({
            where: { taskId, task: { projectId } },
            select: { commit: { select: commitFields } },
            orderBy: { createdAt: 'desc' },
            skip: commitSkip,
            take: commitTake
          }),
      issueTake === 0
        ? []
        : prisma.taskIssue.findMany({
            where: { taskId, task: { projectId } },
            select: { issue: { select: issueFields } },
            orderBy: { createdAt: 'desc' },
            skip: issueSkip,
            take: issueTake
          })
    ]);

    return {
      ...task,
      pullRequest: includePullRequest ? task.pullRequest : null,
      commitLinks,
      issueLinks,
      hasTechnicalEvidence: pullRequestCount > 0 || commitsCount > 0,
      total: pullRequestCount + commitsCount + issuesCount
    };
  },

  async findArtifactGraphPage(projectId, artifactType, artifactId, { skip, take }) {
    if (artifactType === 'commit') {
      const artifact = await prisma.commit.findFirst({ where: { id: artifactId, projectId }, select: commitFields });
      if (!artifact) return null;
      const where = { commitId: artifactId, task: { projectId } };
      const [total, links] = await prisma.$transaction([
        prisma.taskCommit.count({ where }),
        prisma.taskCommit.findMany({
          where,
          select: { task: { select: { ...taskFields, requirement: { select: requirementFields } } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take
        })
      ]);
      return { artifact, tasks: links.map((link) => link.task), total };
    }
    if (artifactType === 'issue') {
      const artifact = await prisma.issue.findFirst({ where: { id: artifactId, projectId }, select: issueFields });
      if (!artifact) return null;
      const where = { issueId: artifactId, task: { projectId } };
      const [total, links] = await prisma.$transaction([
        prisma.taskIssue.count({ where }),
        prisma.taskIssue.findMany({
          where,
          select: { task: { select: { ...taskFields, requirement: { select: requirementFields } } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take
        })
      ]);
      return { artifact, tasks: links.map((link) => link.task), total };
    }
    const artifact = await prisma.pullRequest.findFirst({ where: { id: artifactId, projectId }, select: pullRequestFields });
    if (!artifact) return null;
    const [total, tasks] = await prisma.$transaction([
      prisma.task.count({ where: { projectId, pullRequestId: artifactId } }),
      prisma.task.findMany({
        where: { projectId, pullRequestId: artifactId },
        select: { ...taskFields, requirement: { select: requirementFields } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      })
    ]);
    return { artifact, tasks, total };
  },

  countTasksByProject(projectId) {
    return prisma.task.count({ where: { projectId } });
  },
  countTasksWithPullRequest(projectId) {
    return prisma.task.count({ where: { projectId, pullRequestId: { not: null } } });
  },
  countTasksWithCommit(projectId) {
    return prisma.task.count({ where: { projectId, commitLinks: { some: {} } } });
  },
  countTasksWithIssue(projectId) {
    return prisma.task.count({ where: { projectId, issueLinks: { some: {} } } });
  },
  countRequirementsByProject(projectId) {
    return prisma.requirement.count({ where: { projectId } });
  },
  countRequirementsWithTasks(projectId) {
    return prisma.requirement.count({ where: { projectId, tasks: { some: {} } } });
  }
};
