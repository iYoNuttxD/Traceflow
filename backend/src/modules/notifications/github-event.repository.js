import { prisma } from '../../database/prismaClient.js';
import {
  MAX_DISPATCH_ATTEMPTS,
  issueTransition,
  nextAttemptAfterFailure,
  occurrenceKey,
  pullRequestStateAnomaly,
  pullRequestTransition,
  safeGithubUrl,
  snapshotArtifactTitle,
  taskParticipants
} from './github-event.policy.js';

const ISSUE = 'ISSUE';
const PULL_REQUEST = 'PULL_REQUEST';
const transitionOf = new Map([
  [ISSUE, issueTransition],
  [PULL_REQUEST, pullRequestTransition]
]);
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

function groupTaskIds(pairs) {
  const grouped = new Map();
  for (const [artifactId, taskId] of pairs) {
    if (!grouped.has(artifactId)) grouped.set(artifactId, new Set());
    grouped.get(artifactId).add(taskId);
  }
  return new Map(
    [...grouped].map(([artifactId, taskIds]) => [
      artifactId,
      [...taskIds].sort((left, right) => left - right)
    ])
  );
}

async function linkedTaskIds(tx, projectId, kind, artifactIds) {
  if (kind === ISSUE) {
    const rows = await tx.taskIssue.findMany({
      where: { issueId: { in: artifactIds }, task: { projectId } },
      select: { issueId: true, taskId: true }
    });
    return groupTaskIds(rows.map((row) => [row.issueId, row.taskId]));
  }
  const rows = await tx.task.findMany({
    where: { projectId, pullRequestId: { in: artifactIds } },
    select: { id: true, pullRequestId: true }
  });
  return groupTaskIds(rows.map((row) => [row.pullRequestId, row.id]));
}

function transitionsOf(kind, previous, incoming) {
  const detect = transitionOf.get(kind);
  const latest = new Map(incoming.map((item) => [item.githubId, item]));
  const candidates = [];
  let anomalies = 0;
  for (const [githubId, item] of latest) {
    const before = previous.get(githubId);
    if (!before) continue;
    if (kind === PULL_REQUEST && pullRequestStateAnomaly(before, item)) anomalies += 1;
    const transition = detect(before, item);
    if (transition) candidates.push({ artifactId: before.id, item, ...transition });
  }
  return { candidates, anomalies };
}

export const githubEventRepository = {
  async recordTransitions(tx, { projectId, kind, previous, incoming, detectedAt }) {
    const { candidates, anomalies } = transitionsOf(kind, previous, incoming);
    const empty = { transitions: 0, linkedTasks: 0, anomalies };
    if (!candidates.length) return empty;

    const tasksByArtifact = await linkedTaskIds(
      tx,
      projectId,
      kind,
      candidates.map((candidate) => candidate.artifactId)
    );
    const linked = candidates
      .filter((candidate) => tasksByArtifact.has(candidate.artifactId))
      .map((candidate) => ({ ...candidate, key: occurrenceKey({ ...candidate, detectedAt }) }));
    if (!linked.length) return empty;

    const recorded = await tx.gitHubArtifactEvent.findMany({
      where: { projectId, occurrenceKey: { in: linked.map((candidate) => candidate.key) } },
      select: { occurrenceKey: true }
    });
    const known = new Set(recorded.map((row) => row.occurrenceKey));
    const fresh = [];
    for (const candidate of linked)
      if (!known.has(candidate.key)) {
        known.add(candidate.key);
        fresh.push(candidate);
      }
    if (!fresh.length) return empty;

    await tx.gitHubArtifactEvent.createMany({
      data: fresh.map((candidate) => ({
        projectId,
        type: candidate.type,
        issueId: kind === ISSUE ? candidate.artifactId : null,
        pullRequestId: kind === PULL_REQUEST ? candidate.artifactId : null,
        artifactNumber: candidate.item.number,
        artifactTitle: snapshotArtifactTitle(candidate.item.title),
        artifactUrl: safeGithubUrl(candidate.item.githubUrl),
        occurredAt: candidate.occurredAt,
        detectedAt,
        nextAttemptAt: detectedAt,
        linkedTaskCount: tasksByArtifact.get(candidate.artifactId).length,
        occurrenceKey: candidate.key
      }))
    });
    const created = await tx.gitHubArtifactEvent.findMany({
      where: { projectId, occurrenceKey: { in: fresh.map((candidate) => candidate.key) } },
      select: { id: true, occurrenceKey: true }
    });
    const eventIdOf = new Map(created.map((row) => [row.occurrenceKey, row.id]));
    const targets = fresh.flatMap((candidate) =>
      tasksByArtifact
        .get(candidate.artifactId)
        .map((taskId) => ({ eventId: eventIdOf.get(candidate.key), taskId }))
    );
    await tx.gitHubArtifactEventTask.createMany({ data: targets });
    return { transitions: fresh.length, linkedTasks: targets.length, anomalies };
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
