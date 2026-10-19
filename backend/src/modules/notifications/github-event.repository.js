import { prisma } from '../../database/prismaClient.js';
import {
  MAX_DISPATCH_ATTEMPTS,
  completeThroughOf,
  issueEventTypeOf,
  lifecycleOccurrenceKey,
  linkedOccurrenceKey,
  linkedTasksAt,
  mergeClosingsOf,
  nextAttemptAfterFailure,
  normalizeIssueState,
  pullRequestEventTypeOf,
  safeGithubUrl,
  snapshotArtifactTitle,
  taskParticipants
} from './github-event.policy.js';

const unique = (values) => [...new Set(values)];
const released = { claimToken: null, claimedUntil: null };
const eventSelect = {
  id: true,
  projectId: true,
  type: true,
  artifactNumber: true,
  artifactTitle: true,
  artifactUrl: true,
  occurredAt: true,
  detectedAt: true,
  linkedTaskCount: true,
  attempts: true,
  targets: { select: { taskId: true }, orderBy: { taskId: 'asc' } }
};
const periodSelect = {
  taskId: true,
  issueId: true,
  pullRequestId: true,
  linkedAt: true,
  unlinkedAt: true
};

const scopeOf = (projectId) => (projectId ? { projectId } : {});

function dueWhere(now) {
  return {
    OR: [
      { status: 'PENDING', nextAttemptAt: { lte: now } },
      {
        status: 'PROCESSING',
        claimedUntil: { lt: now },
        attempts: { lt: MAX_DISPATCH_ATTEMPTS }
      }
    ]
  };
}

function idsByTask(rows, userField) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.taskId)) grouped.set(row.taskId, []);
    grouped.get(row.taskId).push(row[userField]);
  }
  return grouped;
}

async function mergeClosings(tx, projectId, pullRequests) {
  const closedIds = unique(
    pullRequests.filter((event) => event.eventType === 'CLOSED').map((event) => event.artifact.id)
  );
  const absorbed = new Set();
  if (!closedIds.length) return absorbed;
  const history = await tx.pullRequestLifecycleEvent.findMany({
    where: { projectId, pullRequestId: { in: closedIds } },
    select: { pullRequestId: true, eventType: true, occurredAt: true, providerEventId: true }
  });
  const snapshots = new Map(
    pullRequests.map((event) => [event.artifact.id, event.artifact.mergedAtGithub])
  );
  for (const id of closedIds)
    for (const key of mergeClosingsOf(
      history.filter((row) => row.pullRequestId === id),
      snapshots.get(id)
    ))
      absorbed.add(key);
  return absorbed;
}

function candidatesOf({ issues, pullRequests, absorbed, from }) {
  return [
    ...issues.map((event) => ({
      event,
      type: issueEventTypeOf(event.eventType),
      issueId: event.artifact.id,
      pullRequestId: null
    })),
    ...pullRequests.map((event) => ({
      event,
      type: pullRequestEventTypeOf(event, absorbed),
      issueId: null,
      pullRequestId: event.artifact.id
    }))
  ].filter((candidate) => candidate.type && candidate.event.occurredAt.getTime() >= from);
}

function linkPeriodsWhere(projectId, candidates) {
  const issueIds = unique(candidates.map((candidate) => candidate.issueId).filter(Boolean));
  const pullRequestIds = unique(
    candidates.map((candidate) => candidate.pullRequestId).filter(Boolean)
  );
  return {
    projectId,
    AND: [
      {
        OR: [
          ...(issueIds.length ? [{ issueId: { in: issueIds } }] : []),
          ...(pullRequestIds.length ? [{ pullRequestId: { in: pullRequestIds } }] : [])
        ]
      },
      { OR: [{ taskId: null }, { task: { projectId } }] }
    ]
  };
}

export const githubEventRepository = {
  ensureCoverage(projectId, readStartedAt) {
    return prisma.gitHubEventCoverage.upsert({
      where: { projectId },
      create: { projectId, coverageFrom: readStartedAt },
      update: {}
    });
  },

  async advanceCoverage(tx, projectId, readStartedAt) {
    const through = completeThroughOf(readStartedAt);
    await tx.gitHubEventCoverage.updateMany({
      where: { projectId, OR: [{ completeThrough: null }, { completeThrough: { lt: through } }] },
      data: { completeThrough: through }
    });
  },

  async recordIssueLinked(tx, { projectId, taskId, issue, detectedAt }) {
    if (normalizeIssueState(issue.state) !== 'OPEN') return 0;
    const occurrenceKey = linkedOccurrenceKey(issue.id, taskId);
    const inserted = await tx.gitHubArtifactEvent.createMany({
      data: [
        {
          projectId,
          type: 'ISSUE_LINKED',
          issueId: issue.id,
          pullRequestId: null,
          artifactNumber: issue.number,
          artifactTitle: snapshotArtifactTitle(issue.title),
          artifactUrl: safeGithubUrl(issue.githubUrl),
          occurredAt: detectedAt,
          detectedAt,
          nextAttemptAt: detectedAt,
          linkedTaskCount: 1,
          occurrenceKey
        }
      ],
      skipDuplicates: true
    });
    if (!inserted.count) return 0;
    const event = await tx.gitHubArtifactEvent.findUnique({
      where: { projectId_occurrenceKey: { projectId, occurrenceKey } },
      select: { id: true }
    });
    await tx.gitHubArtifactEventTask.create({ data: { eventId: event.id, taskId } });
    return 1;
  },

  async recordFromLifecycle(tx, { projectId, issues = [], pullRequests = [], detectedAt }) {
    if (!issues.length && !pullRequests.length) return 0;
    const coverage = await tx.gitHubEventCoverage.findUnique({
      where: { projectId },
      select: { coverageFrom: true }
    });
    const from = (coverage?.coverageFrom ?? detectedAt).getTime();
    const absorbed = await mergeClosings(tx, projectId, pullRequests);
    const candidates = candidatesOf({ issues, pullRequests, absorbed, from });
    if (!candidates.length) return 0;

    const periods = await tx.taskArtifactLinkPeriod.findMany({
      where: linkPeriodsWhere(projectId, candidates),
      select: periodSelect
    });
    const linked = candidates
      .map((candidate) => ({
        ...candidate,
        link: linkedTasksAt(
          periods.filter((period) =>
            candidate.issueId
              ? period.issueId === candidate.issueId
              : period.pullRequestId === candidate.pullRequestId
          ),
          candidate.event.occurredAt
        ),
        key: lifecycleOccurrenceKey(candidate.event.providerEventId)
      }))
      .filter((candidate) => candidate.link.count > 0);
    if (!linked.length) return 0;

    await tx.gitHubArtifactEvent.createMany({
      data: linked.map((candidate) => ({
        projectId,
        type: candidate.type,
        issueId: candidate.issueId,
        pullRequestId: candidate.pullRequestId,
        artifactNumber: candidate.event.artifact.number,
        artifactTitle: snapshotArtifactTitle(candidate.event.artifact.title),
        artifactUrl: safeGithubUrl(candidate.event.artifact.githubUrl),
        occurredAt: candidate.event.occurredAt,
        detectedAt,
        nextAttemptAt: detectedAt,
        linkedTaskCount: candidate.link.count,
        occurrenceKey: candidate.key
      })),
      skipDuplicates: true
    });
    const created = await tx.gitHubArtifactEvent.findMany({
      where: { projectId, occurrenceKey: { in: linked.map((candidate) => candidate.key) } },
      select: { id: true, occurrenceKey: true }
    });
    const eventIdOf = new Map(created.map((row) => [row.occurrenceKey, row.id]));
    const targets = linked.flatMap((candidate) =>
      candidate.link.taskIds.map((taskId) => ({ eventId: eventIdOf.get(candidate.key), taskId }))
    );
    if (targets.length)
      await tx.gitHubArtifactEventTask.createMany({ data: targets, skipDuplicates: true });
    return linked.length;
  },

  findDueEventIds({ projectId = null, now, limit, exclude = [] }) {
    return prisma.gitHubArtifactEvent.findMany({
      where: {
        ...scopeOf(projectId),
        ...dueWhere(now),
        ...(exclude.length ? { id: { notIn: exclude } } : {})
      },
      select: { id: true, projectId: true },
      orderBy: { id: 'asc' },
      take: limit
    });
  },

  async failInterrupted({ projectId = null, now }) {
    const result = await prisma.gitHubArtifactEvent.updateMany({
      where: {
        ...scopeOf(projectId),
        status: 'PROCESSING',
        claimedUntil: { lt: now },
        attempts: { gte: MAX_DISPATCH_ATTEMPTS }
      },
      data: { status: 'FAILED', lastErrorCode: 'DISPATCH_INTERRUPTED', ...released }
    });
    return result.count;
  },

  async claim(eventId, { token, now, claimedUntil }) {
    const result = await prisma.gitHubArtifactEvent.updateMany({
      where: { id: eventId, ...dueWhere(now) },
      data: {
        status: 'PROCESSING',
        claimToken: token,
        claimedUntil,
        attempts: { increment: 1 }
      }
    });
    return result.count === 1;
  },

  findClaimed(eventId, token) {
    return prisma.gitHubArtifactEvent.findFirst({
      where: { id: eventId, claimToken: token },
      select: eventSelect
    });
  },

  findForPreview(eventId) {
    return prisma.gitHubArtifactEvent.findUnique({ where: { id: eventId }, select: eventSelect });
  },

  async participationOf(projectId, taskIds) {
    if (!taskIds.length) return new Map();
    const [tasks, comments, efforts] = await Promise.all([
      prisma.task.findMany({
        where: { projectId, id: { in: taskIds } },
        select: { id: true, title: true, responsibleUserId: true }
      }),
      prisma.taskComment.findMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        select: { taskId: true, authorUserId: true },
        distinct: ['taskId', 'authorUserId']
      }),
      prisma.taskTimeEntry.findMany({
        where: { taskId: { in: taskIds } },
        select: { taskId: true, startedById: true },
        distinct: ['taskId', 'startedById']
      })
    ]);
    const authors = idsByTask(comments, 'authorUserId');
    const workers = idsByTask(efforts, 'startedById');
    return new Map(
      tasks.map((task) => [
        task.id,
        {
          title: task.title,
          participants: taskParticipants({
            responsibleUserId: task.responsibleUserId,
            commentAuthorIds: authors.get(task.id) ?? [],
            effortUserIds: workers.get(task.id) ?? []
          })
        }
      ])
    );
  },

  async preferencesOf(userIds, type) {
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: { in: unique(userIds) }, type },
      select: { userId: true, enabled: true, enabledAt: true }
    });
    return new Map(
      rows.map((row) => [row.userId, { enabled: row.enabled, enabledAt: row.enabledAt }])
    );
  },

  async persistedKeys(rows) {
    if (!rows.length) return new Set();
    const found = await prisma.notification.findMany({
      where: {
        recipientUserId: { in: unique(rows.map((row) => row.recipientUserId)) },
        dedupeKey: { in: unique(rows.map((row) => row.dedupeKey)) }
      },
      select: { recipientUserId: true, dedupeKey: true }
    });
    return new Set(found.map((row) => `${row.recipientUserId}|${row.dedupeKey}`));
  },

  async insertNotifications(rows) {
    if (!rows.length) return 0;
    const result = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  },

  async existingTaskIds(taskIds) {
    if (!taskIds.length) return new Set();
    const rows = await prisma.task.findMany({
      where: { id: { in: unique(taskIds) } },
      select: { id: true }
    });
    return new Set(rows.map((row) => row.id));
  },

  async finish(eventId, token, { outcome, now }) {
    const result = await prisma.gitHubArtifactEvent.updateMany({
      where: { id: eventId, claimToken: token },
      data: { status: 'DISPATCHED', dispatchedAt: now, outcome, lastErrorCode: null, ...released }
    });
    return result.count === 1;
  },

  async release(eventId, token, { now, errorCode }) {
    const event = await prisma.gitHubArtifactEvent.findFirst({
      where: { id: eventId, claimToken: token },
      select: { attempts: true }
    });
    if (!event) return { state: 'LOST', attempts: null };
    const nextAttemptAt = nextAttemptAfterFailure(event.attempts, now);
    const result = await prisma.gitHubArtifactEvent.updateMany({
      where: { id: eventId, claimToken: token },
      data: nextAttemptAt
        ? { status: 'PENDING', nextAttemptAt, lastErrorCode: errorCode, ...released }
        : { status: 'FAILED', lastErrorCode: errorCode, ...released }
    });
    if (result.count !== 1) return { state: 'LOST', attempts: event.attempts };
    return { state: nextAttemptAt ? 'RETRY' : 'FAILED', attempts: event.attempts };
  },

  countFailed({ projectId = null }) {
    return prisma.gitHubArtifactEvent.count({ where: { ...scopeOf(projectId), status: 'FAILED' } });
  },

  async requeueFailed({ projectId = null, now }) {
    const result = await prisma.gitHubArtifactEvent.updateMany({
      where: { ...scopeOf(projectId), status: 'FAILED' },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: now, lastErrorCode: null }
    });
    return result.count;
  },

  async queueSummary({ projectId = null, now }) {
    const scope = scopeOf(projectId);
    const [pending, due, oldestPending, oldestProcessing] = await Promise.all([
      prisma.gitHubArtifactEvent.count({
        where: { ...scope, status: { in: ['PENDING', 'PROCESSING'] } }
      }),
      prisma.gitHubArtifactEvent.count({ where: { ...scope, ...dueWhere(now) } }),
      prisma.gitHubArtifactEvent.findFirst({
        where: { ...scope, status: 'PENDING', nextAttemptAt: { lte: now } },
        orderBy: { nextAttemptAt: 'asc' },
        select: { nextAttemptAt: true }
      }),
      prisma.gitHubArtifactEvent.findFirst({
        where: {
          ...scope,
          status: 'PROCESSING',
          claimedUntil: { lt: now },
          attempts: { lt: MAX_DISPATCH_ATTEMPTS }
        },
        orderBy: { claimedUntil: 'asc' },
        select: { claimedUntil: true }
      })
    ]);
    const dueSince = [oldestPending?.nextAttemptAt, oldestProcessing?.claimedUntil]
      .filter(Boolean)
      .sort((left, right) => left - right);
    return { pending, due, oldestDueAt: dueSince[0] ?? null };
  },

  async isActiveProject(projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true }
    });
    return Boolean(project);
  }
};
