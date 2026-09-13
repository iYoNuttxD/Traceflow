import { Prisma } from '@prisma/client';

// Scalar aggregates only: no Task/TestCase/Defect/Execution payload leaves this query.
// The caller bounds requirementIds; situation/lifecycle decisions remain in the policy.
export async function readProjectionMetrics(client, projectId, requirementIds) {
  return client.$queryRaw`
    WITH selected_requirements AS (
      SELECT id FROM Requirement WHERE projectId=${projectId} AND id IN (${Prisma.join(requirementIds)})
    ), task_metrics AS (
      SELECT t.requirementId, COUNT(*) AS tasksTotal,
        SUM(t.status='CONCLUIDO') AS tasksDone, SUM(t.status='EM_ANDAMENTO') AS tasksInProgress,
        MAX(t.pullRequestId IS NOT NULL OR EXISTS(SELECT 1 FROM TaskCommit tc WHERE tc.taskId=t.id)) AS technicalEvidence
      FROM Task t JOIN selected_requirements r ON r.id=t.requirementId
      WHERE t.projectId=${projectId} GROUP BY t.requirementId
    ), case_links AS (
      SELECT c.id AS caseId, c.requirementId FROM TestCase c
      JOIN selected_requirements r ON r.id=c.requirementId
      WHERE c.projectId=${projectId} AND c.deletedAt IS NULL AND c.status='ATIVO'
      UNION
      SELECT c.id AS caseId, t.requirementId FROM TestCase c
      JOIN TestCaseTask ct ON ct.testCaseId=c.id JOIN Task t ON t.id=ct.taskId
      JOIN selected_requirements r ON r.id=t.requirementId
      WHERE c.projectId=${projectId} AND t.projectId=${projectId} AND c.deletedAt IS NULL AND c.status='ATIVO'
    ), validation_metrics AS (
      SELECT l.requirementId, COUNT(*) AS testCasesTotal,
        SUM(e.id IS NULL) AS neverExecuted, SUM(e.result='PASS') AS passed,
        SUM(e.result='FAIL') AS failed, SUM(e.result='BLOCKED') AS blocked,
        MAX(e.result='FAIL' AND (
          NOT EXISTS(SELECT 1 FROM TestExecutionStep s WHERE s.executionId=e.id AND s.result='FAIL')
          OR EXISTS(SELECT 1 FROM TestExecutionStep s WHERE s.executionId=e.id AND s.result='FAIL'
            AND NOT EXISTS(SELECT 1 FROM Defect d WHERE d.detectedExecutionStepId=s.id
              AND d.projectId=${projectId} AND d.deletedAt IS NULL))
        )) AS untreatedFailure
      FROM case_links l JOIN TestCase c ON c.id=l.caseId
      LEFT JOIN TestExecution e ON e.id=(
        SELECT x.id FROM TestExecution x WHERE x.testCaseId=c.id AND x.projectId=c.projectId
          AND x.testCaseVersion=c.currentVersion ORDER BY x.executedAt DESC, x.id DESC LIMIT 1
      ) GROUP BY l.requirementId
    ), defect_links AS (
      SELECT d.id AS defectId, d.requirementId FROM Defect d
      JOIN selected_requirements r ON r.id=d.requirementId
      WHERE d.projectId=${projectId} AND d.deletedAt IS NULL
      UNION
      SELECT d.id AS defectId, t.requirementId FROM Defect d
      JOIN DefectTask dt ON dt.defectId=d.id AND dt.relationType='ORIGIN'
      JOIN Task t ON t.id=dt.taskId JOIN selected_requirements r ON r.id=t.requirementId
      WHERE d.projectId=${projectId} AND t.projectId=${projectId} AND d.deletedAt IS NULL
    ), defect_metrics AS (
      SELECT l.requirementId, COUNT(*) AS defectsTotal,
        SUM(d.status='ABERTO') AS openDefects, SUM(d.status='EM_CORRECAO') AS inCorrection,
        SUM(d.status='AGUARDANDO_RETESTE') AS waitingRetest, SUM(d.status='VALIDADO') AS validated
      FROM defect_links l JOIN Defect d ON d.id=l.defectId GROUP BY l.requirementId
    )
    SELECT r.id, t.tasksTotal, t.tasksDone, t.tasksInProgress, t.technicalEvidence,
      v.testCasesTotal, v.neverExecuted, v.passed, v.failed, v.blocked, v.untreatedFailure,
      d.defectsTotal, d.openDefects, d.inCorrection, d.waitingRetest, d.validated
    FROM selected_requirements r LEFT JOIN task_metrics t ON t.requirementId=r.id
      LEFT JOIN validation_metrics v ON v.requirementId=r.id
      LEFT JOIN defect_metrics d ON d.requirementId=r.id`;
}
