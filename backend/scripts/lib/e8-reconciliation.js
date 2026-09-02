import { createHash } from 'node:crypto';
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
  const [legacy, canonical] = await Promise.all([
    loadLegacySnapshot(client),
    canonicalSnapshot(client)
  ]);
  const taskPullRequests = taskPullRequestReconciliationPlan({
    links: legacy.taskPullRequests,
    tasks: canonical.tasks,
    pullRequests: canonical.pullRequests
  });
  const artifacts = reconcileArtifactRecords({ artifacts: legacy.githubArtifacts, ...canonical });
  const traceLinks = reconcileTraceLinkRecords({ traceLinks: legacy.traceLinks, ...canonical });
  return {
    taskPullRequests,
    artifacts,
    traceLinks
  };
}

export async function runE8Reconciliation({ client, apply = false }) {
  const before = await auditE8Schema({ client });
  const plan = await buildReconciliationPlan(client);
  if (apply) {
    await client.$transaction(async (tx) => {
      for (const update of plan.taskPullRequests.updates)
        await tx.task.update({
          where: { id: update.taskId },
          data: { pullRequestId: update.pullRequestId }
        });
      if (plan.artifacts.convertibleCommits.length > 0) {
        await tx.commit.createMany({
          data: plan.artifacts.convertibleCommits.map(
            ({ branch: _legacyBranch, ...commit }) => commit
          ),
          skipDuplicates: true
        });
        for (const item of plan.artifacts.convertibleCommits.filter(({ branch }) => branch)) {
          const branch = await tx.gitBranch.upsert({
            where: { projectId_name: { projectId: item.projectId, name: item.branch } },
            create: {
              projectId: item.projectId,
              name: item.branch,
              lastSeenAt: new Date()
            },
            update: { isActive: true, lastSeenAt: new Date() }
          });
          const commit = await tx.commit.findUnique({
            where: { projectId_hash: { projectId: item.projectId, hash: item.hash } },
            select: { id: true }
          });
          if (commit)
            await tx.commitBranch.upsert({
              where: { commitId_branchId: { commitId: commit.id, branchId: branch.id } },
              create: { commitId: commit.id, branchId: branch.id },
              update: {}
            });
        }
      }
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
      taskPullRequests: plan.taskPullRequests.updates.length,
      githubArtifacts: plan.artifacts.convertibleCommits.length,
      traceLinks: plan.traceLinks.report.pending
    },
    unresolved: {
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
