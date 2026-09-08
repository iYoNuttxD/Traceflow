import { missing, fail, correctionProjection } from './defect.schema.js';
import { assertDefectRevision, recordDefectEvent } from './defect.service.js';
import { authorize } from '../testCases/services/test-case.service.js';

// The caller holds Project before Defect and TestCase, matching task movement lock order.
export async function prepareDefectRetest(repo, input, testCaseId, projectId, context) {
  const row = await repo.lock(input.defectId);
  if (!row || row.projectId !== projectId || row.detectedStep.execution.testCaseId !== testCaseId)
    throw missing();
  await authorize(repo, projectId, context, true);
  assertDefectRevision(row, input);
  const tasks = row.taskLinks
    .filter(
      (l) => l.relationType === 'CORRECTION' && l.correctionCycle === row.currentCorrectionCycle
    )
    .map((l) => l.task);
  if (
    row.status !== 'AGUARDANDO_RETESTE' ||
    correctionProjection(tasks).status !== 'AGUARDANDO_RETESTE'
  )
    throw fail(
      'Conclua as tarefas de correção do ciclo antes do reteste.',
      'DEFECT_NOT_READY_FOR_RETEST',
      409
    );
  return row;
}
export async function completeDefectRetest(repo, row, execution, context) {
  await repo.addRetest(row.id, execution.id, row.currentCorrectionCycle);
  await recordDefectEvent(repo, row, context, 'RETEST_RECORDED', {
    testExecutionId: execution.id,
    correctionCycle: row.currentCorrectionCycle,
    result: execution.result
  });
  const status =
    execution.result === 'PASS'
      ? 'VALIDADO'
      : execution.result === 'FAIL'
        ? 'ABERTO'
        : 'AGUARDANDO_RETESTE';
  await repo.update(row.id, {
    status,
    currentCorrectionCycle: row.currentCorrectionCycle + (execution.result === 'FAIL' ? 1 : 0)
  });
  if (status !== row.status)
    await recordDefectEvent(repo, row, context, 'STATUS_CHANGED', {
      from: row.status,
      to: status,
      reason: `RETEST_${execution.result}`,
      testExecutionId: execution.id
    });
  if (execution.result === 'PASS')
    await recordDefectEvent(repo, row, context, 'VALIDATED', {
      testExecutionId: execution.id,
      correctionCycle: row.currentCorrectionCycle
    });
  if (execution.result === 'FAIL')
    await recordDefectEvent(repo, row, context, 'CYCLE_REOPENED', {
      from: row.currentCorrectionCycle,
      to: row.currentCorrectionCycle + 1,
      testExecutionId: execution.id
    });
}
