import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const normalized = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
export const normalizedEntity = (value) =>
  normalized(value)
    .replace(/[\s-]+/g, '_')
    .replace(/^github_/, '')
    .toUpperCase();

export function normalizeArtifactType(type) {
  const value = normalized(type).replace(/[\s-]+/g, '_');
  if (['commit', 'commits'].includes(value)) return 'COMMIT';
  if (['pull_request', 'pullrequest', 'pr'].includes(value)) return 'PULL_REQUEST';
  if (['issue', 'issues'].includes(value)) return 'ISSUE';
  return 'UNKNOWN';
}

export async function legacyTableExists(client, tableName) {
  const rows = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    tableName
  );
  return Number(rows[0]?.total || 0) === 1;
}

async function legacyRows(client, tableName, columns) {
  if (!(await legacyTableExists(client, tableName))) return [];
  return client.$queryRawUnsafe(`SELECT ${columns} FROM \`${tableName}\``);
}

export async function loadLegacySnapshot(client) {
  const [taskPullRequests, githubArtifacts, traceLinks] = await Promise.all([
    legacyRows(client, 'TaskPullRequest', '`id`, `taskId`, `pullRequestId`'),
    legacyRows(
      client,
      'GithubArtifact',
      '`id`, `projectId`, `type`, `externalId`, `sha`, `title`, `description`, `author`, `status`, `branch`, `url`, `createdAtGithub`, `closedAtGithub`'
    ),
    legacyRows(
      client,
      'TraceLink',
      '`id`, `projectId`, `sourceType`, `sourceId`, `targetType`, `targetId`'
    )
  ]);
  return { taskPullRequests, githubArtifacts, traceLinks };
}

export function auditTaskPullRequests({ links = [], tasks = [], pullRequests = [] }) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const pullRequestById = new Map(pullRequests.map((item) => [item.id, item]));
  const grouped = new Map();
  let orphanLinks = 0;
  let projectMismatches = 0;
  let joinsWithoutTaskPullRequestId = 0;
  let joinsDifferentFromTaskPullRequestId = 0;
  let reconciled = 0;

  for (const link of links) {
    const task = taskById.get(link.taskId);
    const pullRequest = pullRequestById.get(link.pullRequestId);
    if (!task || !pullRequest) {
      orphanLinks += 1;
      continue;
    }
    if (task.projectId !== pullRequest.projectId) projectMismatches += 1;
    const ids = grouped.get(link.taskId) || new Set();
    ids.add(link.pullRequestId);
    grouped.set(link.taskId, ids);
    if (task.pullRequestId === null || task.pullRequestId === undefined)
      joinsWithoutTaskPullRequestId += 1;
    else if (task.pullRequestId !== link.pullRequestId) joinsDifferentFromTaskPullRequestId += 1;
    else reconciled += 1;
  }

  const tasksWithMultiplePullRequests = [...grouped.values()].filter((ids) => ids.size > 1).length;
  const linkedPairs = new Set(links.map((link) => `${link.taskId}:${link.pullRequestId}`));
  const tasksWithPullRequestIdWithoutJoin = tasks.filter(
    (task) => task.pullRequestId && !linkedPairs.has(`${task.id}:${task.pullRequestId}`)
  ).length;
  const conflicts =
    tasksWithMultiplePullRequests +
    joinsDifferentFromTaskPullRequestId +
    projectMismatches +
    orphanLinks;

  return {
    tablePresent: links.tablePresent !== false,
    totalRecords: links.length,
    tasksWithJoin: grouped.size,
    tasksWithMultiplePullRequests,
    joinsWithoutTaskPullRequestId,
    joinsDifferentFromTaskPullRequestId,
    tasksWithPullRequestIdWithoutJoin,
    orphanLinks,
    projectMismatches,
    reconciled,
    conflicts,
    exclusiveRecords: conflicts
  };
}

export function taskPullRequestReconciliationPlan({ links = [], tasks = [], pullRequests = [] }) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const pullRequestById = new Map(pullRequests.map((item) => [item.id, item]));
  const grouped = new Map();
  for (const link of links) {
    const values = grouped.get(link.taskId) || [];
    values.push(link);
    grouped.set(link.taskId, values);
  }
  const updates = [];
  let conflicts = 0;
  for (const [taskId, taskLinks] of grouped) {
    const task = taskById.get(taskId);
    const distinctIds = [...new Set(taskLinks.map((link) => link.pullRequestId))];
    const pullRequest = distinctIds.length === 1 ? pullRequestById.get(distinctIds[0]) : null;
    if (
      !task ||
      !pullRequest ||
      distinctIds.length !== 1 ||
      task.projectId !== pullRequest.projectId
    ) {
      conflicts += 1;
      continue;
    }
    if (task.pullRequestId && task.pullRequestId !== pullRequest.id) {
      conflicts += 1;
      continue;
    }
    if (!task.pullRequestId) updates.push({ taskId, pullRequestId: pullRequest.id });
  }
  return { updates, conflicts };
}

function artifactMatches(artifact, collections) {
  const type = normalizeArtifactType(artifact.type);
  if (type === 'COMMIT') {
    const candidates = [artifact.sha, artifact.externalId].filter(Boolean).map(normalized);
    return collections.commits.filter(
      (item) => item.projectId === artifact.projectId && candidates.includes(normalized(item.hash))
    );
  }
  const candidate = normalized(artifact.externalId);
  const source =
    type === 'PULL_REQUEST' ? collections.pullRequests : type === 'ISSUE' ? collections.issues : [];
  return source.filter(
    (item) =>
      item.projectId === artifact.projectId &&
      candidate &&
      [item.githubId, item.number].map(normalized).includes(candidate)
  );
}

export function reconcileArtifactRecords({
  artifacts = [],
  projects = [],
  commits = [],
  pullRequests = [],
  issues = []
}) {
  const projectIds = new Set(projects.map((project) => project.id));
  const seen = new Set();
  const convertibleCommits = [];
  const report = {
    examined: artifacts.length,
    matchedCommit: 0,
    matchedPullRequest: 0,
    matchedIssue: 0,
    convertibleCommit: 0,
    unmatched: 0,
    duplicates: 0,
    ambiguous: 0,
    unknownType: 0,
    orphanRecords: 0,
    reconciled: 0,
    exclusiveRecords: 0
  };
  for (const artifact of artifacts) {
    const type = normalizeArtifactType(artifact.type);
    const stableId = normalized(artifact.sha || artifact.externalId);
    const key = `${artifact.projectId}:${type}:${stableId || artifact.id}`;
    if (seen.has(key)) report.duplicates += 1;
    seen.add(key);
    if (!projectIds.has(artifact.projectId)) {
      report.orphanRecords += 1;
      report.exclusiveRecords += 1;
      continue;
    }
    if (type === 'UNKNOWN') {
      report.unknownType += 1;
      report.unmatched += 1;
      report.exclusiveRecords += 1;
      continue;
    }
    const matches = artifactMatches(artifact, { commits, pullRequests, issues });
    const matchIds = new Set(matches.map((item) => item.id));
    if (matchIds.size > 1) {
      report.ambiguous += 1;
      report.exclusiveRecords += 1;
      continue;
    }
    if (matchIds.size === 1) {
      if (type === 'COMMIT') report.matchedCommit += 1;
      if (type === 'PULL_REQUEST') report.matchedPullRequest += 1;
      if (type === 'ISSUE') report.matchedIssue += 1;
      report.reconciled += 1;
      continue;
    }
    if (type === 'COMMIT' && normalized(artifact.sha)) {
      report.convertibleCommit += 1;
      convertibleCommits.push({
        projectId: artifact.projectId,
        hash: String(artifact.sha).trim(),
        message: artifact.description || artifact.title || null,
        authorName: artifact.author || null,
        date: artifact.createdAtGithub || null,
        branch: artifact.branch || null,
        githubUrl: artifact.url || null
      });
      continue;
    }
    report.unmatched += 1;
    report.exclusiveRecords += 1;
  }
  return { report, convertibleCommits };
}

function canonicalLinkSets({ taskCommits = [], taskIssues = [] }) {
  return {
    taskCommits: new Set(taskCommits.map((item) => `${item.taskId}:${item.commitId}`)),
    taskIssues: new Set(taskIssues.map((item) => `${item.taskId}:${item.issueId}`))
  };
}

export function reconcileTraceLinkRecords({
  traceLinks = [],
  tasks = [],
  requirements = [],
  commits = [],
  pullRequests = [],
  issues = [],
  taskCommits = [],
  taskIssues = []
}) {
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const requirementById = new Map(requirements.map((item) => [item.id, item]));
  const commitById = new Map(commits.map((item) => [item.id, item]));
  const pullRequestById = new Map(pullRequests.map((item) => [item.id, item]));
  const issueById = new Map(issues.map((item) => [item.id, item]));
  const canonical = canonicalLinkSets({ taskCommits, taskIssues });
  const plan = { taskCommits: [], taskIssues: [], taskPullRequests: [], requirementTasks: [] };
  const planned = {
    taskCommits: new Set(),
    taskIssues: new Set(),
    requirementTasks: new Set(),
    taskPullRequests: new Map()
  };
  const seen = new Set();
  const report = {
    examined: traceLinks.length,
    requirementTasks: 0,
    taskCommits: 0,
    taskIssues: 0,
    taskPullRequests: 0,
    reconciled: 0,
    pending: 0,
    duplicates: 0,
    unsupported: 0,
    conflicts: 0,
    orphanLinks: 0,
    exclusiveRecords: 0
  };

  for (const link of traceLinks) {
    const source = { type: normalizedEntity(link.sourceType), id: link.sourceId };
    const target = { type: normalizedEntity(link.targetType), id: link.targetId };
    const key = `${link.projectId}:${source.type}:${source.id}:${target.type}:${target.id}`;
    if (seen.has(key)) report.duplicates += 1;
    seen.add(key);
    const pair = [source, target];
    const taskRef = pair.find((item) => item.type === 'TASK');
    const other = pair.find((item) => item !== taskRef);
    if (
      !taskRef ||
      !other ||
      !['REQUIREMENT', 'COMMIT', 'ISSUE', 'PULL_REQUEST', 'PULLREQUEST', 'PR'].includes(other.type)
    ) {
      report.unsupported += 1;
      report.exclusiveRecords += 1;
      continue;
    }
    const task = taskById.get(taskRef.id);
    if (!task || task.projectId !== link.projectId) {
      report.orphanLinks += 1;
      report.exclusiveRecords += 1;
      continue;
    }
    let artifact;
    let relationKey;
    if (other.type === 'REQUIREMENT') {
      artifact = requirementById.get(other.id);
      report.requirementTasks += 1;
      if (!artifact || artifact.projectId !== link.projectId) {
        report.orphanLinks += 1;
        report.exclusiveRecords += 1;
      } else if (task.requirementId && task.requirementId !== artifact.id) {
        report.conflicts += 1;
        report.exclusiveRecords += 1;
      } else if (task.requirementId === artifact.id) report.reconciled += 1;
      else {
        relationKey = `${task.id}:${artifact.id}`;
        if (!planned.requirementTasks.has(relationKey))
          plan.requirementTasks.push({ taskId: task.id, requirementId: artifact.id });
        planned.requirementTasks.add(relationKey);
        report.pending += 1;
      }
      continue;
    }
    if (other.type === 'COMMIT') {
      artifact = commitById.get(other.id);
      report.taskCommits += 1;
      relationKey = `${task.id}:${other.id}`;
      if (!artifact || artifact.projectId !== link.projectId) {
        report.orphanLinks += 1;
        report.exclusiveRecords += 1;
      } else if (canonical.taskCommits.has(relationKey)) report.reconciled += 1;
      else {
        if (!planned.taskCommits.has(relationKey))
          plan.taskCommits.push({ taskId: task.id, commitId: artifact.id });
        planned.taskCommits.add(relationKey);
        report.pending += 1;
      }
      continue;
    }
    if (other.type === 'ISSUE') {
      artifact = issueById.get(other.id);
      report.taskIssues += 1;
      relationKey = `${task.id}:${other.id}`;
      if (!artifact || artifact.projectId !== link.projectId) {
        report.orphanLinks += 1;
        report.exclusiveRecords += 1;
      } else if (canonical.taskIssues.has(relationKey)) report.reconciled += 1;
      else {
        if (!planned.taskIssues.has(relationKey))
          plan.taskIssues.push({ taskId: task.id, issueId: artifact.id });
        planned.taskIssues.add(relationKey);
        report.pending += 1;
      }
      continue;
    }
    artifact = pullRequestById.get(other.id);
    report.taskPullRequests += 1;
    if (!artifact || artifact.projectId !== link.projectId) {
      report.orphanLinks += 1;
      report.exclusiveRecords += 1;
    } else {
      const previouslyPlanned = planned.taskPullRequests.get(task.id);
      if (
        (task.pullRequestId && task.pullRequestId !== artifact.id) ||
        (previouslyPlanned && previouslyPlanned !== artifact.id)
      ) {
        report.conflicts += 1;
        report.exclusiveRecords += 1;
      } else if (task.pullRequestId === artifact.id) report.reconciled += 1;
      else if (!previouslyPlanned) {
        planned.taskPullRequests.set(task.id, artifact.id);
        plan.taskPullRequests.push({ taskId: task.id, pullRequestId: artifact.id });
        report.pending += 1;
      }
    }
  }
  return { report, plan };
}

function collectFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    return statSync(path).isDirectory() ? collectFiles(path) : [path];
  });
}

export function detectLegacyRuntimeConsumers(sourceRoot) {
  const patterns = {
    taskPullRequest: /prisma\.taskPullRequest|pullRequestLinks|\bTaskPullRequest\b/,
    githubArtifact: /prisma\.githubArtifact|\bGithubArtifact\b/,
    traceLink: /prisma\.traceLink|\bTraceLink\b/
  };
  const result = { taskPullRequest: 0, githubArtifact: 0, traceLink: 0 };
  for (const file of collectFiles(sourceRoot).filter((path) => /\.jsx?$/.test(path))) {
    const source = readFileSync(file, 'utf8');
    for (const [name, pattern] of Object.entries(patterns)) {
      if (pattern.test(source)) result[name] += 1;
    }
  }
  return result;
}
