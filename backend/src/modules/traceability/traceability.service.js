// Service central de rastreabilidade entre requisitos, tarefas e artefatos GitHub.
import { traceabilityRepository } from './traceability.repository.js';

class TraceabilityServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TraceabilityServiceError';
    this.statusCode = statusCode;
  }
}

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new TraceabilityServiceError(`ID ${entityName} inválido.`, 400);
  }

  return parsedValue;
}

function parseProjectId(projectId) {
  return parsePositiveInteger(projectId, 'do projeto');
}

function parseRequirementId(requirementId) {
  return parsePositiveInteger(requirementId, 'do requisito');
}

async function ensureProjectExists(projectId) {
  const project = await traceabilityRepository.findProjectById(projectId);

  if (!project) {
    throw new TraceabilityServiceError('Projeto não encontrado.', 404);
  }

  return project;
}

function calculateProgress(tasks) {
  if (tasks.length === 0) {
    return 0;
  }

  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;

  return Number(((completedTasksCount / tasks.length) * 100).toFixed(2));
}

function uniqueById(items) {
  const uniqueItems = new Map();

  for (const item of items) {
    if (item?.id) {
      uniqueItems.set(item.id, item);
    }
  }

  return [...uniqueItems.values()];
}

function extractIssues(tasks) {
  return uniqueById(
    tasks.flatMap((task) => (task.issueLinks || []).map((link) => link.issue).filter(Boolean))
  );
}

function extractCommits(tasks) {
  return uniqueById(
    tasks.flatMap((task) => (task.commitLinks || []).map((link) => link.commit).filter(Boolean))
  );
}

function extractPullRequests(tasks) {
  return uniqueById(tasks.map((task) => task.pullRequest).filter(Boolean));
}

function getImplementationStatus(requirement, tasks, hasTechnicalEvidence) {
  if (requirement.status === 'CONCLUIDO') {
    return 'CONCLUIDO';
  }

  if (tasks.length === 0) {
    return 'SEM_RASTREABILIDADE';
  }

  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;
  const allTasksCompleted = completedTasksCount === tasks.length;
  const hasInProgressTask = tasks.some((task) => task.status === 'EM_ANDAMENTO');

  if (allTasksCompleted && hasTechnicalEvidence) {
    return 'IMPLEMENTADO';
  }

  if (completedTasksCount > 0 || hasInProgressTask || hasTechnicalEvidence) {
    return 'EM_DESENVOLVIMENTO';
  }

  return 'PLANEJADO';
}

function buildRequirementMetrics(requirement) {
  const tasks = requirement.tasks || [];
  const issues = extractIssues(tasks);
  const commits = extractCommits(tasks);
  const pullRequests = extractPullRequests(tasks);
  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;
  const hasTechnicalEvidence = pullRequests.length > 0 || commits.length > 0;
  const progressPercentage = calculateProgress(tasks);
  const implementationStatus = getImplementationStatus(
    requirement,
    tasks,
    hasTechnicalEvidence
  );

  return {
    tasks,
    issues,
    commits,
    pullRequests,
    tasksCount: tasks.length,
    completedTasksCount,
    progressPercentage,
    issuesCount: issues.length,
    pullRequestsCount: pullRequests.length,
    commitsCount: commits.length,
    hasTechnicalEvidence,
    implementationStatus
  };
}

function formatMatrixRow(requirement) {
  const metrics = buildRequirementMetrics(requirement);

  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description,
    type: requirement.type,
    status: requirement.status,
    createdAt: requirement.createdAt,
    tasksCount: metrics.tasksCount,
    completedTasksCount: metrics.completedTasksCount,
    progressPercentage: metrics.progressPercentage,
    issuesCount: metrics.issuesCount,
    pullRequestsCount: metrics.pullRequestsCount,
    commitsCount: metrics.commitsCount,
    hasTechnicalEvidence: metrics.hasTechnicalEvidence,
    implementationStatus: metrics.implementationStatus
  };
}

function formatCommit(commit) {
  return {
    id: commit.id,
    hash: commit.hash,
    shortHash: commit.hash ? commit.hash.slice(0, 7) : null,
    message: commit.message,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    authorUsername: commit.authorUsername,
    date: commit.date,
    branch: commit.branch,
    githubUrl: commit.githubUrl
  };
}

function formatIssue(issue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    authorUsername: issue.authorUsername,
    assigneeUsername: issue.assigneeUsername,
    labels: issue.labels,
    githubUrl: issue.githubUrl,
    createdAtGithub: issue.createdAtGithub,
    updatedAtGithub: issue.updatedAtGithub,
    closedAtGithub: issue.closedAtGithub
  };
}

function formatPullRequest(pullRequest) {
  if (!pullRequest) {
    return null;
  }

  return {
    id: pullRequest.id,
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    authorUsername: pullRequest.authorUsername,
    sourceBranch: pullRequest.sourceBranch,
    targetBranch: pullRequest.targetBranch,
    githubUrl: pullRequest.githubUrl,
    createdAtGithub: pullRequest.createdAtGithub,
    updatedAtGithub: pullRequest.updatedAtGithub,
    closedAtGithub: pullRequest.closedAtGithub,
    mergedAtGithub: pullRequest.mergedAtGithub
  };
}

function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    responsible: task.responsible,
    deadline: task.deadline,
    pullRequest: formatPullRequest(task.pullRequest),
    issues: uniqueById((task.issueLinks || []).map((link) => link.issue).filter(Boolean)).map(
      formatIssue
    ),
    commits: uniqueById(
      (task.commitLinks || []).map((link) => link.commit).filter(Boolean)
    ).map(formatCommit)
  };
}

function formatRequirementDetail(requirement) {
  const metrics = buildRequirementMetrics(requirement);

  return {
    projectId: requirement.projectId,
    requirement: {
      id: requirement.id,
      title: requirement.title,
      description: requirement.description,
      type: requirement.type,
      status: requirement.status,
      createdAt: requirement.createdAt,
      progressPercentage: metrics.progressPercentage,
      implementationStatus: metrics.implementationStatus,
      hasTechnicalEvidence: metrics.hasTechnicalEvidence
    },
    tasks: metrics.tasks.map(formatTask)
  };
}

export const traceabilityService = {
  async getRequirementsMatrix(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const requirements =
      await traceabilityRepository.findRequirementsTraceabilityByProject(parsedProjectId);
    const rows = requirements.map(formatMatrixRow);
    const totalRequirements = rows.length;
    const requirementsWithTasks = rows.filter((row) => row.tasksCount > 0).length;
    const requirementsWithTechnicalEvidence = rows.filter(
      (row) => row.hasTechnicalEvidence
    ).length;
    const implementedRequirements = rows.filter((row) =>
      ['IMPLEMENTADO', 'CONCLUIDO'].includes(row.implementationStatus)
    ).length;
    const averageProgressPercentage =
      totalRequirements === 0
        ? 0
        : Number(
            (
              rows.reduce((sum, row) => sum + row.progressPercentage, 0) /
              totalRequirements
            ).toFixed(2)
          );

    return {
      projectId: parsedProjectId,
      summary: {
        totalRequirements,
        requirementsWithTasks,
        requirementsWithTechnicalEvidence,
        implementedRequirements,
        averageProgressPercentage
      },
      requirements: rows
    };
  },

  async getRequirementTraceability(projectId, requirementId) {
    const parsedProjectId = parseProjectId(projectId);
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureProjectExists(parsedProjectId);

    const requirement =
      await traceabilityRepository.findRequirementTraceabilityByProject(
        parsedProjectId,
        parsedRequirementId
      );

    if (!requirement) {
      throw new TraceabilityServiceError('Requisito não encontrado neste projeto.', 404);
    }

    return formatRequirementDetail({
      ...requirement,
      projectId: parsedProjectId
    });
  }
};
