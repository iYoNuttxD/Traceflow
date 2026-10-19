import { prisma } from '../../database/prismaClient.js';
import { ACQUISITION_MATCH_MS } from './notification-metrics.policy.js';

const DECISIONS_MIGRATION = '20261015120000_notification_decisions';
const GITHUB_EVENTS_MIGRATION = '20261012010000_github_event_notifications';
const ISSUE_LINKS_MIGRATION = '20261017120000_issue_opened_event';
const KEY_CHUNK = 5000;
const decisionSelect = {
  id: true,
  eventKey: true,
  outcome: true,
  occurredAt: true,
  decidedAt: true
};

function chunked(values) {
  const parts = [];
  for (let index = 0; index < values.length; index += KEY_CHUNK)
    parts.push(values.slice(index, index + KEY_CHUNK));
  return parts;
}

const within = ({ start, end }) => ({ gte: start, lt: end });
const around = ({ start, end }) => ({
  gte: new Date(start.getTime() - ACQUISITION_MATCH_MS),
  lte: new Date(end.getTime() + ACQUISITION_MATCH_MS)
});
const linkPeriodSelect = {
  taskId: true,
  issueId: true,
  pullRequestId: true,
  linkedAt: true,
  unlinkedAt: true
};

export const notificationMetricsRepository = {
  async registryStarts() {
    const rows = await prisma.$queryRaw`
      SELECT migration_name AS name, finished_at AS finishedAt FROM _prisma_migrations
      WHERE migration_name IN (${DECISIONS_MIGRATION}, ${GITHUB_EVENTS_MIGRATION}, ${ISSUE_LINKS_MIGRATION})
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const startOf = (name) => rows.find((row) => row.name === name)?.finishedAt ?? null;
    return {
      decisions: startOf(DECISIONS_MIGRATION),
      githubEvents: startOf(GITHUB_EVENTS_MIGRATION),
      issueLinks: startOf(ISSUE_LINKS_MIGRATION)
    };
  },

  async movementIds(projectIds, period) {
    const rows = await prisma.taskMovement.findMany({
      where: { projectId: { in: projectIds }, movedAt: within(period) },
      select: { id: true }
    });
    return rows.map((row) => row.id);
  },

  decisionsInPeriod(type, projectIds, period) {
    return prisma.notificationDecision.findMany({
      where: { type, projectId: { in: projectIds }, occurredAt: within(period) },
      select: decisionSelect
    });
  },

  async decisionsForKeys(type, projectIds, eventKeys) {
    const rows = [];
    for (const keys of chunked(eventKeys))
      rows.push(
        ...(await prisma.notificationDecision.findMany({
          where: { type, projectId: { in: projectIds }, eventKey: { in: keys } },
          select: decisionSelect
        }))
      );
    return rows;
  },

  async overdueTimelines(projectIds) {
    const tasks = await prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [{ deadline: { not: null } }, { historyEntries: { some: { field: 'DEADLINE' } } }]
      },
      select: { id: true, createdAt: true, deadline: true, status: true },
      orderBy: { id: 'asc' }
    });
    const entries = new Map(tasks.map((task) => [task.id, []]));
    for (const taskIds of chunked(tasks.map((task) => task.id)))
      for (const entry of await prisma.taskHistoryEntry.findMany({
        where: { taskId: { in: taskIds }, field: { in: ['STATUS', 'DEADLINE'] } },
        select: { taskId: true, field: true, fromValue: true, toValue: true, occurredAt: true },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }]
      }))
        entries.get(entry.taskId).push(entry);
    return tasks.map((task) => ({ task, entries: entries.get(task.id) }));
  },

  githubEventCoverage(projectIds) {
    return prisma.gitHubEventCoverage.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, coverageFrom: true, comparedBefore: true, completeThrough: true },
      orderBy: { projectId: 'asc' }
    });
  },

  async acquisitionSnapshots(projectIds, period) {
    const pullRequests = await prisma.pullRequest.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [
          { mergedAtGithub: within(period) },
          { mergedAtGithub: null, closedAtGithub: within(period) }
        ]
      },
      select: {
        id: true,
        projectId: true,
        number: true,
        mergedAtGithub: true,
        closedAtGithub: true
      }
    });
    const issues = await prisma.issue.findMany({
      where: { projectId: { in: projectIds }, closedAtGithub: within(period) },
      select: { id: true, projectId: true, number: true, closedAtGithub: true }
    });
    const periods = [];
    const pullRequestEvents = [];
    const issueEvents = [];
    for (const ids of chunked(pullRequests.map((row) => row.id))) {
      periods.push(
        ...(await prisma.taskArtifactLinkPeriod.findMany({
          where: { pullRequestId: { in: ids } },
          select: linkPeriodSelect
        }))
      );
      pullRequestEvents.push(
        ...(await prisma.pullRequestLifecycleEvent.findMany({
          where: {
            pullRequestId: { in: ids },
            eventType: { in: ['MERGED', 'CLOSED'] },
            occurredAt: around(period)
          },
          select: { pullRequestId: true, eventType: true, occurredAt: true }
        }))
      );
    }
    for (const ids of chunked(issues.map((row) => row.id))) {
      periods.push(
        ...(await prisma.taskArtifactLinkPeriod.findMany({
          where: { issueId: { in: ids } },
          select: linkPeriodSelect
        }))
      );
      issueEvents.push(
        ...(await prisma.issueLifecycleEvent.findMany({
          where: { issueId: { in: ids }, eventType: 'CLOSED', occurredAt: around(period) },
          select: { issueId: true, eventType: true, occurredAt: true }
        }))
      );
    }
    return { pullRequests, issues, periods, pullRequestEvents, issueEvents };
  },

  githubEventsInPeriod(projectIds, period) {
    return prisma.gitHubArtifactEvent.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [{ occurredAt: within(period) }, { occurredAt: null, detectedAt: within(period) }]
      },
      select: { type: true, status: true, outcome: true }
    });
  }
};
