export const graphThresholds = Object.freeze({
  TASK: 8,
  COMMIT: 5,
  ISSUE: 3,
  PULL_REQUEST: 3,
  TEST_CASE: 8,
  DEFECT: 5,
  TEST_EXECUTION: 0
});
export const nodeLabels = {
  REQUIREMENT: 'Requisito',
  TASK: 'Tarefa',
  PULL_REQUEST: 'Pull request',
  COMMIT: 'Commit',
  ISSUE: 'Issue',
  TEST_CASE: 'Caso de teste',
  TEST_EXECUTION: 'Execução',
  DEFECT: 'Defeito'
};
export const relationLabels = {
  IMPLEMENTA: 'implementa',
  VERIFICADO_POR: 'verificado por',
  IMPLEMENTADO_EM: 'implementado em',
  RELACIONADO_A: 'relacionado a',
  EXECUTADO_EM: 'executado em',
  DETECTOU: 'detectou',
  ORIGINADO_EM: 'originado em',
  CORRIGIDO_POR: 'corrigido por',
  RETESTADO_POR: 'retestado por',
  AFETADO_POR: 'afetado por',
  REQUIREMENT_TASK: 'implementa',
  TASK_COMMIT: 'implementado em',
  TASK_PULL_REQUEST: 'implementado em',
  TASK_ISSUE: 'relacionado a'
};
export function identity(node) {
  const d = node.data;
  if (node.type === 'REQUIREMENT') return `REQ-${d.id}`;
  if (node.type === 'TASK') return `TASK-${d.id}`;
  if (node.type === 'TEST_CASE') return `TC-${d.id}`;
  if (node.type === 'TEST_EXECUTION') return `EXEC-${String(d.id).padStart(4, '0')}`;
  if (node.type === 'DEFECT') return `DEF-${d.id}`;
  if (node.type === 'COMMIT') return (d.hash || d.shortHash || String(d.id)).slice(0, 7);
  return `#${d.number}`;
}
export function mergeGraph(previous, next) {
  return {
    ...next,
    nodes: [...new Map([...previous.nodes, ...next.nodes].map((n) => [n.id, n])).values()],
    edges: [...new Map([...previous.edges, ...next.edges].map((e) => [e.id, e])).values()]
  };
}
function layer(n) {
  if (n.type === 'GROUP') return n.data.layer;
  if (n.type === 'TASK') return n.data.correctionDefects?.length ? 6 : 1;
  if (n.type === 'TEST_EXECUTION') return n.data.retests?.length ? 7 : 4;
  return (
    { REQUIREMENT: 0, PULL_REQUEST: 2, COMMIT: 2, ISSUE: 2, TEST_CASE: 3, DEFECT: 5 }[n.type] ?? 2
  );
}
export function presentGraph(contract, expandedGroups = []) {
  const all = [...new Map((contract?.nodes || []).map((n) => [n.id, n])).values()];
  const root =
    all.find((n) => n.type === 'REQUIREMENT') ||
    all.find((n) => n.type === contract?.perspective?.type) ||
    all[0];
  const collections = new Map();
  for (const n of all) {
    if (n === root) continue;
    // Ownership is read from semantic edges, never inferred from titles or ID substrings.
    const owner =
      n.type === 'TEST_EXECUTION'
        ? contract.edges.find(
            (e) =>
              e.relationType === 'EXECUTADO_EM' &&
              e.target === n.id &&
              all.some((owner) => owner.id === e.source)
          )?.source || root?.id
        : root?.id;
    const key = `group:${owner}:${n.type}`;
    if (!collections.has(key)) collections.set(key, { id: key, owner, type: n.type, nodes: [] });
    collections.get(key).nodes.push(n);
  }
  const visible = new Map(all.map((n) => [n.id, n]));
  const groups = [];
  for (const c of collections.values()) {
    const hidden = c.type === 'TEST_EXECUTION' ? c.nodes.filter((n) => !n.data.required) : c.nodes;
    if (!hidden.length || hidden.length <= graphThresholds[c.type]) continue;
    const open = expandedGroups.includes(c.id);
    if (!open) for (const n of hidden) visible.delete(n.id);
    groups.push({
      id: c.id,
      type: 'GROUP',
      data: {
        owner: c.owner,
        ownerLabel: identity(all.find((n) => n.id === c.owner) || root),
        memberIds: hidden.map((n) => n.id),
        label: nodeLabels[c.type],
        count: hidden.length,
        open,
        layer: Math.min(...hidden.map(layer))
      }
    });
  }
  const nodes = [...visible.values(), ...groups.filter((g) => visible.has(g.data.owner))];
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (contract?.edges || []).filter((e) => ids.has(e.source) && ids.has(e.target));
  for (const g of groups)
    if (ids.has(g.id))
      edges.push({
        id: `presentation:${g.id}`,
        source: g.data.owner,
        target: g.id,
        relationType: 'COLLECTION',
        presentation: true
      });
  return { nodes, edges };
}
export function layoutGraph(nodes, expanded = []) {
  const bands = new Map();
  for (const n of nodes) {
    const level = layer(n);
    if (!bands.has(level)) bands.set(level, []);
    bands.get(level).push(n);
  }
  const positions = new Map();
  let y = 0;
  for (const [, siblings] of [...bands].sort(([a], [b]) => a - b)) {
    siblings.sort((a, b) => (a.data.id || 0) - (b.data.id || 0) || a.id.localeCompare(b.id));
    for (let start = 0; start < siblings.length; start += 3) {
      const row = siblings.slice(start, start + 3);
      row.forEach((n, i) => positions.set(n.id, { x: i * 388 - (row.length - 1) * 194, y }));
      y += row.some((n) => expanded.includes(n.id)) ? 620 : 290;
    }
    y += 70;
  }
  return positions;
}
