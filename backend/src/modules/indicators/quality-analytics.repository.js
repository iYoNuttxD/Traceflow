import { prisma } from '../../database/prismaClient.js';
import { loadProjectRequirementIndicatorRows } from '../traceability/requirement-projection.repository.js';

export const qualityAnalyticsRepository = {
  read(projectId, period) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        });
        if (!project) return null;
        const [
          executionResults,
          caseHealth,
          defectStates,
          severities,
          created,
          validated,
          firstValidated,
          legacyValidated,
          retests,
          originTasks,
          requirementRows
        ] = await Promise.all([
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
          tx.defect.groupBy({
            by: ['status'],
            where: { projectId, deletedAt: null },
            _count: { _all: true }
          }),
          tx.defect.groupBy({
            by: ['severity'],
            where: { projectId, deletedAt: null },
            _count: { _all: true }
          }),
          tx.$queryRaw`
              SELECT COALESCE(SUM(deletedAt IS NULL), 0) AS visible,
                COALESCE(SUM(deletedAt IS NOT NULL), 0) AS excluded
              FROM Defect WHERE projectId = ${projectId}
                AND createdAt >= ${period.startInclusive}
                AND createdAt < ${period.endExclusive}
            `,
          tx.$queryRaw`
              SELECT COUNT(DISTINCT CASE WHEN d.deletedAt IS NULL THEN h.defectId END) AS visible,
                COUNT(DISTINCT CASE WHEN d.deletedAt IS NOT NULL THEN h.defectId END) AS excluded
              FROM DefectHistoryEntry h JOIN Defect d ON d.id = h.defectId
              WHERE h.projectId = ${projectId} AND d.projectId = ${projectId}
                AND h.action = 'VALIDATED' AND h.occurredAt >= ${period.startInclusive}
                AND h.occurredAt < ${period.endExclusive}
            `,
          tx.$queryRaw`
              SELECT d.id, d.createdAt, d.deletedAt, MIN(h.occurredAt) AS firstValidatedAt
              FROM Defect d JOIN DefectHistoryEntry h ON h.defectId = d.id
                AND h.projectId = ${projectId} AND h.action = 'VALIDATED'
              WHERE d.projectId = ${projectId}
              GROUP BY d.id, d.createdAt, d.deletedAt
              HAVING firstValidatedAt >= ${period.startInclusive}
                AND firstValidatedAt < ${period.endExclusive}
            `,
          tx.defect.count({
            where: {
              projectId,
              deletedAt: null,
              status: 'VALIDADO',
              history: { none: { action: 'VALIDATED' } }
            }
          }),
          tx.$queryRaw`
              SELECT e.result, d.deletedAt IS NULL AS visible, COUNT(*) AS total
              FROM DefectRetest r JOIN Defect d ON d.id = r.defectId
                JOIN TestExecution e ON e.id = r.testExecutionId
              WHERE d.projectId = ${projectId} AND e.projectId = ${projectId}
                AND e.executedAt >= ${period.startInclusive}
                AND e.executedAt < ${period.endExclusive}
              GROUP BY e.result, visible
            `,
          tx.$queryRaw`
              SELECT t.id AS taskId, t.title, COUNT(DISTINCT dt.defectId) AS defectCount
              FROM DefectTask dt JOIN Defect d ON d.id = dt.defectId
                JOIN Task t ON t.id = dt.taskId
              WHERE d.projectId = ${projectId} AND d.deletedAt IS NULL
                AND t.projectId = ${projectId} AND dt.relationType = 'ORIGIN'
              GROUP BY t.id, t.title ORDER BY defectCount DESC, t.id ASC LIMIT 10
            `,
          loadProjectRequirementIndicatorRows(tx, projectId)
        ]);
        return {
          executionResults,
          caseHealth,
          defectStates,
          severities,
          created: created[0],
          validated: validated[0],
          firstValidated,
          legacyValidated,
          retests,
          originTasks,
          requirementRows
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 }
    );
  }
};
