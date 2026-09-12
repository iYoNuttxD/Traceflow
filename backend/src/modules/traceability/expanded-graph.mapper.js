// Semantic relations belong to this projection. Groups in the client are presentation only.
const prefix = {
  REQUIREMENT: 'requirement',
  TASK: 'task',
  PULL_REQUEST: 'pull-request',
  COMMIT: 'commit',
  ISSUE: 'issue',
  TEST_CASE: 'testCase',
  TEST_EXECUTION: 'execution',
  DEFECT: 'defect'
};
export function formatExpandedGraph(model, { page = 1, limit = 100 } = {}) {
  const { requirement: r, tasks, cases, executions, defects, projection } = model;
  const nodes = new Map(),
    edges = new Map();
  const add = (type, data) => {
    const id = `${prefix[type]}:${data.id}`;
    nodes.set(id, { id, type, entityId: data.id, data });
    return id;
  };
  const link = (relationType, source, target, metadata = {}, legacyType = relationType) => {
    const id = `${legacyType}:${source}:${target}${metadata.correctionCycle ? `:${metadata.correctionCycle}` : ''}`;
    edges.set(id, { id, type: legacyType, relationType, source, target, ...metadata });
  };
  const root = add('REQUIREMENT', { ...r, status: projection.requirement.status, projection });
  for (const t of tasks) {
    const correctionDefects = defects.flatMap((d) =>
      d.taskLinks
        .filter((l) => l.taskId === t.id && l.relationType === 'CORRECTION')
        .map((l) => ({
          id: d.id,
          cycle: l.correctionCycle,
          current: l.correctionCycle === d.currentCorrectionCycle
        }))
    );
    const id = add('TASK', {
      ...t,
      correctionDefects: correctionDefects.slice(0, 4),
      correctionDefectCount: correctionDefects.length,
      commitLinks: t.commitLinks.slice(0, 4),
      issueLinks: t.issueLinks.slice(0, 4),
      commitCount: t.commitLinks.length,
      issueCount: t.issueLinks.length,
      responsible: t.responsibleUser?.name || t.responsible
    });
    if (t.requirementId === r.id) link('IMPLEMENTA', root, id, {}, 'REQUIREMENT_TASK');
    if (t.pullRequestId)
      link('IMPLEMENTADO_EM', id, `pull-request:${t.pullRequestId}`, {}, 'TASK_PULL_REQUEST');
    for (const l of t.commitLinks)
      link('IMPLEMENTADO_EM', id, `commit:${l.commitId}`, {}, 'TASK_COMMIT');
    for (const l of t.issueLinks) link('RELACIONADO_A', id, `issue:${l.issueId}`, {}, 'TASK_ISSUE');
  }
  for (const [type, rows] of [
    ['PULL_REQUEST', model.pullRequests],
    ['COMMIT', model.commits],
    ['ISSUE', model.issues]
  ])
    for (const row of rows) add(type, row);
  for (const c of cases) {
    const latest = executions.find(
      (e) => e.testCaseId === c.id && e.testCaseVersion === c.currentVersion
    );
    const id = add('TEST_CASE', {
      ...c,
      taskLinks: c.taskLinks.slice(0, 4),
      taskCount: c.taskLinks.length,
      responsible: c.responsibleUser?.name,
      latestExecution: latest ? { id: latest.id, result: latest.result } : null,
      executionCount: c._count.executions,
      defectCount: defects.filter((d) =>
        executions.some((e) => e.id === d.detectedStep.executionId && e.testCaseId === c.id)
      ).length
    });
    if (c.requirementId === r.id) link('VERIFICADO_POR', root, id);
    for (const l of c.taskLinks) link('VERIFICADO_POR', `task:${l.taskId}`, id);
  }
  for (const e of executions) {
    const retests = defects.flatMap((d) =>
      d.retests
        .filter((rt) => rt.testExecutionId === e.id)
        .map((rt) => ({ defectId: d.id, correctionCycle: rt.correctionCycle }))
    );
    const id = add('TEST_EXECUTION', {
      ...e,
      retests,
      stepCounts: Object.fromEntries(
        model.steps.filter((s) => s.executionId === e.id).map((s) => [s.result, s._count._all])
      ),
      required:
        cases.some(
          (c) =>
            c.id === e.testCaseId &&
            executions.find((x) => x.testCaseId === c.id && x.testCaseVersion === c.currentVersion)
              ?.id === e.id
        ) ||
        defects.some(
          (d) => d.detectedStep.executionId === e.id || d.retests[0]?.testExecutionId === e.id
        )
    });
    if (nodes.has(`testCase:${e.testCaseId}`)) link('EXECUTADO_EM', `testCase:${e.testCaseId}`, id);
  }
  for (const d of defects) {
    const id = add('DEFECT', {
      ...d,
      taskLinks: d.taskLinks.slice(0, 4),
      retests: d.retests.slice(0, 1),
      correctionTaskCount: d.taskLinks.filter(
        (l) => l.relationType === 'CORRECTION' && l.correctionCycle === d.currentCorrectionCycle
      ).length,
      responsible: d.responsibleUser?.name,
      latestRetest: d.retests[0]
        ? executions.find((e) => e.id === d.retests[0].testExecutionId)?.result
        : null
    });
    if (d.requirementId === r.id) link('AFETADO_POR', root, id);
    link('DETECTOU', `execution:${d.detectedStep.executionId}`, id, {
      failedStep: d.detectedStep.position
    });
    for (const l of d.taskLinks)
      link(
        l.relationType === 'CORRECTION' ? 'CORRIGIDO_POR' : 'ORIGINADO_EM',
        id,
        `task:${l.taskId}`,
        { correctionCycle: l.correctionCycle }
      );
    for (const rt of d.retests)
      link('RETESTADO_POR', id, `execution:${rt.testExecutionId}`, {
        correctionCycle: rt.correctionCycle
      });
  }
  const ordered = [...nodes.values()];
  // Independent bounded pages of nodes and edges. The client holds pending edges until
  // both endpoints arrive. No relation is silently truncated by a nested take().
  const pageNodes = ordered.slice((page - 1) * limit, page * limit);
  const allEdges = [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target));
  const edgeLimit = limit * 4;
  return {
    projectId: r.projectId,
    perspective: { type: 'REQUIREMENT', id: r.id },
    summary: projection,
    nodes: pageNodes,
    edges: allEdges.slice((page - 1) * edgeLimit, page * edgeLimit),
    pagination: {
      page,
      limit,
      total: nodes.size,
      edgesTotal: allEdges.length,
      edgeLimit,
      totalPages: Math.max(Math.ceil(nodes.size / limit), Math.ceil(allEdges.length / edgeLimit)),
      scope: 'graphNodes'
    }
  };
}
