import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const labels = {
  REQUIREMENT: 'Requisito',
  TASK: 'Tarefa',
  COMMIT: 'Commit',
  PULL_REQUEST: 'Pull request',
  ISSUE: 'Issue'
};

const statusLabels = {
  CADASTRADO: 'Cadastrado', APROVADO: 'Aprovado', EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado', CONCLUIDO: 'Concluído', PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento', CANCELADO: 'Cancelado', A_FAZER: 'A Fazer'
};

const kindByType = {
  REQUIREMENT: 'requirement', TASK: 'task', COMMIT: 'commit',
  PULL_REQUEST: 'pull-request', ISSUE: 'issue'
};

function formatDate(value) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Não informado'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatPercentage(metric, legacyValue) {
  if (metric?.hasData === false) return 'Sem dados';
  const value = metric?.percentage ?? legacyValue;
  return value == null ? 'Sem dados' : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function DetailRow({ label, value, href }) {
  const display = value === undefined || value === null || value === '' ? 'Não informado' : value;
  return (
    <div className="trace-node-detail-row">
      <dt>{label}</dt>
      <dd>{href ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{display}</a> : display}</dd>
    </div>
  );
}

function NodeDetails({ type, detail }) {
  if (type === 'REQUIREMENT') return (
    <dl className="trace-node-detail">
      <DetailRow label="Descrição" value={detail.description} />
      <DetailRow label="Tipo" value={detail.type} />
      <DetailRow label="Status" value={statusLabels[detail.status] || detail.status} />
      <DetailRow label="Progresso" value={formatPercentage(detail.progress, detail.progressPercentage)} />
      <DetailRow label="Situação" value={detail.implementationStatus} />
      <DetailRow label="Evidência técnica" value={detail.hasTechnicalEvidence ? 'Sim' : 'Não'} />
      <DetailRow label="Criado em" value={formatDate(detail.createdAt)} />
    </dl>
  );
  if (type === 'TASK') return (
    <dl className="trace-node-detail">
      <DetailRow label="Descrição" value={detail.description} />
      <DetailRow label="Status" value={statusLabels[detail.status] || detail.status} />
      <DetailRow label="Prioridade" value={detail.priority} />
      <DetailRow label="Responsável" value={detail.responsible} />
      <DetailRow label="Prazo" value={formatDate(detail.deadline)} />
      <DetailRow label="Esforço estimado" value={detail.estimatedEffort} />
      <DetailRow label="Esforço realizado" value={detail.actualEffort} />
    </dl>
  );
  if (type === 'COMMIT') return (
    <dl className="trace-node-detail">
      <DetailRow label="Hash curto" value={detail.shortHash} />
      <DetailRow label="Hash completo" value={detail.hash} />
      <DetailRow label="Mensagem" value={detail.message} />
      <DetailRow label="Autor" value={detail.authorName || detail.authorUsername} />
      <DetailRow label="Data" value={formatDate(detail.date)} />
      <DetailRow label="Branch" value={detail.branch} />
      {detail.githubUrl && <DetailRow label="GitHub" value="Abrir no GitHub" href={detail.githubUrl} />}
    </dl>
  );
  return (
    <dl className="trace-node-detail">
      <DetailRow label="Número" value={detail.number ? `#${detail.number}` : undefined} />
      <DetailRow label="Estado" value={detail.state} />
      <DetailRow label="Autor" value={detail.authorUsername} />
      <DetailRow label="Criado em" value={formatDate(detail.createdAtGithub)} />
      <DetailRow label="Fechado em" value={formatDate(detail.closedAtGithub)} />
      {detail.githubUrl && <DetailRow label="GitHub" value="Abrir no GitHub" href={detail.githubUrl} />}
    </dl>
  );
}

function GraphNode({ data }) {
  return (
    <div className={`trace-node trace-node-${data.kind} ${data.expanded ? 'trace-node-expanded' : ''}`}>
      {data.hasTarget && <Handle type="target" position={Position.Top} />}
      <button className="trace-node-content" type="button" onClick={data.onToggle}>
        <span>{labels[data.type]}</span>
        <strong>{data.title}</strong>
        {data.meta && <p>{data.meta}</p>}
        <small>{data.expanded ? 'Clique para recolher' : 'Clique para ver detalhes'}</small>
      </button>
      {data.expanded && <NodeDetails type={data.type} detail={data.detail} />}
      {data.hasSource && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}

function nodeTitle(node) {
  const data = node.data || {};
  if (node.type === 'COMMIT') return data.message || data.shortHash || data.hash;
  if (node.type === 'PULL_REQUEST') return `#${data.number} — ${data.title}`;
  if (node.type === 'ISSUE') return `#${data.number} — ${data.title}`;
  return data.title;
}

function nodeMeta(node) {
  const data = node.data || {};
  if (node.type === 'REQUIREMENT') return `${statusLabels[data.status] || data.status} · ${formatPercentage(data.progress, data.progressPercentage)}`;
  if (node.type === 'TASK') return statusLabels[data.status] || data.status;
  if (node.type === 'COMMIT') return data.authorName || data.authorUsername || 'Autor não informado';
  return data.state;
}

export function buildFlow(contract, expanded, toggle) {
  const contractNodes = contract?.nodes || [];
  const incoming = new Set((contract?.edges || []).map((edge) => edge.target));
  const outgoing = new Set((contract?.edges || []).map((edge) => edge.source));
  const groups = { REQUIREMENT: [], TASK: [], ARTIFACT: [] };
  for (const node of contractNodes) {
    if (node.type === 'REQUIREMENT') groups.REQUIREMENT.push(node);
    else if (node.type === 'TASK') groups.TASK.push(node);
    else groups.ARTIFACT.push(node);
  }
  const positions = new Map();
  for (const [groupIndex, group] of [groups.REQUIREMENT, groups.TASK, groups.ARTIFACT].entries()) {
    const width = Math.max(group.length - 1, 0) * 460;
    group.forEach((node, index) => positions.set(node.id, { x: index * 460 - width / 2, y: groupIndex * 410 }));
  }
  const nodes = contractNodes.map((node) => ({
    id: node.id,
    type: 'traceabilityNode',
    position: positions.get(node.id) || { x: 0, y: 0 },
    data: {
      type: node.type,
      kind: kindByType[node.type],
      title: nodeTitle(node),
      meta: nodeMeta(node),
      detail: node.data,
      expanded: expanded.includes(node.id),
      onToggle: () => toggle(node.id),
      hasTarget: incoming.has(node.id),
      hasSource: outgoing.has(node.id)
    }
  }));
  const edges = (contract?.edges || []).map((edge) => ({
    ...edge,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed }
  }));
  return { nodes, edges };
}

const nodeTypes = { traceabilityNode: GraphNode };

function Canvas({ traceability }) {
  const { fitView } = useReactFlow();
  const [expanded, setExpanded] = useState([]);
  const { nodes, edges } = useMemo(() => buildFlow(traceability, expanded, (id) => {
    setExpanded((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }), [expanded, traceability]);

  useEffect(() => setExpanded([]), [traceability?.perspective?.type, traceability?.perspective?.id]);
  if (!nodes.length) return <p className="empty-state">Nenhum vínculo encontrado para esta perspectiva.</p>;

  return (
    <div className="traceability-flow">
      <div className="traceability-flow-toolbar">
        <div><span className="eyebrow">Fluxo visual</span><p>Os vínculos e indicadores são fornecidos pelo contrato canônico da API.</p></div>
        <button className="button button-secondary" type="button" onClick={() => window.requestAnimationFrame(() => fitView({ padding: 0.18, duration: 350 }))}>Centralizar fluxo</button>
      </div>
      <div className="traceability-flow-canvas">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable>
          <Background /><Controls /><MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export function TraceabilityFlow({ traceability }) {
  return <ReactFlowProvider><Canvas traceability={traceability} /></ReactFlowProvider>;
}
