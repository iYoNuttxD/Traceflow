import { buildRequirementMetrics, uniqueById } from './traceability.calculator.js';

export function formatMatrixRow(requirement) {
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
  if (!pullRequest) return null;

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

export function formatRequirementDetail(requirement) {
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
