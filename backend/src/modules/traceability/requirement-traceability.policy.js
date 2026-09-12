import {
  buildRequirementMetrics,
  getImplementationStage,
  uniqueById
} from './traceability.calculator.js';

export const TRACEABILITY_SITUATIONS = Object.freeze([
  'SEM_RASTREABILIDADE',
  'PLANEJADO',
  'EM_DESENVOLVIMENTO',
  'IMPLEMENTADO',
  'AGUARDANDO_VALIDACAO',
  'EM_VALIDACAO',
  'COM_FALHA',
  'EM_CORRECAO',
  'AGUARDANDO_RETESTE',
  'VALIDADO',
  'CONCLUIDO'
]);

export function relatedRequirementIds(row, originOnly = false) {
  return [
    ...new Set(
      [
        row.requirementId,
        ...(row.taskLinks || [])
          .filter((link) => !originOnly || link.relationType === 'ORIGIN')
          .map((link) => link.task.requirementId)
      ].filter(Boolean)
    )
  ];
}

export function currentExecution(testCase) {
  return (
    (testCase.executions || [])
      .filter((execution) => execution.testCaseVersion === testCase.currentVersion)
      .toSorted((a, b) => new Date(b.executedAt) - new Date(a.executedAt) || b.id - a.id)[0] || null
  );
}

export function deriveSituation({ legacyStage, validation, defects = {}, hasUntreatedFailure }) {
  if (defects.open || hasUntreatedFailure) return 'COM_FALHA';
  if (defects.inCorrection) return 'EM_CORRECAO';
  if (defects.waitingRetest) return 'AGUARDANDO_RETESTE';
  // Current quality takes precedence even when implementation is incomplete.
  if (legacyStage !== 'IMPLEMENTADO') return legacyStage;
  if (!validation.testCasesTotal) return 'IMPLEMENTADO';
  if (validation.neverExecuted > 0) return 'AGUARDANDO_VALIDACAO';
  if (validation.pass !== validation.testCasesTotal) return 'EM_VALIDACAO';
  return 'CONCLUIDO';
}

export const REQUIREMENT_LIFECYCLE_STATUSES = Object.freeze([
  'PLANEJADO',
  'EM_IMPLEMENTACAO',
  'EM_VALIDACAO',
  'EM_CORRECAO',
  'CONCLUIDO'
]);
export function deriveRequirementLifecycleStatus(situation) {
  const statuses = {
    SEM_RASTREABILIDADE: 'PLANEJADO',
    PLANEJADO: 'PLANEJADO',
    EM_DESENVOLVIMENTO: 'EM_IMPLEMENTACAO',
    IMPLEMENTADO: 'EM_IMPLEMENTACAO',
    AGUARDANDO_VALIDACAO: 'EM_VALIDACAO',
    EM_VALIDACAO: 'EM_VALIDACAO',
    VALIDADO: 'EM_VALIDACAO',
    COM_FALHA: 'EM_CORRECAO',
    EM_CORRECAO: 'EM_CORRECAO',
    AGUARDANDO_RETESTE: 'EM_CORRECAO',
    CONCLUIDO: 'CONCLUIDO'
  };
  if (!statuses[situation]) throw new Error('Unknown traceability situation');
  return statuses[situation];
}

export function projectRequirement(requirement, testCases = [], defectRows = []) {
  const metrics = buildRequirementMetrics(requirement);
  const legacyStage = getImplementationStage(metrics.tasks, metrics.hasTechnicalEvidence);
  const cases = uniqueById(testCases).filter(
    (row) =>
      row.projectId === requirement.projectId &&
      !row.deletedAt &&
      row.status === 'ATIVO' &&
      relatedRequirementIds(row).includes(requirement.id)
  );
  const relevantDefects = uniqueById(defectRows).filter(
    (row) =>
      row.projectId === requirement.projectId &&
      !row.deletedAt &&
      relatedRequirementIds(row, true).includes(requirement.id)
  );
  const validation = {
    testCasesTotal: cases.length,
    neverExecuted: 0,
    pass: 0,
    fail: 0,
    blocked: 0
  };
  let hasUntreatedFailure = false;
  for (const row of cases) {
    const execution = currentExecution(row);
    if (!execution) validation.neverExecuted++;
    else {
      validation[execution.result.toLowerCase()]++;
      if (execution.result === 'FAIL') {
        const steps = execution.steps.filter((step) => step.result === 'FAIL');
        hasUntreatedFailure ||=
          !steps.length ||
          steps.some(
            (step) =>
              !step.detectedDefects.some(
                (defect) => !defect.deletedAt && defect.projectId === requirement.projectId
              )
          );
      }
    }
  }
  const defects = {
    total: relevantDefects.length,
    open: 0,
    inCorrection: 0,
    waitingRetest: 0,
    validated: 0
  };
  const statusCounter = {
    ABERTO: 'open',
    EM_CORRECAO: 'inCorrection',
    AGUARDANDO_RETESTE: 'waitingRetest',
    VALIDADO: 'validated'
  };
  for (const defect of relevantDefects) defects[statusCounter[defect.status]]++;
  const correction =
    relevantDefects.length === 0
      ? 'NOT_APPLICABLE'
      : relevantDefects.every(
            (defect) =>
              defect.taskLinks.some(
                (link) =>
                  link.relationType === 'CORRECTION' &&
                  link.correctionCycle === defect.currentCorrectionCycle &&
                  (link.task.pullRequestId || link.task._count.commitLinks > 0)
              ) &&
              defect.retests.some(
                (retest) => retest.correctionCycle === defect.currentCorrectionCycle
              )
          )
        ? 'PRESENT'
        : 'MISSING';
  const situation = deriveSituation({ legacyStage, validation, defects, hasUntreatedFailure });
  return {
    requirement: {
      id: requirement.id,
      displayId: `REQ-${requirement.id}`,
      title: requirement.title,
      status: deriveRequirementLifecycleStatus(situation)
    },
    progress: {
      ...metrics.progress,
      tasksTotal: metrics.tasksCount,
      tasksDone: metrics.completedTasksCount
    },
    implementation: {
      legacyStage,
      legacyImplementationStatus: metrics.implementationStatus,
      implemented: legacyStage === 'IMPLEMENTADO',
      technicalEvidence: metrics.hasTechnicalEvidence
    },
    artifacts: {
      pullRequests: metrics.pullRequestsCount,
      commits: metrics.commitsCount,
      issues: metrics.issuesCount
    },
    validation,
    defects,
    evidence: {
      implementation: metrics.hasTechnicalEvidence,
      validation: validation.neverExecuted < cases.length,
      correction
    },
    hasUntreatedFailure,
    situation
  };
}

export function projectionSummary(rows) {
  const bySituation = Object.fromEntries(TRACEABILITY_SITUATIONS.map((value) => [value, 0]));
  for (const row of rows) bySituation[row.situation]++;
  return {
    total: rows.length,
    bySituation,
    withDefect: bySituation.COM_FALHA + bySituation.EM_CORRECAO + bySituation.AGUARDANDO_RETESTE
  };
}

export function matchesProjection(row, q) {
  const search = q.search?.toLocaleLowerCase();
  return (
    (!search ||
      row.requirement.title.toLocaleLowerCase().includes(search) ||
      row.requirement.displayId.toLowerCase() === search) &&
    (!q.situation || row.situation === q.situation) &&
    (!q.requirementStatus || row.requirement.status === q.requirementStatus) &&
    (q.hasTests === undefined || row.validation.testCasesTotal > 0 === q.hasTests) &&
    (q.hasOpenDefects === undefined ||
      row.defects.total > row.defects.validated === q.hasOpenDefects) &&
    (q.hasTechnicalEvidence === undefined || row.evidence.implementation === q.hasTechnicalEvidence)
  );
}
