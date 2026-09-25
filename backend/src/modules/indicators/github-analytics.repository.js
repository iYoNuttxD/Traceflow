import { prisma } from '../../database/prismaClient.js';

// One consistent snapshot, with set-based aggregates and bounded public list.
export const githubAnalyticsRepository = {
  read(projectId, period) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: {
            id: true,
            githubIntegration: {
              select: {
                status: true,
                lastSyncAt: true,
                lastSyncStatus: true,
                pullRequestLifecycleCoverageFrom: true,
                pullRequestLifecycleSyncedAt: true
              }
            }
          }
        });
        if (!project) return null;
        const asOf = new Date();
        const [commits, openPrs, openIssues, mergedPrs, closedIssues, cohort, ageRows, oldestPrs] =
          await Promise.all([
            tx.commit.count({
              where: { projectId, date: { gte: period.startInclusive, lt: period.endExclusive } }
            }),
            tx.pullRequest.count({ where: { projectId, state: 'open' } }),
            tx.issue.count({ where: { projectId, state: 'open' } }),
            tx.pullRequest.findMany({
              where: {
                projectId,
                mergedAtGithub: { gte: period.startInclusive, lt: period.endExclusive }
              },
              select: { id: true, createdAtGithub: true, mergedAtGithub: true }
            }),
            tx.issue.findMany({
              where: {
                projectId,
                state: 'closed',
                closedAtGithub: { gte: period.startInclusive, lt: period.endExclusive }
              },
              select: { id: true, createdAtGithub: true, closedAtGithub: true }
            }),
            tx.$queryRaw`
              SELECT COUNT(*) AS closedCount,
                COALESCE(SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM PullRequestLifecycleEvent r
                  WHERE r.projectId = ${projectId} AND r.pullRequestId = c.pullRequestId
                    AND r.eventType = 'REOPENED' AND r.occurredAt > c.firstClosed
                    AND r.occurredAt < ${period.endExclusive}
                ) THEN 1 ELSE 0 END), 0) AS reopenedCount,
                COALESCE(SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM PullRequestLifecycleEvent m
                  WHERE m.projectId = ${projectId} AND m.pullRequestId = c.pullRequestId
                    AND m.eventType = 'MERGED' AND m.occurredAt < ${period.endExclusive}
                ) OR p.mergedAtGithub IS NOT NULL AND p.mergedAtGithub < ${period.endExclusive}
                  THEN 1 ELSE 0 END), 0) AS mergedCount
              FROM (
                SELECT pullRequestId, MIN(occurredAt) AS firstClosed
                FROM PullRequestLifecycleEvent
                WHERE projectId = ${projectId} AND eventType = 'CLOSED'
                  AND occurredAt >= ${period.startInclusive}
                  AND occurredAt < ${period.endExclusive}
                GROUP BY pullRequestId
              ) c
              JOIN PullRequest p ON p.id = c.pullRequestId AND p.projectId = ${projectId}
            `,
            tx.$queryRaw`
              SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN createdAtGithub IS NOT NULL AND createdAtGithub <= ${asOf}
                  THEN 1 ELSE 0 END), 0) AS eligible,
                COALESCE(SUM(CASE WHEN createdAtGithub IS NOT NULL AND createdAtGithub <= ${asOf}
                  THEN TIMESTAMPDIFF(MICROSECOND, createdAtGithub, ${asOf}) / 86400000000
                  ELSE 0 END), 0) AS totalDays
              FROM PullRequest WHERE projectId = ${projectId} AND state = 'open'
            `,
            tx.pullRequest.findMany({
              where: { projectId, state: 'open', createdAtGithub: { lte: asOf } },
              orderBy: [{ createdAtGithub: 'asc' }, { id: 'asc' }],
              take: 10,
              select: {
                id: true,
                number: true,
                title: true,
                githubUrl: true,
                createdAtGithub: true
              }
            })
          ]);
        return {
          project,
          asOf,
          commits,
          openPrs,
          openIssues,
          mergedPrs,
          closedIssues,
          cohort: cohort[0],
          age: ageRows[0],
          oldestPrs
        };
      },
      { isolationLevel: 'RepeatableRead' }
    );
  }
};
