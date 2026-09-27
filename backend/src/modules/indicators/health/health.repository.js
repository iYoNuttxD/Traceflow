import { prisma } from '../../../database/prismaClient.js';

// The Dashboard already established project existence and access. These reads
// fetch only health facts, with one consistent snapshot per source group.
export const healthRepository = {
  async planning(projectId, asOf) {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*) AS total,
        COALESCE(SUM(deadline < ${asOf} AND status <> 'CONCLUIDO'), 0) AS overdue,
        COALESCE(SUM(responsibleUserId IS NULL), 0) AS unassigned,
        COALESCE(SUM(estimatedEffort IS NULL), 0) AS withoutEstimate
      FROM Task WHERE projectId = ${projectId}
    `;
    return rows[0];
  },
  flow(projectId, window, asOf, includePlanning) {
    return prisma.$transaction(
      async (tx) => {
        const [tasks, movements, planning] = await Promise.all([
          tx.task.findMany({
            where: { projectId },
            select: { id: true, title: true, status: true, createdAt: true, deadline: true }
          }),
          tx.taskMovement.findMany({
            where: { projectId, movedAt: { lt: window.current.endExclusive } },
            orderBy: [{ taskId: 'asc' }, { movedAt: 'asc' }, { id: 'asc' }],
            select: { id: true, taskId: true, fromStatus: true, toStatus: true, movedAt: true }
          }),
          includePlanning
            ? tx.$queryRaw`
              SELECT COUNT(*) AS total,
                COALESCE(SUM(deadline < ${asOf} AND status <> 'CONCLUIDO'), 0) AS overdue,
                COALESCE(SUM(responsibleUserId IS NULL), 0) AS unassigned,
                COALESCE(SUM(estimatedEffort IS NULL), 0) AS withoutEstimate
              FROM Task WHERE projectId = ${projectId}
            `
            : null
        ]);
        return { tasks, movements, planning: planning?.[0] ?? null };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 }
    );
  },
  quality(projectId, period) {
    return prisma.$transaction(
      async (tx) => {
        const [executionResults, caseHealth, retests] = await Promise.all([
          tx.testExecution.groupBy({
            by: ['result'],
            where: {
              projectId,
              executedAt: { gte: period.startInclusive, lt: period.endExclusive }
            },
            _count: { _all: true }
          }),
          tx.$queryRaw`
            SELECT COALESCE(e.result, 'NEVER_EXECUTED') AS result, COUNT(*) AS total
            FROM TestCase c LEFT JOIN TestExecution e ON e.id = (
              SELECT x.id FROM TestExecution x
              WHERE x.projectId = c.projectId AND x.testCaseId = c.id
                AND x.testCaseVersion = c.currentVersion
              ORDER BY x.executedAt DESC, x.id DESC LIMIT 1
            )
            WHERE c.projectId = ${projectId} AND c.deletedAt IS NULL AND c.status = 'ATIVO'
            GROUP BY e.result
          `,
          tx.$queryRaw`
            SELECT e.result, d.deletedAt IS NULL AS visible, COUNT(*) AS total
            FROM DefectRetest r JOIN Defect d ON d.id = r.defectId
              JOIN TestExecution e ON e.id = r.testExecutionId
            WHERE d.projectId = ${projectId} AND e.projectId = ${projectId}
              AND e.executedAt >= ${period.startInclusive}
              AND e.executedAt < ${period.endExclusive}
            GROUP BY e.result, visible
          `
        ]);
        return { executionResults, caseHealth, retests };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 }
    );
  },
  github(projectId, window, asOf, includeCurrent) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: {
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
        const previousMerged = tx.pullRequest.findMany({
          where: {
            projectId,
            mergedAtGithub: {
              gte: window.previous.startInclusive,
              lt: window.previous.endExclusive
            }
          },
          select: { id: true, createdAtGithub: true, mergedAtGithub: true }
        });
        if (!includeCurrent) return { project, previousMerged: await previousMerged };
        const [currentMerged, cohortRows, ageRows, prior] = await Promise.all([
          tx.pullRequest.findMany({
            where: {
              projectId,
              mergedAtGithub: {
                gte: window.current.startInclusive,
                lt: window.current.endExclusive
              }
            },
            select: { id: true, createdAtGithub: true, mergedAtGithub: true }
          }),
          tx.$queryRaw`
            SELECT COUNT(*) AS closedCount,
              COALESCE(SUM(CASE WHEN EXISTS (
                SELECT 1 FROM PullRequestLifecycleEvent r
                WHERE r.projectId = ${projectId} AND r.pullRequestId = c.pullRequestId
                  AND r.eventType = 'REOPENED' AND r.occurredAt > c.firstClosed
                  AND r.occurredAt < ${window.current.endExclusive}
              ) THEN 1 ELSE 0 END), 0) AS reopenedCount,
              COALESCE(SUM(CASE WHEN EXISTS (
                SELECT 1 FROM PullRequestLifecycleEvent m
                WHERE m.projectId = ${projectId} AND m.pullRequestId = c.pullRequestId
                  AND m.eventType = 'MERGED' AND m.occurredAt < ${window.current.endExclusive}
              ) OR p.mergedAtGithub IS NOT NULL AND p.mergedAtGithub < ${window.current.endExclusive}
                THEN 1 ELSE 0 END), 0) AS mergedCount
            FROM (
              SELECT pullRequestId, MIN(occurredAt) AS firstClosed
              FROM PullRequestLifecycleEvent
              WHERE projectId = ${projectId} AND eventType = 'CLOSED'
                AND occurredAt >= ${window.current.startInclusive}
                AND occurredAt < ${window.current.endExclusive}
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
          previousMerged
        ]);
        return {
          project,
          currentMerged,
          previousMerged: prior,
          cohort: cohortRows[0],
          age: ageRows[0]
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 }
    );
  }
};
