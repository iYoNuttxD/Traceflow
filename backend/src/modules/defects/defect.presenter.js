import { correctionProjection } from './defect.schema.js';
export const defectCard = (row) => {
  const { taskLinks, detectedStep, ...fields } = row;
  return {
    ...fields,
    displayId: `DEF-${row.id}`,
    ...(taskLinks
      ? {
          correctionTaskCount: taskLinks.filter(
            (l) => l.correctionCycle === row.currentCorrectionCycle
          ).length
        }
      : {}),
    ...(detectedStep
      ? {
          detectionSummary: {
            testCaseId: detectedStep.execution.testCaseId,
            executionId: detectedStep.execution.id,
            stepPosition: detectedStep.position
          }
        }
      : {})
  };
};
export function detectionCandidate(step) {
  const e = step.execution;
  const snapshot = e.version.snapshotJson;
  return {
    detectedExecutionStepId: step.id,
    execution: {
      id: e.id,
      displayId: `EXEC-${String(e.id).padStart(4, '0')}`,
      executedAt: e.executedAt,
      environment: e.environment,
      result: e.result,
      testedReference: e.testedReferenceSnapshot
    },
    testCase: {
      id: e.testCaseId,
      displayId: `TC-${e.testCaseId}`,
      title: snapshot.title,
      version: e.testCaseVersion
    },
    failedStep: {
      id: step.id,
      position: step.position,
      result: step.result,
      action: step.actionSnapshot,
      expectedResult: step.expectedResultSnapshot,
      observedResult: step.observedResult,
      evidenceCount: step.evidence.length,
      evidence: step.evidence.map((v) => ({
        ...v,
        contentUrl: `/api/test-evidence/${v.id}/content`
      }))
    },
    executionEvidence: e.evidence
      .filter((v) => !v.executionStepId)
      .map((v) => ({ ...v, contentUrl: `/api/test-evidence/${v.id}/content` })),
    suggestedRequirement: snapshot.requirement ?? null,
    suggestedOriginTasks: snapshot.tasks ?? [],
    existingDefects: step.detectedDefects.map(defectCard)
  };
}
export function defectDetail(row) {
  const { taskLinks, retests, detectedStep, _count, ...fields } = row;
  const correctionTasks = taskLinks.filter((l) => l.relationType === 'CORRECTION');
  const current = correctionTasks.filter((l) => l.correctionCycle === row.currentCorrectionCycle);
  const pass = retests.find(
    (r) => r.correctionCycle === row.currentCorrectionCycle && r.execution.result === 'PASS'
  );
  return {
    ...defectCard(fields),
    correctionTaskCount: current.length,
    detectionSummary: {
      testCaseId: detectedStep.execution.testCaseId,
      executionId: detectedStep.execution.id,
      stepPosition: detectedStep.position
    },
    ...correctionProjection(
      current.map((l) => l.task),
      pass?.testExecutionId
    ),
    detection: detectionCandidate(detectedStep),
    originTasks: taskLinks.filter((l) => l.relationType === 'ORIGIN').map((l) => l.task),
    correctionCycles: [
      ...new Set([
        row.currentCorrectionCycle,
        ...correctionTasks.map((l) => l.correctionCycle),
        ...retests.map((r) => r.correctionCycle)
      ])
    ]
      .sort((a, b) => a - b)
      .map((cycle) => ({
        cycle,
        tasks: correctionTasks.filter((l) => l.correctionCycle === cycle).map((l) => l.task)
      })),
    retests,
    historyCount: _count.history
  };
}
