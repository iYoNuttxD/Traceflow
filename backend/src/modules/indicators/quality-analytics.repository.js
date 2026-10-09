import { prisma } from '../../database/prismaClient.js';
import { loadProjectRequirementIndicatorRows } from '../traceability/requirement-projection.repository.js';

export const qualityAnalyticsRepository = {
  readDefectStates(projectId) {
    return prisma.$transaction(
      async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true }
        });
        if (!project) return null;
        return tx.defect.groupBy({
          by: ['status'],
          where: { projectId, deletedAt: null },
          _count: { _all: true }
        });
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 5000 }
    );
  },
  read(
    projectId,
    period,
    { requestedIds = null, sharedProjection = false, sharedCaseHealth } = {}
  ) {
    const needs = (...ids) => !requestedIds || ids.some((id) => requestedIds.includes(id));
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
          needs('I48', 'I49', 'I50', 'I51')
            ? tx.testExecution.groupBy({
                by: ['result'],
                where: {
                  projectId,
                  executedAt: { gte: period.startInclusive, lt: period.endExclusive }
                },
                _count: { _all: true }
              })
            : [],
          needs('I52')
            ? (sharedCaseHealth ??
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
            `)
            : [],
          needs('I53')
            ? tx.defect.groupBy({
                by: ['status'],
                where: { projectId, deletedAt: null },
                _count: { _all: true }
              })
            : [],
          needs('I54')
            ? tx.defect.groupBy({
                by: ['severity'],
                where: { projectId, deletedAt: null },
                _count: { _all: true }
              })
            : [],
          needs('I55')
            ? tx.$queryRaw`
              SELECT COALESCE(SUM(deletedAt IS NULL), 0) AS visible,
                COALESCE(SUM(deletedAt IS NOT NULL), 0) AS excluded
              FROM Defect WHERE projectId = ${projectId}
                AND createdAt >= ${period.startInclusive}
                AND createdAt < ${period.endExclusive}
            `
            : [{ visible: 0, excluded: 0 }],
          needs('I56')
            ? tx.$queryRaw`
              SELECT COUNT(DISTINCT CASE WHEN d.deletedAt IS NULL THEN h.defectId END) AS visible,
                COUNT(DISTINCT CASE WHEN d.deletedAt IS NOT NULL THEN h.defectId END) AS excluded
              FROM DefectHistoryEntry h JOIN Defect d ON d.id = h.defectId
              WHERE h.projectId = ${projectId} AND d.projectId = ${projectId}
                AND h.action = 'VALIDATED' AND h.occurredAt >= ${period.startInclusive}
                AND h.occurredAt < ${period.endExclusive}
            `
            : [{ visible: 0, excluded: 0 }],
          needs('I57')
            ? tx.$queryRaw`
              SELECT d.id, d.createdAt, d.deletedAt, MIN(h.occurredAt) AS firstValidatedAt
              FROM Defect d JOIN DefectHistoryEntry h ON h.defectId = d.id
                AND h.projectId = ${projectId} AND h.action = 'VALIDATED'
              WHERE d.projectId = ${projectId}
              GROUP BY d.id, d.createdAt, d.deletedAt
              HAVING firstValidatedAt >= ${period.startInclusive}
                AND firstValidatedAt < ${period.endExclusive}
            `
            : [],
          needs('I56', 'I57')
            ? tx.defect.count({
                where: {
                  projectId,
                  deletedAt: null,
                  status: 'VALIDADO',
                  history: { none: { action: 'VALIDATED' } }
                }
              })
            : 0,
          needs('I58')
            ? tx.$queryRaw`
              SELECT e.result, d.deletedAt IS NULL AS visible, COUNT(*) AS total
              FROM DefectRetest r JOIN Defect d ON d.id = r.defectId
                JOIN TestExecution e ON e.id = r.testExecutionId
              WHERE d.projectId = ${projectId} AND e.projectId = ${projectId}
                AND e.executedAt >= ${period.startInclusive}
                AND e.executedAt < ${period.endExclusive}
              GROUP BY e.result, visible
            `
            : [],
          needs('I60')
            ? tx.$queryRaw`
              SELECT t.id AS taskId, t.title, COUNT(DISTINCT dt.defectId) AS defectCount
              FROM DefectTask dt JOIN Defect d ON d.id = dt.defectId
                JOIN Task t ON t.id = dt.taskId
              WHERE d.projectId = ${projectId} AND d.deletedAt IS NULL
                AND t.projectId = ${projectId} AND dt.relationType = 'ORIGIN'
              GROUP BY t.id, t.title ORDER BY defectCount DESC, t.id ASC LIMIT 10
            `
            : [],
          needs('I59') && !sharedProjection
            ? loadProjectRequirementIndicatorRows(tx, projectId)
            : []
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
      { isolationLevel: 'RepeatableRead', maxWait: 2000, timeout: 30000 }
    );
  }
};
