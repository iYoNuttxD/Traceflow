export function buildMetric(numerator, denominator) {
  const hasData = denominator > 0;
  return {
    numerator,
    denominator,
    percentage: hasData ? Number(((numerator / denominator) * 100).toFixed(2)) : null,
    hasData
  };
}

export function calculateProgress(tasks) {
  const completedTasksCount = tasks.filter((task) => task.status === 'CONCLUIDO').length;
  return buildMetric(completedTasksCount, tasks.length);
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

function countLinked(tasks, relation) {
  return tasks.reduce((total, task) => {
    const count = task?._count?.[relation];
    if (Number.isInteger(count)) return total + count;
    return total + (task?.[relation] || []).length;
  }, 0);
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
  const issuesCount = countLinked(tasks, 'issueLinks');
  const commitsCount = countLinked(tasks, 'commitLinks');
  const pullRequestsCount = tasks.filter((task) => task.pullRequest || task.pullRequestId).length;
  const hasTechnicalEvidence = pullRequestsCount > 0 || commitsCount > 0;
  const progress = calculateProgress(tasks);
  const implementationStatus = getImplementationStatus(requirement, tasks, hasTechnicalEvidence);

  return {
    tasks,
    issues,
    commits,
    pullRequests,
    tasksCount: tasks.length,
    completedTasksCount,
    progress,
    // Compatibilidade com a matriz histórica: ausência de denominador continua exibida como 0.
    progressPercentage: progress.percentage ?? 0,
    issuesCount: Math.max(issues.length, issuesCount),
    pullRequestsCount: Math.max(pullRequests.length, pullRequestsCount),
    commitsCount: Math.max(commits.length, commitsCount),
    hasTechnicalEvidence,
    implementationStatus
  };
}

export function buildCoverageMetric(linked, total) {
  return buildMetric(linked, total);
}

export function buildMatrixSummary(rows) {
  const totalRequirements = rows.length;
  const requirementsWithTasks = rows.filter((row) => row.tasksCount > 0).length;
  const requirementsWithTechnicalEvidence = rows.filter((row) => row.hasTechnicalEvidence).length;
  const implementedRequirements = rows.filter((row) =>
    ['IMPLEMENTADO', 'CONCLUIDO'].includes(row.implementationStatus)
  ).length;
  // Preserva a fórmula histórica: média por requisito, considerando requisitos sem tarefas como 0.
  const progressSum = rows.reduce(
    (sum, row) =>
      sum +
      (row.progressPercentage ??
        row.progress?.percentage ??
        (row.progress?.denominator
          ? Number(((row.progress.numerator / row.progress.denominator) * 100).toFixed(2))
          : 0)),
    0
  );
  const averageProgress = {
    numerator: progressSum,
    denominator: totalRequirements,
    percentage: totalRequirements ? Number((progressSum / totalRequirements).toFixed(2)) : null,
    hasData: totalRequirements > 0
  };

  return {
    totalRequirements,
    requirementsWithTasks,
    requirementsWithTechnicalEvidence,
    implementedRequirements,
    averageProgress,
    averageProgressPercentage: averageProgress.percentage ?? 0
  };
}
