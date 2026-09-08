export const executionDisplayId = (id) => `EXEC-${String(id).padStart(4, '0')}`;
export function executionSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayId: executionDisplayId(row.id),
    result: row.result,
    executedAt: row.executedAt,
    environment: row.environment,
    testCaseVersion: row.testCaseVersion,
    testedReference: row.testedReferenceSnapshot,
    executedByDisplayNameSnapshot: row.executedByDisplayNameSnapshot
  };
}
export function caseCard(row) {
  return {
    id: row.id,
    displayId: `TC-${row.id}`,
    projectId: row.projectId,
    title: row.title,
    status: row.status,
    responsible: row.responsibleUser,
    currentVersion: row.currentVersion,
    requirement: row.requirement,
    taskCount: row._count?.taskLinks ?? row.taskLinks.length,
    latestExecution: executionSummary(row.executions[0])
  };
}
export function caseDetail(row, role) {
  return {
    ...caseCard(row),
    description: row.description,
    preconditions: row.preconditions,
    expectedResult: row.expectedResult,
    responsibleUserId: row.responsibleUserId,
    requirementId: row.requirementId,
    steps: row.steps.map(({ position, action, expectedResult }) => ({
      position,
      action,
      expectedResult
    })),
    tasks: row.taskLinks.map((l) => l.task),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    capabilities: {
      canEdit: role !== 'VIEWER',
      canDelete: role !== 'VIEWER',
      canExecute: role !== 'VIEWER' && row.status === 'ATIVO'
    }
  };
}
export function evidenceMetadata(row) {
  const data = { ...row };
  delete data.storageKey;
  return { ...data, contentUrl: `/api/test-evidence/${row.id}/content` };
}
export function executionDetail(row) {
  const { version, steps, evidence, ...execution } = row;
  return {
    ...execution,
    displayId: executionDisplayId(row.id),
    caseVersionSnapshot: version.snapshotJson,
    steps,
    evidence: evidence.map(evidenceMetadata)
  };
}
