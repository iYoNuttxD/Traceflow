import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './TraceabilityFlow.css';
import { useTestCaseScope } from '../../testCases/index.js';
import { ErrorState, normalizeApiError } from '../../../shared/index.js';
import { getRequirementTraceability } from '../api/traceability.api.js';
import { presentGraph, layoutGraph, relationLabels, identity, mergeGraph } from '../model/graph.js';
import { GraphEdge } from './GraphEdge.jsx';
import { GraphNode } from './GraphNode.jsx';
import { GraphEntityDetails } from './GraphEntityDetails.jsx';
export function buildFlow(
  contract,
  expanded = [],
  toggle = () => {},
  expandedGroups = [],
  toggleGroup = () => {},
  onOpen = () => {},
  onFocus = () => {}
) {
  const view = presentGraph(contract, expandedGroups),
    positions = layoutGraph(view.nodes, expanded);
  const incoming = new Set(view.edges.map((e) => e.target)),
    outgoing = new Set(view.edges.map((e) => e.source));
  const names = new Map(
    view.nodes.filter((n) => n.type !== 'GROUP').map((n) => [n.id, identity(n)])
  );
  return {
    nodes: view.nodes.map((node) => ({
      id: node.id,
      type: 'traceabilityNode',
      position: positions.get(node.id),
      ariaLabel:
        node.type === 'GROUP'
          ? `${node.data.label}: ${node.data.count} relacionados`
          : `${identity(node)} · ${node.data.title || node.data.message || ''}`,
      data: {
        node,
        expanded: expanded.includes(node.id),
        onToggle: () => toggle(node.id),
        onGroup: () => toggleGroup(node.id),
        onOpen,
        onFocus: () => onFocus(node.id),
        hasTarget: incoming.has(node.id),
        hasSource: outgoing.has(node.id)
      }
    })),
    edges: view.edges.map((edge, index) => {
      const label = `${relationLabels[edge.relationType || edge.type] || 'coleção de relações'}${edge.failedStep ? ` · Passo ${edge.failedStep}` : ''}${edge.correctionCycle ? ` · Ciclo ${edge.correctionCycle}` : ''}`;
      const emphasized = expanded.includes(edge.source) || expanded.includes(edge.target);
      return {
        ...edge,
        type: 'traceabilityEdge',
        data: {
          relationType: edge.relationType || edge.type,
          laneX: Math.max(...[...positions.values()].map((p) => p.x)) + 380 + (index % 7) * 28
        },
        label: emphasized ? label : undefined,
        ariaLabel: `${names.get(edge.source) || edge.source} ${label} ${names.get(edge.target) || edge.target}`,
        focusable: true,
        className: emphasized ? 'trace-edge-emphasized' : undefined,
        markerEnd: { type: MarkerType.ArrowClosed },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 4
      };
    })
  };
}
const nodeTypes = { traceabilityNode: GraphNode };
const edgeTypes = { traceabilityEdge: GraphEdge };
const toggled = (items, id) =>
  items.includes(id) ? items.filter((v) => v !== id) : [...items, id];
function Canvas({ traceability }) {
  const { fitView, setCenter } = useReactFlow();
  const [contract, setContract] = useState(traceability),
    [expanded, setExpanded] = useState([]),
    [groups, setGroups] = useState([]),
    [detail, setDetail] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(null);
  const scope = useTestCaseScope(`${contract.projectId}:${contract.perspective?.id}`),
    returnFocusRef = useRef(null);
  const close = useCallback(() => setDetail(null), []);
  const { nodes, edges } = useMemo(
    () =>
      buildFlow(
        contract,
        expanded,
        (id) => setExpanded((v) => toggled(v, id)),
        groups,
        (id) => setGroups((v) => toggled(v, id)),
        (node, trigger) => {
          returnFocusRef.current = trigger;
          setDetail(node);
        },
        (id) => {
          const position = layoutGraph(presentGraph(contract, groups).nodes, expanded).get(id);
          if (position)
            setCenter(position.x + 144, position.y + 300, { zoom: 0.85, duration: 200 });
        }
      ),
    [contract, expanded, groups, setCenter]
  );
  async function more() {
    const token = scope.begin('page');
    setLoading(true);
    setError(null);
    try {
      const next = await getRequirementTraceability(
        contract.projectId,
        contract.perspective.id,
        { expanded: true, limit: 100, page: contract.pagination.page + 1 },
        { signal: token.controller.signal }
      );
      if (scope.accepts('page', token)) setContract((old) => mergeGraph(old, next));
    } catch (e) {
      if (scope.accepts('page', token)) setError(normalizeApiError(e));
    } finally {
      if (scope.accepts('page', token)) setLoading(false);
    }
  }
  function collapse() {
    scope.cancelRead('page');
    setLoading(false);
    setError(null);
    setExpanded([]);
    setGroups([]);
    setContract(traceability);
    setCenter(144, 300, { zoom: 0.85 });
  }
  if (!nodes.length)
    return <p className="empty-state">Nenhum vínculo encontrado para esta perspectiva.</p>;
  return (
    <div className="traceability-flow">
      <div inert={detail ? true : undefined}>
        <div className="traceability-flow-toolbar">
          <p>Explore as relações. Clique em um card para ver suas informações.</p>
          <div className="traceability-flow-actions">
            <button
              className="button button-secondary"
              onClick={() => fitView({ padding: 0.18, duration: 250, minZoom: 0.02, maxZoom: 1 })}
            >
              Centralizar fluxo
            </button>
            <button className="button button-secondary" onClick={collapse}>
              Recolher tudo
            </button>
          </div>
        </div>
        <div className="traceability-flow-canvas" aria-label="Grafo de rastreabilidade">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.02}
            maxZoom={1.5}
            onInit={() => setCenter(144, 300, { zoom: 0.85 })}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background />
            <Controls showInteractive={false} orientation="horizontal" />
          </ReactFlow>
        </div>
        <p className="traceability-flow-caption">
          {nodes.filter((n) => n.data.node.type !== 'GROUP').length} entidades visíveis ·{' '}
          {edges.filter((e) => !e.presentation).length} relações. Arraste o canvas para explorar.
        </p>
        {contract.pagination?.scope === 'graphNodes' &&
          contract.pagination.page < contract.pagination.totalPages && (
            <button className="button button-secondary" onClick={more} disabled={loading}>
              {loading ? 'Carregando relações…' : 'Carregar mais relações'}
            </button>
          )}
        {error && <ErrorState message={error.message} onRetry={more} />}
      </div>
      {detail && (
        <GraphEntityDetails
          key={detail.id}
          node={detail}
          projectId={contract.projectId}
          onClose={close}
          returnFocusRef={returnFocusRef}
        />
      )}
    </div>
  );
}
export function TraceabilityFlow({ traceability }) {
  return (
    <ReactFlowProvider
      key={`${traceability?.projectId}:${traceability?.perspective?.type}:${traceability?.perspective?.id}`}
    >
      <Canvas traceability={traceability} />
    </ReactFlowProvider>
  );
}
