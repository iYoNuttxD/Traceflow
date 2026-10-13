-- Preserve the creation basis instead of reinterpreting completed local work
-- when a GitHub integration is connected later. Legacy direct writers retain
-- the existing GITHUB policy; canonical creation assigns the basis explicitly.
ALTER TABLE `Requirement`
  ADD COLUMN `lifecycleBasis` ENUM('LOCAL', 'GITHUB') NOT NULL DEFAULT 'GITHUB';

START TRANSACTION;

-- Backfill only projects without an integration at migration time. Existing
-- integrated requirements retain the technical-evidence policy, including
-- disconnected integrations. Do not reinterpret or rewrite execution history.
UPDATE `Requirement` AS r
LEFT JOIN `ProjectGitHubIntegration` AS g ON g.`projectId` = r.`projectId`
SET r.`lifecycleBasis` = 'LOCAL'
WHERE g.`id` IS NULL;

-- Reconcile LOCAL lifecycle projections
-- Mirrors readProjectionMetrics + getImplementationStageFromCounts(LOCAL) +
-- deriveSituation. Preserve the old history; append only actual transitions.
-- MySQL TEMPORARY TABLE creation does not commit the surrounding transaction.
CREATE TEMPORARY TABLE `_StandaloneRequirementProjection` AS
WITH selected_requirements AS (
  SELECT id, projectId FROM Requirement WHERE lifecycleBasis = 'LOCAL'
), task_metrics AS (
  SELECT t.requirementId, COUNT(*) AS tasksTotal,
    SUM(t.status = 'CONCLUIDO') AS tasksDone,
    SUM(t.status = 'EM_ANDAMENTO') AS tasksInProgress,
    MAX(t.pullRequestId IS NOT NULL OR EXISTS(
      SELECT 1 FROM TaskCommit tc WHERE tc.taskId = t.id
    )) AS technicalEvidence
  FROM Task t JOIN selected_requirements r ON r.id = t.requirementId AND r.projectId = t.projectId
  GROUP BY t.requirementId
), case_links AS (
  SELECT c.id AS caseId, r.id AS requirementId FROM TestCase c
  JOIN selected_requirements r ON r.id = c.requirementId AND r.projectId = c.projectId
  WHERE c.deletedAt IS NULL AND c.status = 'ATIVO'
  UNION
  SELECT c.id AS caseId, r.id AS requirementId FROM TestCase c
  JOIN TestCaseTask ct ON ct.testCaseId = c.id
  JOIN Task t ON t.id = ct.taskId AND t.projectId = c.projectId
  JOIN selected_requirements r ON r.id = t.requirementId AND r.projectId = c.projectId
  WHERE c.deletedAt IS NULL AND c.status = 'ATIVO'
), validation_metrics AS (
  SELECT l.requirementId, COUNT(*) AS testCasesTotal,
    SUM(e.id IS NULL) AS neverExecuted,
    SUM(e.result = 'PASS') AS passed,
    MAX(e.result = 'FAIL' AND (
      NOT EXISTS(SELECT 1 FROM TestExecutionStep s WHERE s.executionId = e.id AND s.result = 'FAIL')
      OR EXISTS(SELECT 1 FROM TestExecutionStep s WHERE s.executionId = e.id AND s.result = 'FAIL'
        AND NOT EXISTS(SELECT 1 FROM Defect d WHERE d.detectedExecutionStepId = s.id
          AND d.projectId = c.projectId AND d.deletedAt IS NULL))
    )) AS untreatedFailure
  FROM case_links l JOIN TestCase c ON c.id = l.caseId
  LEFT JOIN TestExecution e ON e.id = (
    SELECT x.id FROM TestExecution x WHERE x.testCaseId = c.id AND x.projectId = c.projectId
      AND x.testCaseVersion = c.currentVersion ORDER BY x.executedAt DESC, x.id DESC LIMIT 1
  )
  GROUP BY l.requirementId
), defect_links AS (
  SELECT d.id AS defectId, r.id AS requirementId FROM Defect d
  JOIN selected_requirements r ON r.id = d.requirementId AND r.projectId = d.projectId
  WHERE d.deletedAt IS NULL
  UNION
  SELECT d.id AS defectId, r.id AS requirementId FROM Defect d
  JOIN DefectTask dt ON dt.defectId = d.id AND dt.relationType = 'ORIGIN'
  JOIN Task t ON t.id = dt.taskId AND t.projectId = d.projectId
  JOIN selected_requirements r ON r.id = t.requirementId AND r.projectId = d.projectId
  WHERE d.deletedAt IS NULL
), defect_metrics AS (
  SELECT l.requirementId,
    SUM(d.status = 'ABERTO') AS openDefects,
    SUM(d.status = 'EM_CORRECAO') AS inCorrection,
    SUM(d.status = 'AGUARDANDO_RETESTE') AS waitingRetest
  FROM defect_links l JOIN Defect d ON d.id = l.defectId GROUP BY l.requirementId
), stages AS (
  SELECT r.id, r.projectId,
    CASE
      WHEN COALESCE(t.tasksTotal, 0) = 0 THEN 'SEM_RASTREABILIDADE'
      WHEN t.tasksDone = t.tasksTotal THEN 'IMPLEMENTADO'
      WHEN t.tasksDone > 0 OR t.tasksInProgress > 0 OR t.technicalEvidence > 0 THEN 'EM_DESENVOLVIMENTO'
      ELSE 'PLANEJADO'
    END AS implementationStage,
    COALESCE(v.testCasesTotal, 0) AS testCasesTotal,
    COALESCE(v.neverExecuted, 0) AS neverExecuted,
    COALESCE(v.passed, 0) AS passed,
    COALESCE(v.untreatedFailure, 0) AS untreatedFailure,
    COALESCE(d.openDefects, 0) AS openDefects,
    COALESCE(d.inCorrection, 0) AS inCorrection,
    COALESCE(d.waitingRetest, 0) AS waitingRetest
  FROM selected_requirements r
  LEFT JOIN task_metrics t ON t.requirementId = r.id
  LEFT JOIN validation_metrics v ON v.requirementId = r.id
  LEFT JOIN defect_metrics d ON d.requirementId = r.id
), situations AS (
  SELECT id, projectId,
    CASE
      WHEN openDefects > 0 OR untreatedFailure > 0 THEN 'COM_FALHA'
      WHEN inCorrection > 0 THEN 'EM_CORRECAO'
      WHEN waitingRetest > 0 THEN 'AGUARDANDO_RETESTE'
      WHEN implementationStage <> 'IMPLEMENTADO' THEN implementationStage
      WHEN testCasesTotal = 0 THEN 'IMPLEMENTADO'
      WHEN neverExecuted > 0 THEN 'AGUARDANDO_VALIDACAO'
      WHEN passed <> testCasesTotal THEN 'EM_VALIDACAO'
      ELSE 'CONCLUIDO'
    END AS situation
  FROM stages
)
SELECT id, projectId, situation,
  CASE
    WHEN situation IN ('SEM_RASTREABILIDADE', 'PLANEJADO') THEN 'PLANEJADO'
    WHEN situation IN ('EM_DESENVOLVIMENTO', 'IMPLEMENTADO') THEN 'EM_IMPLEMENTACAO'
    WHEN situation IN ('AGUARDANDO_VALIDACAO', 'EM_VALIDACAO', 'VALIDADO') THEN 'EM_VALIDACAO'
    WHEN situation IN ('COM_FALHA', 'EM_CORRECAO', 'AGUARDANDO_RETESTE') THEN 'EM_CORRECAO'
    ELSE 'CONCLUIDO'
  END AS lifecycleStatus
FROM situations;

INSERT INTO RequirementTraceabilityHistoryEntry
  (projectId, requirementId, fromSituation, toSituation, reason, sourceEntityType, metadataJson, occurredAt)
SELECT p.projectId, p.id, s.currentSituation, p.situation,
  CASE WHEN s.id IS NULL THEN 'BASELINE_INITIALIZED' ELSE 'LIFECYCLE_BASIS_MIGRATION' END, 'Migration',
  JSON_OBJECT('rulesVersion', 4, 'lifecycleBasis', 'LOCAL',
    'migrationReason', 'LIFECYCLE_BASIS_MIGRATION'), CURRENT_TIMESTAMP(3)
FROM `_StandaloneRequirementProjection` p
LEFT JOIN RequirementTraceabilityState s ON s.requirementId = p.id
WHERE s.id IS NULL OR s.currentSituation <> p.situation;

UPDATE Requirement r JOIN `_StandaloneRequirementProjection` p ON p.id = r.id
SET r.status = p.lifecycleStatus, r.updatedAt = CURRENT_TIMESTAMP(3)
WHERE r.status <> p.lifecycleStatus;

UPDATE RequirementTraceabilityState s JOIN `_StandaloneRequirementProjection` p ON p.id = s.requirementId
SET s.currentSituation = p.situation, s.updatedAt = CURRENT_TIMESTAMP(3)
WHERE s.currentSituation <> p.situation;

INSERT INTO RequirementTraceabilityState (requirementId, currentSituation, updatedAt)
SELECT p.id, p.situation, CURRENT_TIMESTAMP(3)
FROM `_StandaloneRequirementProjection` p
LEFT JOIN RequirementTraceabilityState s ON s.requirementId = p.id
WHERE s.id IS NULL;

DROP TEMPORARY TABLE `_StandaloneRequirementProjection`;
COMMIT;
