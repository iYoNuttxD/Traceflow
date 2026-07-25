import { createHash } from 'node:crypto';
import { runMembershipBackfill } from './membership-backfill.js';

const normalized = (value) => String(value ?? '').trim().toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized(value));
const normalizedEntity = (value) => normalized(value).replace(/[\s-]+/g, '_').replace(/^github_/, '').toUpperCase();

export function checksumIds(ids) {
  return createHash('sha256')
    .update([...new Set(ids.map(Number).filter(Number.isInteger))].sort((a, b) => a - b).join(','))
    .digest('hex');
}

export function normalizeArtifactType(type) {
  const value = normalized(type).replace(/[\s-]+/g, '_');
  if (['commit', 'commits'].includes(value)) return 'COMMIT';
  if (['pull_request', 'pullrequest', 'pr'].includes(value)) return 'PULL_REQUEST';
  if (['issue', 'issues'].includes(value)) return 'ISSUE';
  return 'UNKNOWN';
}

export function reconcileArtifactRecords({ artifacts = [], commits = [], pullRequests = [], issues = [] }) {
  const commitKeys = new Set(commits.flatMap((item) => [item.hash, item.githubId].filter(Boolean).map(normalized)));
  const pullRequestKeys = new Set(pullRequests.flatMap((item) => [item.githubId, item.number].filter((value) => value !== null && value !== undefined).map(normalized)));
  const issueKeys = new Set(issues.flatMap((item) => [item.githubId, item.number].filter((value) => value !== null && value !== undefined).map(normalized)));
  const seen = new Set();
  const report = { examined: artifacts.length, matchedCommit: 0, matchedPullRequest: 0, matchedIssue: 0, unmatched: 0, duplicates: 0, unknownType: 0 };
  for (const artifact of artifacts) {
    const type = normalizeArtifactType(artifact.type);
    const candidates = [artifact.externalId, artifact.sha].filter(Boolean).map(normalized);
    const key = `${artifact.projectId}:${type}:${candidates[0] || artifact.id}`;
    if (seen.has(key)) report.duplicates += 1;
    seen.add(key);
    const pool = type === 'COMMIT' ? commitKeys : type === 'PULL_REQUEST' ? pullRequestKeys : type === 'ISSUE' ? issueKeys : null;
    if (!pool) { report.unknownType += 1; report.unmatched += 1; continue; }
    if (!candidates.some((candidate) => pool.has(candidate))) { report.unmatched += 1; continue; }
    if (type === 'COMMIT') report.matchedCommit += 1;
    if (type === 'PULL_REQUEST') report.matchedPullRequest += 1;
    if (type === 'ISSUE') report.matchedIssue += 1;
  }
  return report;
}

export function mapLegacyRole(role) {
  return Object.freeze({ DONO: 'OWNER', OWNER: 'OWNER', GERENTE: 'MANAGER', MANAGER: 'MANAGER', MEMBRO: 'MEMBER', MEMBER: 'MEMBER', VISUALIZADOR: 'VIEWER', VIEWER: 'VIEWER' })[String(role || '').trim().toUpperCase()] || null;
}

export function resolveUniqueUserByName(name, memberships = []) {
  const target = normalized(name);
  if (!target) return { status: 'EMPTY', userId: null };
  const matches = memberships.filter((membership) => membership.isActive && normalized(membership.user?.name) === target);
  const ids = [...new Set(matches.map((membership) => membership.userId))];
  if (ids.length === 0) return { status: 'UNMATCHED', userId: null };
  if (ids.length > 1) return { status: 'AMBIGUOUS', userId: null };
  return { status: 'MATCHED', userId: ids[0] };
}

export function mapProjectMemberToMembership(member, memberships = []) {
  if (!validEmail(member?.email)) return { status: 'MISSING_OR_INVALID_EMAIL', userId: null };
  const matches = memberships.filter((membership) => normalized(membership.user?.email) === normalized(member.email));
  const ids = [...new Set(matches.map((membership) => membership.userId))];
  if (ids.length === 0) return { status: 'UNMATCHED', userId: null };
  if (ids.length > 1) return { status: 'AMBIGUOUS', userId: null };
  return { status: 'MATCHED', userId: ids[0] };
}

export function canonicalProjectPatch(project) {
  const repositoryName = project.githubRepositoryName || project.githubRepo || null;
  const fullName = project.githubRepositoryFullName || (project.githubOwner && repositoryName ? `${project.githubOwner}/${repositoryName}` : null);
  const repositoryUrl = project.githubRepositoryUrl || project.githubUrl || (fullName ? `https://github.com/${fullName}` : null);
  const patch = {};
  if (!project.githubRepositoryName && repositoryName) patch.githubRepositoryName = repositoryName;
  if (!project.githubRepositoryFullName && fullName) patch.githubRepositoryFullName = fullName;
  if (!project.githubRepositoryUrl && repositoryUrl) patch.githubRepositoryUrl = repositoryUrl;
  return patch;
}

function technicalModelCounts(client) {
  const names = ['user', 'session', 'passwordResetToken', 'project', 'projectMembership', 'projectInvitation', 'projectMember', 'requirement', 'task', 'taskMovement', 'taskCommit', 'taskIssue', 'taskPullRequest', 'commit', 'pullRequest', 'issue', 'githubArtifact', 'traceLink', 'auditEvent', 'privacyRequest', 'personalDataExport'];
  return Promise.all(names.map(async (name) => [name, await client[name].count()])).then(Object.fromEntries);
}

export async function auditE8Schema({ client }) {
  const [counts, artifacts, commits, pullRequests, issues, legacyPrTasks, canonicalPrLinks, traceLinks] = await Promise.all([
    technicalModelCounts(client),
    client.githubArtifact.findMany({ select: { id: true, projectId: true, type: true, externalId: true, sha: true } }),
    client.commit.findMany({ select: { id: true, projectId: true, hash: true } }),
    client.pullRequest.findMany({ select: { id: true, projectId: true, githubId: true, number: true } }),
    client.issue.findMany({ select: { id: true, projectId: true, githubId: true, number: true } }),
    client.task.findMany({ where: { pullRequestId: { not: null } }, select: { id: true, pullRequestId: true } }),
    client.taskPullRequest.findMany({ select: { taskId: true, pullRequestId: true } }),
    client.traceLink.findMany({ select: { id: true, projectId: true, sourceType: true, sourceId: true, targetType: true, targetId: true } })
  ]);
  const canonicalSet = new Set(canonicalPrLinks.map((link) => `${link.taskId}:${link.pullRequestId}`));
  const missingCanonicalPrLinks = legacyPrTasks.filter((task) => !canonicalSet.has(`${task.id}:${task.pullRequestId}`));
  return {
    counts,
    checksums: {
      tasksWithLegacyPullRequest: checksumIds(legacyPrTasks.map((item) => item.id)),
      canonicalTaskPullRequests: checksumIds(canonicalPrLinks.map((item) => item.taskId)),
      traceLinks: checksumIds(traceLinks.map((item) => item.id))
    },
    artifacts: reconcileArtifactRecords({ artifacts, commits, pullRequests, issues }),
    links: { legacyPullRequestLinks: legacyPrTasks.length, canonicalPullRequestLinks: canonicalPrLinks.length, missingCanonicalPullRequestLinks: missingCanonicalPrLinks.length, traceLinks: traceLinks.length }
  };
}

async function buildReconciliationPlan(client) {
  const [projects, tasks, movements, memberships, members, legacyPrTasks, canonicalPrLinks, traceLinks] = await Promise.all([
    client.project.findMany({ select: { id: true, githubOwner: true, githubRepo: true, githubUrl: true, githubRepositoryName: true, githubRepositoryFullName: true, githubRepositoryUrl: true } }),
    client.task.findMany({ where: { responsibleUserId: null, responsible: { not: null } }, select: { id: true, projectId: true, responsible: true } }),
    client.taskMovement.findMany({ where: { movedByUserId: null }, select: { id: true, projectId: true, movedBy: true, projectMemberId: true } }),
    client.projectMembership.findMany({ select: { projectId: true, userId: true, isActive: true, user: { select: { name: true, email: true } } } }),
    client.projectMember.findMany({ select: { id: true, projectId: true, email: true } }),
    client.task.findMany({ where: { pullRequestId: { not: null } }, select: { id: true, pullRequestId: true } }),
    client.taskPullRequest.findMany({ select: { taskId: true, pullRequestId: true } }),
    client.traceLink.findMany({ select: { id: true, projectId: true, sourceType: true, sourceId: true, targetType: true, targetId: true } })
  ]);
  const membershipByProject = new Map();
  for (const membership of memberships) {
    const values = membershipByProject.get(membership.projectId) || [];
    values.push(membership);
    membershipByProject.set(membership.projectId, values);
  }
  const memberById = new Map(members.map((member) => [member.id, member]));
  const projectUpdates = projects.map((project) => ({ id: project.id, data: canonicalProjectPatch(project) })).filter((item) => Object.keys(item.data).length > 0);
  const responsibleUpdates = [];
  const responsible = { examined: tasks.length, matched: 0, unmatched: 0, ambiguous: 0 };
  for (const task of tasks) {
    const resolution = resolveUniqueUserByName(task.responsible, membershipByProject.get(task.projectId) || []);
    if (resolution.status === 'MATCHED') { responsible.matched += 1; responsibleUpdates.push({ id: task.id, userId: resolution.userId }); }
    else if (resolution.status === 'AMBIGUOUS') responsible.ambiguous += 1;
    else responsible.unmatched += 1;
  }
  const movementUpdates = [];
  const movedBy = { examined: movements.length, matched: 0, unmatched: 0, ambiguous: 0 };
  for (const movement of movements) {
    const projectMemberships = membershipByProject.get(movement.projectId) || [];
    const member = movement.projectMemberId ? memberById.get(movement.projectMemberId) : null;
    const resolution = member ? mapProjectMemberToMembership(member, projectMemberships) : resolveUniqueUserByName(movement.movedBy, projectMemberships);
    if (resolution.status === 'MATCHED') { movedBy.matched += 1; movementUpdates.push({ id: movement.id, userId: resolution.userId }); }
    else if (resolution.status === 'AMBIGUOUS') movedBy.ambiguous += 1;
    else movedBy.unmatched += 1;
  }
  const canonicalSet = new Set(canonicalPrLinks.map((link) => `${link.taskId}:${link.pullRequestId}`));
  const pullRequestLinks = legacyPrTasks.filter((task) => !canonicalSet.has(`${task.id}:${task.pullRequestId}`)).map((task) => ({ taskId: task.id, pullRequestId: task.pullRequestId }));
  const typedLinks = { taskCommits: [], taskIssues: [], taskPullRequests: [], requirementTasks: [], unsupported: 0, conflicts: 0 };
  for (const link of traceLinks) {
    const source = { type: normalizedEntity(link.sourceType), id: link.sourceId };
    const target = { type: normalizedEntity(link.targetType), id: link.targetId };
    const pair = [source, target];
    const taskRef = pair.find((item) => item.type === 'TASK');
    const other = pair.find((item) => item !== taskRef);
    if (!taskRef || !other) { typedLinks.unsupported += 1; continue; }
    const task = await client.task.findUnique({ where: { id: taskRef.id }, select: { id: true, projectId: true, requirementId: true } });
    if (!task || task.projectId !== link.projectId) { typedLinks.conflicts += 1; continue; }
    if (other.type === 'COMMIT') {
      const artifact = await client.commit.findUnique({ where: { id: other.id }, select: { id: true, projectId: true } });
      if (!artifact || artifact.projectId !== link.projectId) { typedLinks.conflicts += 1; continue; }
      const existing = await client.taskCommit.findUnique({ where: { taskId_commitId: { taskId: task.id, commitId: artifact.id } }, select: { id: true } });
      if (!existing) typedLinks.taskCommits.push({ taskId: task.id, commitId: artifact.id });
    } else if (other.type === 'ISSUE') {
      const artifact = await client.issue.findUnique({ where: { id: other.id }, select: { id: true, projectId: true } });
      if (!artifact || artifact.projectId !== link.projectId) { typedLinks.conflicts += 1; continue; }
      const existing = await client.taskIssue.findUnique({ where: { taskId_issueId: { taskId: task.id, issueId: artifact.id } }, select: { id: true } });
      if (!existing) typedLinks.taskIssues.push({ taskId: task.id, issueId: artifact.id });
    } else if (other.type === 'PULL_REQUEST' || other.type === 'PULLREQUEST' || other.type === 'PR') {
      const artifact = await client.pullRequest.findUnique({ where: { id: other.id }, select: { id: true, projectId: true } });
      if (!artifact || artifact.projectId !== link.projectId) { typedLinks.conflicts += 1; continue; }
      if (!canonicalSet.has(`${task.id}:${artifact.id}`)) typedLinks.taskPullRequests.push({ taskId: task.id, pullRequestId: artifact.id });
    } else if (other.type === 'REQUIREMENT') {
      const requirement = await client.requirement.findUnique({ where: { id: other.id }, select: { id: true, projectId: true } });
      if (!requirement || requirement.projectId !== link.projectId || (task.requirementId && task.requirementId !== requirement.id)) { typedLinks.conflicts += 1; continue; }
      if (!task.requirementId) typedLinks.requirementTasks.push({ taskId: task.id, requirementId: requirement.id });
    } else typedLinks.unsupported += 1;
  }
  return { projectUpdates, responsibleUpdates, movementUpdates, pullRequestLinks, responsible, movedBy, typedLinks };
}

export async function runE8Reconciliation({ client, apply = false }) {
  const before = await auditE8Schema({ client });
  const memberships = await runMembershipBackfill({ client, apply });
  const plan = await buildReconciliationPlan(client);
  if (apply) {
    await client.$transaction(async (tx) => {
      for (const update of plan.projectUpdates) await tx.project.update({ where: { id: update.id }, data: update.data });
      for (const update of plan.responsibleUpdates) await tx.task.update({ where: { id: update.id }, data: { responsibleUserId: update.userId } });
      for (const update of plan.movementUpdates) await tx.taskMovement.update({ where: { id: update.id }, data: { movedByUserId: update.userId } });
      if (plan.pullRequestLinks.length > 0) await tx.taskPullRequest.createMany({ data: plan.pullRequestLinks, skipDuplicates: true });
      if (plan.typedLinks.taskCommits.length > 0) await tx.taskCommit.createMany({ data: plan.typedLinks.taskCommits, skipDuplicates: true });
      if (plan.typedLinks.taskIssues.length > 0) await tx.taskIssue.createMany({ data: plan.typedLinks.taskIssues, skipDuplicates: true });
      if (plan.typedLinks.taskPullRequests.length > 0) await tx.taskPullRequest.createMany({ data: plan.typedLinks.taskPullRequests, skipDuplicates: true });
      for (const update of plan.typedLinks.requirementTasks) await tx.task.update({ where: { id: update.taskId }, data: { requirementId: update.requirementId } });
    });
  }
  const after = apply ? await auditE8Schema({ client }) : before;
  return {
    mode: apply ? 'apply' : 'dry-run',
    pending: { legacyMemberships: Math.max(0, memberships.eligible - memberships.alreadyMigrated - memberships.migrated), projectCanonicalFields: plan.projectUpdates.length, responsibleUsers: plan.responsibleUpdates.length, movedByUsers: plan.movementUpdates.length, taskPullRequests: plan.pullRequestLinks.length, traceLinks: plan.typedLinks.taskCommits.length + plan.typedLinks.taskIssues.length + plan.typedLinks.taskPullRequests.length + plan.typedLinks.requirementTasks.length },
    unresolved: { memberships: { invalid: memberships.skippedMissingOrInvalidEmail, ambiguous: memberships.skippedAmbiguousIdentity, unknownRole: memberships.skippedUnknownRole, projectsWithoutOwner: memberships.projectsWithoutEligibleOwner.length }, responsible: { unmatched: plan.responsible.unmatched, ambiguous: plan.responsible.ambiguous }, movedBy: { unmatched: plan.movedBy.unmatched, ambiguous: plan.movedBy.ambiguous }, traceLinks: { unsupported: plan.typedLinks.unsupported, conflicts: plan.typedLinks.conflicts } },
    before,
    after
  };
}
