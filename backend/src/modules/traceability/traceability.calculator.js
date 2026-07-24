export function calculateProgress(tasks) {
  if (tasks.length === 0) {
    return 0;
  }

  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;
  return Number(((completedTasksCount / tasks.length) * 100).toFixed(2));
}

export function uniqueById(items) {
  const uniqueItems = new Map();

  for (const item of items) {
    if (item?.id) uniqueItems.set(item.id, item);
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

export function getImplementationStatus(requirement, tasks, hasTechnicalEvidence) {
  if (requirement.status === 'CONCLUIDO') return 'CONCLUIDO';
  if (tasks.length === 0) return 'SEM_RASTREABILIDADE';

  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;
  const allTasksCompleted = completedTasksCount === tasks.length;
  const hasInProgressTask = tasks.some((task) => task.status === 'EM_ANDAMENTO');

  if (allTasksCompleted && hasTechnicalEvidence) return 'IMPLEMENTADO';
  if (completedTasksCount > 0 || hasInProgressTask || hasTechnicalEvidence) {
    return 'EM_DESENVOLVIMENTO';
  }

  return 'PLANEJADO';
}

export function buildRequirementMetrics(requirement) {
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
