import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './TraceabilityFlow.css';
import { useTestCaseScope } from '../../testCases/index.js';
import { ErrorState, normalizeApiError } from '../../../shared/index.js';
import { getRequirementTraceability } from '../api/traceability.api.js';
import { presentGraph, relationLabels, identity, mergeGraph, nodeLabels } from '../model/graph.js';
import {
  graphLayout,
  graphPorts,
  highlightedPath,
  layoutWithElk,
  placeNewNodes
} from '../graph/layout/elk-layout.js';
import { GraphEdge } from './GraphEdge.jsx';
import { GraphNode } from './GraphNode.jsx';
import { GraphEntityDetails } from './GraphEntityDetails.jsx';
import { TraceabilityInspector } from './TraceabilityInspector.jsx';
const nodeTypes = { traceabilityNode: GraphNode },
  edgeTypes = { traceabilityEdge: GraphEdge };
const toggled = (values, id) =>
  values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
export function buildFlow(contract, groups = []) {
  const view = presentGraph(contract, groups),
    { ports, edges } = graphPorts(view);
  return {
    nodes: view.nodes.map((node) => ({
      id: node.id,
      type: 'traceabilityNode',
      position: { x: 0, y: 0 },
      width: graphLayout.width,
      height: graphLayout.height,
      ariaLabel:
        node.type === 'GROUP'
          ? `${node.data.label}: ${node.data.count} relacionados`
          : `${nodeLabels[node.type]} ${identity(node)} — ${node.data.title || node.data.message || ''}`,
      data: { node, ports: ports.get(node.id) }
    })),
    edges: edges.map((e) => ({
      ...e,
      data: { relationType: e.relationType || e.type },
      ariaLabel: `${e.source} ${relationLabels[e.relationType || e.type] || 'coleção de relações'}${e.failedStep ? ` · Passo ${e.failedStep}` : ''}${e.correctionCycle ? ` · Ciclo ${e.correctionCycle}` : ''} ${e.target}`
    }))
  };
}
function Canvas({ traceability }) {
  const flow = useReactFlow();
  const [contract, setContract] = useState(traceability),
    [groups, setGroups] = useState([]),
    [selected, setSelected] = useState(null),
    [hover, setHover] = useState(null),
    [edgeFocus, setEdgeFocus] = useState(null),
    [detail, setDetail] = useState(null);
  const [nodes, setNodes] = useState([]),
    [routes, setRoutes] = useState(new Map()),
    [organizing, setOrganizing] = useState(true),
    [layoutError, setLayoutError] = useState(null),
    [duration, setDuration] = useState(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(null);
  const canvasRef = useRef(null);
  const manual = useRef(false),
    positions = useRef(new Map()),
    sequence = useRef(0),
    pendingCenter = useRef(null),
    detailReturn = useRef(null);
  const scope = useTestCaseScope(`${contract.projectId}:${contract.perspective?.id}`);
  const view = useMemo(() => presentGraph(contract, groups), [contract, groups]);
  const base = useMemo(() => buildFlow(contract, groups), [contract, groups]);
  const path = highlightedPath(view, hover || selected);
  const center = useCallback(
    (id) => {
      const n =
        flow.getNode(id) ||
        flow.getNodes().find((n) => n.data.node.type === 'REQUIREMENT') ||
        flow.getNodes()[0];
      if (n?.data.node.type === 'REQUIREMENT' && canvasRef.current?.clientHeight) {
        void flow.setViewport(
          {
            x: 40 - n.position.x * graphLayout.initialZoom,
            y:
              canvasRef.current.clientHeight / 2 -
              (n.position.y + graphLayout.height / 2) * graphLayout.initialZoom,
            zoom: graphLayout.initialZoom
          },
          { duration: 200 }
        );
      } else if (n)
        void flow.setCenter(
          n.position.x + graphLayout.width / 2,
          n.position.y + graphLayout.height / 2,
          { zoom: graphLayout.initialZoom, duration: 200 }
        );
    },
    [flow]
  );
  const organize = useCallback(
    async (reset = false) => {
      const token = ++sequence.current;
      setLayoutError(null);
      if (manual.current && !reset) {
        positions.current = placeNewNodes(view, positions.current);
        setNodes(() =>
          base.nodes.map((n) => ({
            ...n,
            position: positions.current.get(n.id),
            data: { ...n.data, ports: n.data.ports }
          }))
        );
        setRoutes(new Map());
        setOrganizing(false);
        return;
      }
      setOrganizing(true);
      try {
        const result = await layoutWithElk(view);
        if (sequence.current !== token) return;
        const layout = new Map(result.nodes.map((n) => [n.id, n]));
        positions.current = new Map(result.nodes.map((n) => [n.id, n.position]));
        manual.current = false;
        setNodes(
          base.nodes.map((n) => ({
            ...n,
            position: layout.get(n.id).position,
            data: { ...n.data, ports: layout.get(n.id).ports }
          }))
        );
        setRoutes(new Map(result.edges.map((e) => [e.id, e.sections])));
        setDuration(result.duration);
        pendingCenter.current = selected || view.nodes.find((n) => n.type === 'REQUIREMENT')?.id;
      } catch (e) {
        if (sequence.current === token)
          setLayoutError(normalizeApiError(e, 'Não foi possível organizar o fluxo.'));
      } finally {
        if (sequence.current === token) setOrganizing(false);
      }
    },
    [base, view, selected]
  );
  // Selection changes must never recalculate layout. Only the visible collection changes it.
  const organizeRef = useRef(organize);
  organizeRef.current = organize;
  const invalidateLayout = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    void organizeRef.current();
    return invalidateLayout;
  }, [base, invalidateLayout]);
  useEffect(() => {
    if (nodes.length && pendingCenter.current) {
      center(pendingCenter.current);
      pendingCenter.current = null;
    }
  }, [nodes, center]);
  useEffect(() => {
    if (selected) center(selected);
  }, [selected, center]);
  function select(id) {
    const node = contract.nodes.find((n) => n.id === id);
    if (!node) return;
    const closed = presentGraph(contract, groups).nodes.filter(
      (n) => n.type === 'GROUP' && n.data.memberIds.includes(id) && !n.data.open
    );
    if (closed.length) setGroups((old) => [...new Set([...old, ...closed.map((n) => n.id)])]);
    setSelected(id);
    setHover(null);
    center(id);
  }
  function changes(changes) {
    const moved = changes.filter((c) => c.type === 'position' && c.position);
    if (moved.length) {
      manual.current = true;
      sequence.current++;
      setOrganizing(false);
      for (const c of moved) positions.current.set(c.id, c.position);
      setRoutes(new Map());
    }
    setNodes((old) =>
      applyNodeChanges(
        changes.filter((c) => !['remove', 'select'].includes(c.type)),
        old
      )
    );
  }
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
    setSelected(null);
    setHover(null);
    setGroups([]);
    setContract(traceability);
  }
  const closeInspector = () => {
    const id = selected;
    setSelected(null);
    setHover(null);
    queueMicrotask(() => document.querySelector(`[data-id="${id}"]`)?.focus());
  };
  const active = contract.nodes.find((n) => n.id === selected);
  const edges = base.edges.map((e) => {
    const label = `${relationLabels[e.relationType || e.type] || 'coleção de relações'}${e.failedStep ? ` · Passo ${e.failedStep}` : ''}${e.correctionCycle ? ` · Ciclo ${e.correctionCycle}` : ''}`;
    return {
      ...e,
      type: 'traceabilityEdge',
      data: { sections: routes.get(e.id), manual: manual.current },
      markerEnd: { type: MarkerType.ArrowClosed },
      focusable: true,
      ariaLabel: `${identity(contract.nodes.find((n) => n.id === e.source) || { type: 'GROUP', data: { number: e.source } })} ${label} ${identity(contract.nodes.find((n) => n.id === e.target) || { type: 'GROUP', data: { number: e.target } })}`,
      label:
        edgeFocus === e.id || (path.edges.has(e.id) && path.edges.size <= 4 && !e.presentation)
          ? label
          : undefined,
      className: `trace-edge-${e.hierarchy} ${edgeFocus === e.id || path.edges.has(e.id) ? 'trace-edge-highlight' : hover || selected ? 'trace-edge-dim' : ''}`
    };
  });
  return (
    <div className="traceability-flow">
      <div hidden={Boolean(detail)} className="trace-flow-session">
        <div className="traceability-flow-toolbar">
          <div className="traceability-flow-actions">
            <button
              className="button button-secondary button-compact"
              disabled={organizing}
              onClick={() => void organize(true)}
            >
              Organizar automaticamente
            </button>
            <button
              className="button button-secondary button-compact"
              onClick={() => center(selected)}
            >
              Centralizar fluxo
            </button>
            <button className="button button-secondary button-compact" onClick={collapse}>
              Recolher tudo
            </button>
          </div>
          <span role="status">
            {organizing
              ? 'Organizando fluxo…'
              : `${nodes.filter((n) => n.data.node.type !== 'GROUP').length} entidades visíveis`}
          </span>
        </div>
        {layoutError && (
          <ErrorState message={layoutError.message} onRetry={() => void organize(true)} />
        )}
        <div className={`trace-canvas-inspector ${active ? 'has-inspector' : ''}`}>
          <div
            className="traceability-flow-canvas"
            ref={canvasRef}
            aria-label="Grafo de rastreabilidade"
            data-layout-ms={duration?.toFixed(1)}
          >
            <ReactFlow
              nodes={nodes.map((n) => ({
                ...n,
                selected: n.id === selected,
                className: (hover || selected) && !path.nodes.has(n.id) ? 'trace-node-dim' : '',
                data: {
                  ...n.data,
                  selected: n.id === selected,
                  onSelect: () => select(n.id),
                  onGroup: () => setGroups((old) => toggled(old, n.id))
                }
              }))}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={changes}
              onNodeClick={(_, n) => {
                if (n.data.node.type !== 'GROUP') select(n.id);
              }}
              onNodeMouseEnter={(_, n) => setHover(n.id)}
              onNodeMouseLeave={() => setHover(null)}
              onEdgeMouseEnter={(_, edge) => setEdgeFocus(edge.id)}
              onEdgeMouseLeave={() => setEdgeFocus(null)}
              onPaneClick={() => {
                setSelected(null);
                setHover(null);
              }}
              onNodeDragStart={() => {
                manual.current = true;
                sequence.current++;
              }}
              minZoom={graphLayout.minZoom}
              maxZoom={graphLayout.maxZoom}
              defaultViewport={{ x: 40, y: 40, zoom: graphLayout.initialZoom }}
              nodesDraggable
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              nodesFocusable
              edgesFocusable
              autoPanOnNodeFocus
              onKeyDown={(e) => {
                const wrapper = e.target.closest?.('.react-flow__node');
                const id = wrapper?.getAttribute('data-id');
                // Native buttons own their activation; intercept only the node wrapper.
                if (id && e.target === wrapper && ['Enter', ' '].includes(e.key)) {
                  e.preventDefault();
                  if (flow.getNode(id)?.data.node.type === 'GROUP')
                    setGroups((old) => toggled(old, id));
                  else select(id);
                }
                if (e.key === 'Escape' && selected) {
                  e.preventDefault();
                  closeInspector();
                }
              }}
              onFocus={(e) => {
                const id = e.target.closest?.('.react-flow__node')?.getAttribute('data-id');
                if (id) setHover(id);
                const edgeId = e.target.closest?.('.react-flow__edge')?.getAttribute('data-id');
                if (edgeId) setEdgeFocus(edgeId);
              }}
              onBlur={() => {
                setHover(null);
                setEdgeFocus(null);
              }}
            >
              <Background />
              <Controls showInteractive={false} showFitView={false} orientation="horizontal" />
              <MiniMap className="trace-minimap" pannable zoomable ariaLabel="Mapa do fluxo" />
            </ReactFlow>
          </div>
          {active && (
            <TraceabilityInspector
              key={active.id}
              node={active}
              contract={contract}
              onClose={closeInspector}
              onSelect={select}
              onDetails={(n) => {
                detailReturn.current = document.activeElement;
                setDetail(n);
              }}
            />
          )}
        </div>
        <p className="traceability-flow-caption">
          Da esquerda para a direita · Arraste o fundo para explorar; selecione um artefato para
          entender suas relações.
        </p>
        {contract.pagination?.scope === 'graphNodes' &&
          contract.pagination.page < contract.pagination.totalPages && (
            <button className="button button-secondary" disabled={loading} onClick={more}>
              {loading ? 'Carregando relações…' : 'Carregar mais relações'}
            </button>
          )}
        {error && <ErrorState message={error.message} onRetry={more} />}
      </div>
      {detail && (
        <div className="trace-details-subview">
          <button
            autoFocus
            className="button button-secondary"
            onClick={() => {
              setDetail(null);
              queueMicrotask(() => detailReturn.current?.focus());
            }}
          >
            ← Voltar para o fluxo
          </button>
          <GraphEntityDetails
            key={detail.id}
            node={detail}
            projectId={contract.projectId}
            onClose={() => setDetail(null)}
          />
        </div>
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
