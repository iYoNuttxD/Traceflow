import { createHash } from 'node:crypto';
import { runMembershipBackfill } from './membership-backfill.js';
import {
  auditTaskPullRequests,
  legacyTableExists,
  loadLegacySnapshot,
  normalizeArtifactType,
  reconcileArtifactRecords,
  reconcileTraceLinkRecords,
  taskPullRequestReconciliationPlan
} from './e8-legacy-data.js';

const normalized = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized(value));

export {
  auditTaskPullRequests,
  normalizeArtifactType,
  reconcileArtifactRecords,
  reconcileTraceLinkRecords,
  taskPullRequestReconciliationPlan
};

export function checksumIds(ids) {
  return createHash('sha256')
    .update([...new Set(ids.map(Number).filter(Number.isInteger))].sort((a, b) => a - b).join(','))
    .digest('hex');
}

export function mapLegacyRole(role) {
  return (
    Object.freeze({
      DONO: 'OWNER',
      OWNER: 'OWNER',
      GERENTE: 'MANAGER',
      MANAGER: 'MANAGER',
      MEMBRO: 'MEMBER',
      MEMBER: 'MEMBER',
      VISUALIZADOR: 'VIEWER',
      VIEWER: 'VIEWER'
    })[
      String(role || '')
        .trim()
        .toUpperCase()
    ] || null
  );
}

export function resolveUniqueUserByName(name, memberships = []) {
  const target = normalized(name);
  if (!target) return { status: 'EMPTY', userId: null };
  const matches = memberships.filter(
    (membership) => membership.isActive && normalized(membership.user?.name) === target
  );
  const ids = [...new Set(matches.map((membership) => membership.userId))];
  if (ids.length === 0) return { status: 'UNMATCHED', userId: null };
  if (ids.length > 1) return { status: 'AMBIGUOUS', userId: null };
  return { status: 'MATCHED', userId: ids[0] };
}

export function mapProjectMemberToMembership(member, memberships = []) {
  if (!validEmail(member?.email)) return { status: 'MISSING_OR_INVALID_EMAIL', userId: null };
  const matches = memberships.filter(
    (membership) => normalized(membership.user?.email) === normalized(member.email)
  );
  const ids = [...new Set(matches.map((membership) => membership.userId))];
  if (ids.length === 0) return { status: 'UNMATCHED', userId: null };
  if (ids.length > 1) return { status: 'AMBIGUOUS', userId: null };
  return { status: 'MATCHED', userId: ids[0] };
}

export function canonicalProjectPatch(project) {
  const repositoryName = project.githubRepositoryName || project.githubRepo || null;
  const fullName =
    project.githubRepositoryFullName ||
    (project.githubOwner && repositoryName ? `${project.githubOwner}/${repositoryName}` : null);
  const repositoryUrl =
    project.githubRepositoryUrl ||
    project.githubUrl ||
    (fullName ? `https://github.com/${fullName}` : null);
  const patch = {};
  if (!project.githubRepositoryName && repositoryName) patch.githubRepositoryName = repositoryName;
  if (!project.githubRepositoryFullName && fullName) patch.githubRepositoryFullName = fullName;
  if (!project.githubRepositoryUrl && repositoryUrl) patch.githubRepositoryUrl = repositoryUrl;
  return patch;
}

async function canonicalSnapshot(client) {
  const [projects, tasks, requirements, commits, pullRequests, issues, taskCommits, taskIssues] =
    await Promise.all([
      client.project.findMany({ select: { id: true } }),
      client.task.findMany({
        select: { id: true, projectId: true, requirementId: true, pullRequestId: true }
      }),
      client.requirement.findMany({ select: { id: true, projectId: true } }),
      client.commit.findMany({ select: { id: true, projectId: true, hash: true } }),
      client.pullRequest.findMany({
        select: { id: true, projectId: true, githubId: true, number: true }
      }),
      client.issue.findMany({
        select: { id: true, projectId: true, githubId: true, number: true }
      }),
      client.taskCommit.findMany({ select: { taskId: true, commitId: true } }),
      client.taskIssue.findMany({ select: { taskId: true, issueId: true } })
    ]);
  return { projects, tasks, requirements, commits, pullRequests, issues, taskCommits, taskIssues };
}

async function technicalModelCounts(client, legacy) {
  const names = [
    'user',
    'session',
    'passwordResetToken',
    'project',
    'projectMembership',
    'projectInvitation',
    'projectMember',
    'requirement',
    'task',
    'taskMovement',
    'taskCommit',
    'taskIssue',
    'commit',
    'pullRequest',
    'issue',
    'auditEvent',
    'privacyRequest',
    'personalDataExport'
  ];
  const counts = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await client[name].count()]))
  );
  return {
    ...counts,
    taskPullRequest: legacy.taskPullRequests.length,
    githubArtifact: legacy.githubArtifacts.length,
    traceLink: legacy.traceLinks.length
  };
}

export async function auditE8Schema({ client }) {
  const [legacy, canonical, tables] = await Promise.all([
    loadLegacySnapshot(client),
    canonicalSnapshot(client),
    Promise.all(
      ['TaskPullRequest', 'GithubArtifact', 'TraceLink'].map((name) =>
        legacyTableExists(client, name)
      )
    )
  ]);
  const taskPullRequests = auditTaskPullRequests({
    links: legacy.taskPullRequests,
    tasks: canonical.tasks,
    pullRequests: canonical.pullRequests
  });
  taskPullRequests.tablePresent = tables[0];
  const artifacts = reconcileArtifactRecords({
    artifacts: legacy.githubArtifacts,
    projects: canonical.projects,
    commits: canonical.commits,
    pullRequests: canonical.pullRequests,
    issues: canonical.issues
  }).report;
  artifacts.tablePresent = tables[1];
  const traceLinks = reconcileTraceLinkRecords({
    traceLinks: legacy.traceLinks,
    ...canonical
  }).report;
  traceLinks.tablePresent = tables[2];
  return {
    counts: await technicalModelCounts(client, legacy),
    checksums: {
      tasksWithPullRequest: checksumIds(
        canonical.tasks.filter((item) => item.pullRequestId).map((item) => item.id)
      ),
      taskPullRequests: checksumIds(legacy.taskPullRequests.map((item) => item.taskId)),
      traceLinks: checksumIds(legacy.traceLinks.map((item) => item.id))
    },
    taskPullRequests,
    artifacts,
    traceLinks
  };
}

async function buildReconciliationPlan(client) {
  const [projects, responsibleTasks, movements, memberships, members, legacy, canonical] =
    await Promise.all([
      client.project.findMany({
        select: {
          id: true,
          githubOwner: true,
          githubRepo: true,
          githubUrl: true,
          githubRepositoryName: true,
          githubRepositoryFullName: true,
          githubRepositoryUrl: true
        }
      }),
      client.task.findMany({
        where: { responsibleUserId: null, responsible: { not: null } },
        select: { id: true, projectId: true, responsible: true }
      }),
      client.taskMovement.findMany({
        where: { movedByUserId: null },
        select: { id: true, projectId: true, movedBy: true, projectMemberId: true }
      }),
      client.projectMembership.findMany({
        select: {
          projectId: true,
          userId: true,
          isActive: true,
          user: { select: { name: true, email: true } }
        }
      }),
      client.projectMember.findMany({ select: { id: true, projectId: true, email: true } }),
      loadLegacySnapshot(client),
      canonicalSnapshot(client)
    ]);
  const membershipByProject = new Map();
  for (const membership of memberships) {
    const values = membershipByProject.get(membership.projectId) || [];
    values.push(membership);
    membershipByProject.set(membership.projectId, values);
  }
  const memberById = new Map(members.map((member) => [member.id, member]));
  const projectUpdates = projects
    .map((project) => ({ id: project.id, data: canonicalProjectPatch(project) }))
    .filter((item) => Object.keys(item.data).length > 0);
  const responsibleUpdates = [];
  const responsible = { examined: responsibleTasks.length, matched: 0, unmatched: 0, ambiguous: 0 };
  for (const task of responsibleTasks) {
    const resolution = resolveUniqueUserByName(
      task.responsible,
      membershipByProject.get(task.projectId) || []
    );
    if (resolution.status === 'MATCHED') {
      responsible.matched += 1;
      responsibleUpdates.push({ id: task.id, userId: resolution.userId });
    } else if (resolution.status === 'AMBIGUOUS') responsible.ambiguous += 1;
    else responsible.unmatched += 1;
  }
  const movementUpdates = [];
  const movedBy = { examined: movements.length, matched: 0, unmatched: 0, ambiguous: 0 };
  for (const movement of movements) {
    const projectMemberships = membershipByProject.get(movement.projectId) || [];
    const member = movement.projectMemberId ? memberById.get(movement.projectMemberId) : null;
    const resolution = member
      ? mapProjectMemberToMembership(member, projectMemberships)
      : resolveUniqueUserByName(movement.movedBy, projectMemberships);
    if (resolution.status === 'MATCHED') {
      movedBy.matched += 1;
      movementUpdates.push({ id: movement.id, userId: resolution.userId });
    } else if (resolution.status === 'AMBIGUOUS') movedBy.ambiguous += 1;
    else movedBy.unmatched += 1;
  }
  const taskPullRequests = taskPullRequestReconciliationPlan({
    links: legacy.taskPullRequests,
    tasks: canonical.tasks,
    pullRequests: canonical.pullRequests
  });
  const artifacts = reconcileArtifactRecords({ artifacts: legacy.githubArtifacts, ...canonical });
  const traceLinks = reconcileTraceLinkRecords({ traceLinks: legacy.traceLinks, ...canonical });
  return {
    projectUpdates,
    responsibleUpdates,
    movementUpdates,
    responsible,
    movedBy,
    taskPullRequests,
    artifacts,
    traceLinks
  };
}

export async function runE8Reconciliation({ client, apply = false }) {
  const before = await auditE8Schema({ client });
  const memberships = await runMembershipBackfill({ client, apply });
  const plan = await buildReconciliationPlan(client);
  if (apply) {
    await client.$transaction(async (tx) => {
      for (const update of plan.projectUpdates)
        await tx.project.update({ where: { id: update.id }, data: update.data });
      for (const update of plan.responsibleUpdates)
        await tx.task.update({
          where: { id: update.id },
          data: { responsibleUserId: update.userId }
        });
      for (const update of plan.movementUpdates)
        await tx.taskMovement.update({
          where: { id: update.id },
          data: { movedByUserId: update.userId }
        });
      for (const update of plan.taskPullRequests.updates)
        await tx.task.update({
          where: { id: update.taskId },
          data: { pullRequestId: update.pullRequestId }
        });
      if (plan.artifacts.convertibleCommits.length > 0)
        await tx.commit.createMany({
          data: plan.artifacts.convertibleCommits,
          skipDuplicates: true
        });
      if (plan.traceLinks.plan.taskCommits.length > 0)
        await tx.taskCommit.createMany({
          data: plan.traceLinks.plan.taskCommits,
          skipDuplicates: true
        });
      if (plan.traceLinks.plan.taskIssues.length > 0)
        await tx.taskIssue.createMany({
          data: plan.traceLinks.plan.taskIssues,
          skipDuplicates: true
        });
      for (const update of plan.traceLinks.plan.taskPullRequests)
        await tx.task.update({
          where: { id: update.taskId },
          data: { pullRequestId: update.pullRequestId }
        });
      for (const update of plan.traceLinks.plan.requirementTasks)
        await tx.task.update({
          where: { id: update.taskId },
          data: { requirementId: update.requirementId }
        });
    });
  }
  const after = apply ? await auditE8Schema({ client }) : before;
  return {
    mode: apply ? 'apply' : 'dry-run',
    pending: {
      legacyMemberships: Math.max(
        0,
        memberships.eligible - memberships.alreadyMigrated - memberships.migrated
      ),
      projectCanonicalFields: plan.projectUpdates.length,
      responsibleUsers: plan.responsibleUpdates.length,
      movedByUsers: plan.movementUpdates.length,
      taskPullRequests: plan.taskPullRequests.updates.length,
      githubArtifacts: plan.artifacts.convertibleCommits.length,
      traceLinks: plan.traceLinks.report.pending
    },
    unresolved: {
      memberships: {
        invalid: memberships.skippedMissingOrInvalidEmail,
        ambiguous: memberships.skippedAmbiguousIdentity,
        unknownRole: memberships.skippedUnknownRole,
        projectsWithoutOwner: memberships.projectsWithoutEligibleOwner.length
      },
      responsible: { unmatched: plan.responsible.unmatched, ambiguous: plan.responsible.ambiguous },
      movedBy: { unmatched: plan.movedBy.unmatched, ambiguous: plan.movedBy.ambiguous },
      taskPullRequests: { conflicts: plan.taskPullRequests.conflicts },
      githubArtifacts: {
        exclusive: plan.artifacts.report.exclusiveRecords,
        ambiguous: plan.artifacts.report.ambiguous
      },
      traceLinks: {
        unsupported: plan.traceLinks.report.unsupported,
        conflicts: plan.traceLinks.report.conflicts,
        orphanLinks: plan.traceLinks.report.orphanLinks
      }
    },
    before,
    after
  };
}
