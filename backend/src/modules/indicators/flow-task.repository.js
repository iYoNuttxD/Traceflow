import { prisma } from '../../database/prismaClient.js';
import { taskDeadlineCutoff } from './policies/task-deadline.policy.js';

// One consistent read; current aggregates stay in SQL while history is fetched once.
export const flowTaskRepository = {
  read(
    projectId,
    period,
    asOf,
    {
      currentSummaryOnly = false,
      historyOnly = false,
      requestedIds = null,
      timeZone = period?.timeZone ?? 'UTC'
    } = {}
  ) {
    const needs = (id) => requestedIds == null || requestedIds.includes(id);
    const deadlineCutoff = taskDeadlineCutoff(asOf, timeZone);
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        });
        if (!project) return null;
        const [aggregateRows, statuses, tasks, movements, overdue, above, below] =
          await Promise.all([
            historyOnly
              ? [{ total: 0 }]
              : tx.$queryRaw`
              SELECT COUNT(*) AS total,
                COALESCE(SUM(status = 'EM_ANDAMENTO'), 0) AS wip,
                COALESCE(SUM(deadline < ${deadlineCutoff} AND status <> 'CONCLUIDO'), 0) AS overdue,
                COALESCE(SUM(responsibleUserId IS NULL), 0) AS unassigned,
                COALESCE(SUM(estimatedEffort IS NULL), 0) AS withoutEstimate,
                COUNT(estimatedEffort) AS withEstimate,
                SUM(estimatedEffort) AS estimatedHours,
                COUNT(actualEffort) AS withActual,
                SUM(actualEffort) AS actualHours,
                COALESCE(SUM(estimatedEffort IS NOT NULL AND actualEffort IS NOT NULL), 0) AS comparable,
                COALESCE(SUM(status = 'CONCLUIDO' AND estimatedEffort IS NOT NULL AND actualEffort IS NOT NULL), 0) AS completedComparable,
                COALESCE(SUM(status = 'CONCLUIDO' AND estimatedEffort IS NOT NULL), 0) AS completedWithEstimate,
                SUM(CASE WHEN estimatedEffort IS NOT NULL AND actualEffort IS NOT NULL
                  THEN actualEffort - estimatedEffort ELSE NULL END) AS differenceHours,
                COALESCE(SUM(estimatedEffort IS NOT NULL AND actualEffort IS NOT NULL
                  AND actualEffort > estimatedEffort), 0) AS above,
                COALESCE(SUM(status = 'CONCLUIDO' AND estimatedEffort IS NOT NULL
                  AND actualEffort IS NOT NULL AND actualEffort < estimatedEffort), 0) AS below
              FROM Task WHERE projectId = ${projectId}
            `,
            historyOnly || (requestedIds && !needs('I27') && !needs('I01'))
              ? []
              : tx.task.groupBy({
                  by: ['status'],
                  where: { projectId },
                  _count: { _all: true }
                }),
            currentSummaryOnly
              ? []
              : tx.task.findMany({
                  where: { projectId },
                  select: {
                    id: true,
                    title: needs('I24'),
                    status: true,
                    createdAt: true,
                    deadline: needs('I24'),
                    responsibleUser: needs('I24')
                      ? {
                          select: {
                            id: true,
                            name: true,
                            isActive: true,
                            accountStatus: true,
                            anonymizedAt: true
                          }
                        }
                      : false
                  }
                }),
            currentSummaryOnly
              ? []
              : tx.taskMovement.findMany({
                  where: { projectId, movedAt: { lt: asOf } },
                  orderBy: [{ taskId: 'asc' }, { movedAt: 'asc' }, { id: 'asc' }],
                  select: {
                    id: true,
                    taskId: true,
                    fromStatus: true,
                    toStatus: true,
                    movedAt: true
                  }
                }),
            historyOnly || !needs('I28')
              ? []
              : tx.$queryRaw`
              SELECT t.id, t.title, t.status, t.deadline,
                u.id AS responsibleUserId, u.name AS responsibleName
              FROM Task t LEFT JOIN User u ON u.id = t.responsibleUserId
                AND u.isActive = TRUE AND u.accountStatus = 'ACTIVE' AND u.anonymizedAt IS NULL
              WHERE t.projectId = ${projectId} AND t.deadline < ${deadlineCutoff}
                AND t.status <> 'CONCLUIDO'
              ORDER BY t.deadline ASC, t.id ASC LIMIT 10
            `,
            historyOnly || (currentSummaryOnly && requestedIds == null) || !needs('I34')
              ? []
              : tx.$queryRaw`
              SELECT t.id, t.title, t.status, t.estimatedEffort, t.actualEffort,
                u.id AS responsibleUserId, u.name AS responsibleName
              FROM Task t LEFT JOIN User u ON u.id = t.responsibleUserId
                AND u.isActive = TRUE AND u.accountStatus = 'ACTIVE' AND u.anonymizedAt IS NULL
              WHERE t.projectId = ${projectId} AND t.estimatedEffort IS NOT NULL
                AND t.actualEffort IS NOT NULL AND t.actualEffort > t.estimatedEffort
              ORDER BY (t.actualEffort - t.estimatedEffort) DESC, t.id ASC LIMIT 10
            `,
            historyOnly || (currentSummaryOnly && requestedIds == null) || !needs('I35')
              ? []
              : tx.$queryRaw`
              SELECT t.id, t.title, t.status, t.estimatedEffort, t.actualEffort,
                u.id AS responsibleUserId, u.name AS responsibleName
              FROM Task t LEFT JOIN User u ON u.id = t.responsibleUserId
                AND u.isActive = TRUE AND u.accountStatus = 'ACTIVE' AND u.anonymizedAt IS NULL
              WHERE t.projectId = ${projectId} AND t.status = 'CONCLUIDO'
                AND t.estimatedEffort IS NOT NULL AND t.actualEffort IS NOT NULL
                AND t.actualEffort < t.estimatedEffort
              ORDER BY (t.estimatedEffort - t.actualEffort) DESC, t.id ASC LIMIT 10
            `
          ]);
        return {
          asOf,
          aggregate: aggregateRows[0],
          statuses,
          tasks,
          movements,
          overdue,
          above,
          below
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 30000 }
    );
  }
};
