import { buildRequirementMetrics, uniqueById } from './traceability.calculator.js';

export const EDGE_TYPES = Object.freeze({
  REQUIREMENT_TASK: 'REQUIREMENT_TASK',
  TASK_COMMIT: 'TASK_COMMIT',
  TASK_PULL_REQUEST: 'TASK_PULL_REQUEST',
  TASK_ISSUE: 'TASK_ISSUE'
});

const nodeId = (type, id) => `${type}:${id}`;

function publicCommit(commit) {
  return {
    id: commit.id,
    hash: commit.hash,
    shortHash: commit.hash ? commit.hash.slice(0, 7) : null,
    message: commit.message,
    authorName: commit.authorName,
    authorUsername: commit.authorUsername,
    date: commit.date,
    branch: commit.branch,
    githubUrl: commit.githubUrl
  };
}

function publicIssue(issue) {
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

function publicPullRequest(pullRequest) {
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

function publicRequirement(requirement, metrics) {
  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description,
    type: requirement.type,
    status: requirement.status,
    createdAt: requirement.createdAt,
    progress: metrics?.progress,
    progressPercentage: metrics?.progressPercentage,
    implementationStatus: metrics?.implementationStatus,
    hasTechnicalEvidence: metrics?.hasTechnicalEvidence
  };
}

function publicTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    responsible: task.responsible,
    deadline: task.deadline,
    estimatedEffort: task.estimatedEffort,
    actualEffort: task.actualEffort
  };
}

function graphNode(type, entity) {
  return {
    id: nodeId(type, entity.id),
    type: type.toUpperCase().replace('-', '_'),
    entityId: entity.id,
    data: entity
  };
}

function graphEdge(type, fromType, fromId, toType, toId) {
  const source = nodeId(fromType, fromId);
  const target = nodeId(toType, toId);
  return { id: `${type}:${source}:${target}`, type, source, target };
}

function deduplicateGraph(nodes, edges) {
  return {
    nodes: [...new Map(nodes.map((node) => [node.id, node])).values()],
    edges: [...new Map(edges.map((edge) => [edge.id, edge])).values()]
  };
}

function appendTaskArtifacts(task, nodes, edges) {
  const commits = uniqueById((task.commitLinks || []).map((link) => link.commit).filter(Boolean));
  const issues = uniqueById((task.issueLinks || []).map((link) => link.issue).filter(Boolean));

  if (task.pullRequest) {
    nodes.push(graphNode('pull-request', publicPullRequest(task.pullRequest)));
    edges.push(graphEdge(EDGE_TYPES.TASK_PULL_REQUEST, 'task', task.id, 'pull-request', task.pullRequest.id));
  }
  for (const commit of commits) {
    nodes.push(graphNode('commit', publicCommit(commit)));
    edges.push(graphEdge(EDGE_TYPES.TASK_COMMIT, 'task', task.id, 'commit', commit.id));
  }
  for (const issue of issues) {
    nodes.push(graphNode('issue', publicIssue(issue)));
    edges.push(graphEdge(EDGE_TYPES.TASK_ISSUE, 'task', task.id, 'issue', issue.id));
  }
}

export function formatMatrixRow(requirement) {
  const metrics = buildRequirementMetrics(requirement);
  return {
    id: requirement.id,
    title: requirement.title,
    type: requirement.type,
    status: requirement.status,
    createdAt: requirement.createdAt,
    tasksCount: metrics.tasksCount,
    completedTasksCount: metrics.completedTasksCount,
    progress: metrics.progress,
    progressPercentage: metrics.progressPercentage,
    issuesCount: metrics.issuesCount,
    pullRequestsCount: metrics.pullRequestsCount,
    commitsCount: metrics.commitsCount,
    hasTechnicalEvidence: metrics.hasTechnicalEvidence,
    implementationStatus: metrics.implementationStatus
  };
}

export function formatRequirementGraph(requirement, pagination) {
  const metrics = buildRequirementMetrics(requirement);
  const nodes = [graphNode('requirement', publicRequirement(requirement, metrics))];
  const edges = [];
  for (const task of requirement.tasks || []) {
    nodes.push(graphNode('task', publicTask(task)));
    edges.push(graphEdge(EDGE_TYPES.REQUIREMENT_TASK, 'requirement', requirement.id, 'task', task.id));
    appendTaskArtifacts(task, nodes, edges);
  }
  const graph = deduplicateGraph(nodes, edges);
  return {
    projectId: requirement.projectId,
    perspective: { type: 'REQUIREMENT', id: requirement.id },
    summary: {
      progress: metrics.progress,
      implementationStatus: metrics.implementationStatus,
      hasTechnicalEvidence: metrics.hasTechnicalEvidence,
      tasksCount: pagination.total
    },
    ...graph,
    pagination
  };
}

export function formatTaskGraph(task, pagination) {
  const nodes = [graphNode('task', publicTask(task))];
  const edges = [];
  if (task.requirement) {
    nodes.push(graphNode('requirement', publicRequirement(task.requirement)));
    edges.push(graphEdge(EDGE_TYPES.REQUIREMENT_TASK, 'requirement', task.requirement.id, 'task', task.id));
  }
  appendTaskArtifacts(task, nodes, edges);
  const graph = deduplicateGraph(nodes, edges);
  const hasTechnicalEvidence = task.hasTechnicalEvidence ?? Boolean(task.pullRequest || task.commitLinks?.length);
  return {
    projectId: task.projectId,
    perspective: { type: 'TASK', id: task.id },
    summary: { hasTechnicalEvidence, artifactsCount: pagination.total },
    ...graph,
    pagination
  };
}

export function formatArtifactGraph({ artifact, artifactType, projectId, tasks }, pagination) {
  const type = artifactType === 'pull-request' ? 'pull-request' : artifactType;
  const publicArtifact = type === 'commit'
    ? publicCommit(artifact)
    : type === 'issue'
      ? publicIssue(artifact)
      : publicPullRequest(artifact);
  const nodes = [graphNode(type, publicArtifact)];
  const edges = [];
  for (const task of tasks) {
    nodes.push(graphNode('task', publicTask(task)));
    const edgeType = type === 'commit'
      ? EDGE_TYPES.TASK_COMMIT
      : type === 'issue'
        ? EDGE_TYPES.TASK_ISSUE
        : EDGE_TYPES.TASK_PULL_REQUEST;
    edges.push(graphEdge(edgeType, 'task', task.id, type, artifact.id));
    if (task.requirement) {
      nodes.push(graphNode('requirement', publicRequirement(task.requirement)));
      edges.push(graphEdge(EDGE_TYPES.REQUIREMENT_TASK, 'requirement', task.requirement.id, 'task', task.id));
    }
  }
  return {
    projectId,
    perspective: { type: type.toUpperCase().replace('-', '_'), id: artifact.id },
    summary: { linkedTasksCount: pagination.total },
    ...deduplicateGraph(nodes, edges),
    pagination
  };
}
