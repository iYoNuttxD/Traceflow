export const graphLayout = Object.freeze({
  width: 280,
  height: 208,
  minZoom: 0.75,
  maxZoom: 1.5,
  initialZoom: 0.9
});
export const elkOptions = Object.freeze({
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.partitioning.activate': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'LEFTUP',
  'elk.spacing.nodeNode': '48',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.spacing.edgeNode': '24',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.randomSeed': '1'
});
const order = [
  'IMPLEMENTA',
  'IMPLEMENTADO_EM',
  'RELACIONADO_A',
  'VERIFICADO_POR',
  'EXECUTADO_EM',
  'DETECTOU',
  'CORRIGIDO_POR',
  'RETESTADO_POR',
  'AFETADO_POR',
  'ORIGINADO_EM',
  'COLLECTION'
];
export function edgeHierarchy(edge, edges) {
  const relation = edge.relationType || edge.type;
  return edge.presentation ||
    ['AFETADO_POR', 'ORIGINADO_EM'].includes(relation) ||
    (relation === 'VERIFICADO_POR' &&
      edge.source.startsWith('requirement:') &&
      edges.some((e) => e.target === edge.target && e.source.startsWith('task:')))
    ? 'secondary'
    : 'primary';
}
export function graphPorts(view) {
  const ports = new Map(view.nodes.map((n) => [n.id, []]));
  const edges = [...view.edges]
    .sort(
      (a, b) =>
        order.indexOf(a.relationType || a.type) - order.indexOf(b.relationType || b.type) ||
        a.id.localeCompare(b.id)
    )
    .map((e) => {
      const returning = e.relationType === 'ORIGINADO_EM';
      const sourceHandle = `${e.source}:out:${e.id}`,
        targetHandle = `${e.target}:in:${e.id}`;
      ports.get(e.source)?.push({
        id: sourceHandle,
        type: 'source',
        side: returning ? 'WEST' : 'EAST',
        relation: e.relationType || e.type
      });
      ports.get(e.target)?.push({
        id: targetHandle,
        type: 'target',
        side: returning ? 'EAST' : 'WEST',
        relation: e.relationType || e.type
      });
      return { ...e, sourceHandle, targetHandle, hierarchy: edgeHierarchy(e, view.edges) };
    });
  for (const values of ports.values())
    for (const side of ['WEST', 'EAST']) {
      const siblings = values.filter((p) => p.side === side);
      siblings.forEach((p, i) => {
        p.y = 16 + ((i + 1) * (graphLayout.height - 32)) / (siblings.length + 1);
      });
    }
  return { ports, edges };
}
let enginePromise;
async function getEngine() {
  if (!enginePromise)
    enginePromise =
      typeof Worker === 'undefined'
        ? import('elkjs/lib/elk.bundled.js').then((m) => new m.default())
        : Promise.all([
            import('elkjs/lib/elk-api.js'),
            import('elkjs/lib/elk-worker.min.js?worker')
          ]).then(
            ([api, worker]) => new api.default({ workerFactory: () => new worker.default() })
          );
  return enginePromise;
}
function rank(n) {
  if (n.type === 'GROUP') return n.data.layer;
  if (n.type === 'TASK') return n.data.correctionDefects?.length ? 6 : 1;
  if (n.type === 'TEST_EXECUTION') return n.data.retests?.length ? 7 : 4;
  return (
    { REQUIREMENT: 0, PULL_REQUEST: 2, COMMIT: 2, ISSUE: 2, TEST_CASE: 3, DEFECT: 5 }[n.type] || 0
  );
}
export async function layoutWithElk(view) {
  const started = performance.now();
  const { ports, edges } = graphPorts(view);
  const engine = await getEngine();
  const graph = await engine.layout({
    id: 'traceability',
    layoutOptions: elkOptions,
    children: [...view.nodes]
      .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
      .map((n) => ({
        id: n.id,
        width: graphLayout.width,
        height: graphLayout.height,
        layoutOptions: {
          'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
          'org.eclipse.elk.partitioning.partition': String(rank(n))
        },
        ports: ports.get(n.id).map((p) => ({
          id: p.id,
          width: 0,
          height: 0,
          layoutOptions: { 'org.eclipse.elk.port.side': p.side }
        }))
      })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.sourceHandle], targets: [e.targetHandle] }))
  });
  const routed = new Map(graph.edges.map((e) => [e.id, e.sections]));
  return {
    nodes: graph.children.map((n) => ({
      id: n.id,
      position: { x: n.x, y: n.y },
      ports: ports.get(n.id).map((p) => ({ ...p, ...n.ports.find((v) => v.id === p.id) }))
    })),
    edges: edges.map((e) => ({ ...e, sections: routed.get(e.id) })),
    duration: performance.now() - started
  };
}
// Keep every existing coordinate after manual edits. Place only newcomers near their group,
// scanning free rows so expansion cannot overwrite the user's arrangement.
export function placeNewNodes(view, previous) {
  const result = new Map(previous);
  const occupied = [...previous.values()];
  const collides = (p) =>
    occupied.some(
      (q) =>
        Math.abs(p.x - q.x) < graphLayout.width + 32 &&
        Math.abs(p.y - q.y) < graphLayout.height + 32
    );
  for (const n of view.nodes) {
    if (result.has(n.id)) continue;
    const group = view.nodes.find((g) => g.type === 'GROUP' && g.data.memberIds.includes(n.id));
    const parent = group?.id || view.edges.find((e) => e.target === n.id)?.source;
    const anchor = result.get(parent) || { x: 0, y: 0 };
    const position = { x: anchor.x + graphLayout.width + 100, y: anchor.y };
    while (collides(position)) position.y += graphLayout.height + 48;
    result.set(n.id, position);
    occupied.push(position);
  }
  return result;
}
export function highlightedPath(view, id) {
  const nodes = new Set(id ? [id] : []),
    edges = new Set();
  // Direct semantic neighbourhood avoids highlighting the entire connected project.
  for (const edge of view.edges)
    if (edge.source === id || edge.target === id) {
      nodes.add(edge.source);
      nodes.add(edge.target);
      edges.add(edge.id);
    }
  return { nodes, edges };
}
