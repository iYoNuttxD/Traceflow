export const node = (type, id, data = {}) => ({
  id: `${{ REQUIREMENT: 'requirement', TASK: 'task', TEST_CASE: 'testCase', TEST_EXECUTION: 'execution', DEFECT: 'defect', COMMIT: 'commit' }[type]}:${id}`,
  entityId: id,
  type,
  data: { id, title: `Título ${id}`, ...data }
});
export function fixture() {
  const root = node('REQUIREMENT', 1, { status: 'CADASTRADO' }),
    task = node('TASK', 2, { status: 'CONCLUIDO', correctionDefects: [{ id: 3 }] }),
    tc = node('TEST_CASE', 4, {
      status: 'ATIVO',
      currentVersion: 1,
      latestExecution: { id: 8, result: 'PASS' },
      taskLinks: [{ taskId: 2 }],
      executionCount: 5,
      defectCount: 1
    }),
    defect = node('DEFECT', 3, {
      severity: 'ALTA',
      status: 'VALIDADO',
      detectedStep: { executionId: 5, position: 1 },
      taskLinks: [],
      retests: []
    });
  const ex = Array.from({ length: 5 }, (_, i) =>
    node('TEST_EXECUTION', i + 5, {
      result: i === 3 ? 'PASS' : 'FAIL',
      environment: 'LOCAL',
      testCaseId: 4,
      testCaseVersion: 1,
      required: i === 0 || i === 3,
      retests: i === 3 ? [{ defectId: 3 }] : [],
      stepCounts: { FAIL: 1 },
      _count: { evidence: 0 }
    })
  );
  const commits = Array.from({ length: 7 }, (_, i) =>
    node('COMMIT', i + 20, { hash: `abc${i}123456`, message: `Commit ${i}` })
  );
  const edge = (source, target, relationType, extra = {}) => ({
    id: `${relationType}:${source}:${target}`,
    source,
    target,
    relationType,
    ...extra
  });
  return {
    projectId: 1,
    perspective: { type: 'REQUIREMENT', id: 1 },
    nodes: [root, task, tc, defect, ...ex, ...commits],
    edges: [
      edge(root.id, task.id, 'IMPLEMENTA'),
      edge(root.id, tc.id, 'VERIFICADO_POR'),
      edge(task.id, tc.id, 'VERIFICADO_POR'),
      edge('execution:5', defect.id, 'DETECTOU', { failedStep: 1 }),
      edge(defect.id, task.id, 'CORRIGIDO_POR'),
      edge(defect.id, 'execution:8', 'RETESTADO_POR'),
      ...ex.map((e) => edge(tc.id, e.id, 'EXECUTADO_EM')),
      ...commits.map((c) => edge(task.id, c.id, 'IMPLEMENTADO_EM'))
    ],
    pagination: { page: 1, limit: 100, total: 16, totalPages: 1, scope: 'graphNodes' }
  };
}
