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

const requirementStatusLabels = {
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado',
  CONCLUIDO: 'Concluído',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CANCELADO: 'Cancelado'
};

const taskStatusLabels = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
};

const requirementTypeLabels = {
  FUNCIONAL: 'Funcional',
  NAO_FUNCIONAL: 'Não funcional',
  REGRA_NEGOCIO: 'Regra de negócio'
};

const priorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

const implementationStatusLabels = {
  SEM_RASTREABILIDADE: 'Sem rastreabilidade',
  PLANEJADO: 'Planejado',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  IMPLEMENTADO: 'Implementado',
  CONCLUIDO: 'Concluído'
};

function formatPercentage(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 2
  })}%`;
}

function formatRequirementStatus(status) {
  return requirementStatusLabels[status] || status || 'Não informado';
}

function formatTaskStatus(status) {
  return taskStatusLabels[status] || status || 'Não informado';
}

function formatRequirementType(type) {
  return requirementTypeLabels[type] || type || 'Não informado';
}

function formatPriority(priority) {
  return priorityLabels[priority] || priority || 'Não informado';
}

function formatImplementationStatus(status) {
  return implementationStatusLabels[status] || status || 'Não informado';
}

function formatDate(value) {
  if (!value) {
    return 'Não informado';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function formatLabels(labels) {
  if (!labels) {
    return '';
  }

  if (Array.isArray(labels)) {
    return labels
      .map((label) => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean)
      .join(', ');
  }

  if (typeof labels === 'string') {
    return labels;
  }

  if (typeof labels === 'object') {
    return Object.values(labels)
      .map((label) => (typeof label === 'string' ? label : label?.name))
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

function getAuthorLabel(item) {
  return item.authorName || item.authorUsername || item.authorEmail || 'Não informado';
}

function shortText(value, maxLength = 72) {
  const text = String(value || '').trim();

  if (text.length <= maxLength) {
    return text || 'Sem título';
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function DetailRow({ label, value, href }) {
  const hasValue = value !== undefined && value !== null && value !== '';

  if (href) {
    return (
      <div className="trace-node-detail-row">
        <dt>{label}</dt>
        <dd>
          <a href={href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
            {hasValue ? value : 'Abrir no GitHub'}
          </a>
        </dd>
      </div>
    );
  }

  return (
    <div className="trace-node-detail-row">
      <dt>{label}</dt>
      <dd>{hasValue ? value : 'Não informado'}</dd>
    </div>
  );
}

function TraceabilityNodeDetails({ kind, detail }) {
  if (!detail) {
    return null;
  }

  if (kind === 'requirement') {
    return (
      <dl className="trace-node-detail">
        <DetailRow label="Descrição" value={detail.description} />
        <DetailRow label="Tipo" value={formatRequirementType(detail.type)} />
        <DetailRow label="Status" value={formatRequirementStatus(detail.status)} />
        <DetailRow label="Progresso" value={formatPercentage(detail.progressPercentage)} />
        <DetailRow
          label="Situação"
          value={formatImplementationStatus(detail.implementationStatus)}
        />
        <DetailRow
          label="Evidência técnica"
          value={detail.hasTechnicalEvidence ? 'Sim' : 'Não'}
        />
        <DetailRow label="Criado em" value={formatDate(detail.createdAt)} />
        <DetailRow label="Tarefas vinculadas" value={detail.tasksCount} />
      </dl>
    );
  }

  if (kind === 'task') {
    return (
      <dl className="trace-node-detail">
        <DetailRow label="Descrição" value={detail.description} />
        <DetailRow label="Status" value={formatTaskStatus(detail.status)} />
        <DetailRow label="Prioridade" value={formatPriority(detail.priority)} />
        <DetailRow label="Responsável" value={detail.responsible} />
        <DetailRow label="Prazo" value={formatDate(detail.deadline)} />
        <DetailRow label="Esforço estimado" value={detail.estimatedEffort} />
        <DetailRow label="Issues" value={detail.issuesCount} />
        <DetailRow label="Pull request" value={detail.pullRequestLabel} />
        <DetailRow label="Commits" value={detail.commitsCount} />
      </dl>
    );
  }

  if (kind === 'issue') {
    const labels = formatLabels(detail.labels);

    return (
      <dl className="trace-node-detail">
        <DetailRow label="Número" value={`#${detail.number}`} />
        <DetailRow label="Estado" value={detail.state} />
        <DetailRow label="Autor" value={getAuthorLabel(detail)} />
        <DetailRow label="Responsável" value={detail.assigneeUsername} />
        {labels && <DetailRow label="Labels" value={labels} />}
        <DetailRow label="Criada em" value={formatDate(detail.createdAtGithub)} />
        <DetailRow label="Fechada em" value={formatDate(detail.closedAtGithub)} />
        {detail.githubUrl && (
          <DetailRow label="GitHub" value="Abrir no GitHub" href={detail.githubUrl} />
        )}
      </dl>
    );
  }

  if (kind === 'pull-request') {
    return (
      <dl className="trace-node-detail">
        <DetailRow label="Número" value={`#${detail.number}`} />
        <DetailRow label="Estado" value={detail.state} />
        <DetailRow label="Autor" value={getAuthorLabel(detail)} />
        <DetailRow label="Origem" value={detail.sourceBranch} />
        <DetailRow label="Destino" value={detail.targetBranch} />
        <DetailRow label="Criado em" value={formatDate(detail.createdAtGithub)} />
        <DetailRow label="Fechado em" value={formatDate(detail.closedAtGithub)} />
        <DetailRow label="Mergeado em" value={formatDate(detail.mergedAtGithub)} />
        {detail.githubUrl && (
          <DetailRow label="GitHub" value="Abrir no GitHub" href={detail.githubUrl} />
        )}
      </dl>
    );
  }

  if (kind === 'commit') {
    return (
      <dl className="trace-node-detail">
        <DetailRow label="Hash curto" value={detail.shortHash} />
        <DetailRow label="Hash completo" value={detail.hash} />
        <DetailRow label="Mensagem" value={detail.message} />
        <DetailRow label="Autor" value={getAuthorLabel(detail)} />
        <DetailRow label="Data" value={formatDate(detail.date)} />
        <DetailRow label="Branch" value={detail.branch} />
        {detail.githubUrl && (
          <DetailRow label="GitHub" value="Abrir no GitHub" href={detail.githubUrl} />
        )}
      </dl>
    );
  }

  return null;
}

function TraceabilityNode({ data }) {
  return (
    <div
      className={`trace-node trace-node-${data.kind} ${
        data.expanded ? 'trace-node-expanded' : ''
      }`}
    >
      {data.hasTarget && <Handle type="target" position={Position.Top} />}
      <button className="trace-node-content" type="button" onClick={data.onToggle}>
        <span>{data.label}</span>
        <strong>{data.title}</strong>
        {data.meta && <p>{data.meta}</p>}
        <small>{data.expanded ? 'Clique para recolher' : 'Clique para ver detalhes'}</small>
      </button>
      {data.expanded && <TraceabilityNodeDetails kind={data.kind} detail={data.detail} />}
      {data.hasSource && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}

function createNode(id, kind, position, data) {
  return {
    id,
    type: 'traceabilityNode',
    position,
    data: {
      kind,
      ...data
    }
  };
}

function createEdge(id, source, target) {
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    markerEnd: {
      type: MarkerType.ArrowClosed
    }
  };
}

const COLLAPSED_NODE_HEIGHT = 140;
const EXPANDED_NODE_HEIGHT = 470;
const LEVEL_GAP = 160;
const TASK_HORIZONTAL_GAP = 160;
const ARTIFACT_HORIZONTAL_GAP = 460;
const TASK_NODE_WIDTH = 420;

function isExpanded(expandedNodeIds, nodeId) {
  return expandedNodeIds.includes(nodeId);
}

function getNodeHeight(expandedNodeIds, nodeId) {
  return isExpanded(expandedNodeIds, nodeId)
    ? EXPANDED_NODE_HEIGHT
    : COLLAPSED_NODE_HEIGHT;
}

function buildFlow(traceability, expandedNodeIds, onToggleNode) {
  if (!traceability?.requirement) {
    return { nodes: [], edges: [] };
  }

  const tasks = traceability.tasks || [];
  const nodes = [];
  const edges = [];
  const rootX = 0;
  const rootY = 0;
  const requirementHeight = getNodeHeight(expandedNodeIds, 'requirement');
  const taskY = rootY + requirementHeight + LEVEL_GAP;
  const taskBlueprints = tasks.map((task) => {
    const taskId = `task-${task.id}`;
    const artifacts = [
      ...(task.issues || []).map((issue) => ({
        id: `task-${task.id}-issue-${issue.id}`,
        kind: 'issue',
        label: `Issue #${issue.number}`,
        title: issue.title,
        meta: issue.state || 'Sem estado',
        detail: issue
      })),
      ...(task.pullRequest
        ? [
            {
              id: `task-${task.id}-pull-request-${task.pullRequest.id}`,
              kind: 'pull-request',
              label: `PR #${task.pullRequest.number}`,
              title: task.pullRequest.title,
              meta: task.pullRequest.state || 'Sem estado',
              detail: task.pullRequest
            }
          ]
        : []),
      ...(task.commits || []).map((commit) => ({
        id: `task-${task.id}-commit-${commit.id}`,
        kind: 'commit',
        label: `Commit ${commit.shortHash || commit.hash?.slice(0, 7) || ''}`,
        title: commit.message,
        meta: commit.authorName || 'Autor não informado',
        detail: commit
      }))
    ];
    const artifactWidth =
      artifacts.length > 0 ? (artifacts.length - 1) * ARTIFACT_HORIZONTAL_GAP + TASK_NODE_WIDTH : 0;
    const subtreeWidth = Math.max(TASK_NODE_WIDTH, artifactWidth);

    return {
      task,
      taskId,
      artifacts,
      subtreeWidth
    };
  });
  const totalTreeWidth =
    taskBlueprints.reduce((sum, blueprint) => sum + blueprint.subtreeWidth, 0) +
    Math.max(taskBlueprints.length - 1, 0) * TASK_HORIZONTAL_GAP;
  let nextTaskStartX = -totalTreeWidth / 2;
  const artifactY =
    taskY +
    Math.max(
      COLLAPSED_NODE_HEIGHT,
      ...taskBlueprints.map((blueprint) => getNodeHeight(expandedNodeIds, blueprint.taskId))
    ) +
    LEVEL_GAP;

  nodes.push(
    createNode('requirement', 'requirement', { x: rootX, y: rootY }, {
      label: 'Requisito',
      title: traceability.requirement.title,
      meta: `${formatRequirementStatus(traceability.requirement.status)} · ${formatPercentage(
        traceability.requirement.progressPercentage
      )}`,
      hasSource: tasks.length > 0,
      expanded: isExpanded(expandedNodeIds, 'requirement'),
      onToggle: () => onToggleNode('requirement'),
      detail: {
        ...traceability.requirement,
        tasksCount: tasks.length
      }
    })
  );

  taskBlueprints.forEach(({ task, taskId, artifacts, subtreeWidth }) => {
    const taskX = nextTaskStartX + subtreeWidth / 2;
    nextTaskStartX += subtreeWidth + TASK_HORIZONTAL_GAP;
    const taskPullRequestLabel = task.pullRequest
      ? `#${task.pullRequest.number} — ${task.pullRequest.title}`
      : 'Nenhum PR';

    nodes.push(
      createNode(taskId, 'task', { x: taskX, y: taskY }, {
        label: 'Tarefa',
        title: task.title,
        meta: `${formatTaskStatus(task.status)}${
          task.responsible ? ` · ${task.responsible}` : ''
        }`,
        hasTarget: true,
        hasSource: artifacts.length > 0,
        expanded: isExpanded(expandedNodeIds, taskId),
        onToggle: () => onToggleNode(taskId),
        detail: {
          ...task,
          issuesCount: task.issues?.length || 0,
          pullRequestLabel: taskPullRequestLabel,
          commitsCount: task.commits?.length || 0
        }
      })
    );
    edges.push(createEdge(`requirement-${taskId}`, 'requirement', taskId));

    artifacts.forEach((artifact, artifactIndex) => {
      const artifactX =
        taskX + (artifactIndex - (artifacts.length - 1) / 2) * ARTIFACT_HORIZONTAL_GAP;

      nodes.push(
        createNode(artifact.id, artifact.kind, { x: artifactX, y: artifactY }, {
          label: artifact.label,
          title: shortText(artifact.title),
          meta: artifact.meta,
          hasTarget: true,
          expanded: isExpanded(expandedNodeIds, artifact.id),
          onToggle: () => onToggleNode(artifact.id),
          detail: artifact.detail
        })
      );
      edges.push(createEdge(`${taskId}-${artifact.id}`, taskId, artifact.id));
    });
  });

  return { nodes, edges };
}

const nodeTypes = {
  traceabilityNode: TraceabilityNode
};

function TraceabilityFlowCanvas({ traceability }) {
  const { fitView } = useReactFlow();
  const [expandedNodeIds, setExpandedNodeIds] = useState([]);
  const { nodes, edges } = useMemo(
    () =>
      buildFlow(traceability, expandedNodeIds, (nodeId) => {
        setExpandedNodeIds((currentNodeIds) =>
          currentNodeIds.includes(nodeId)
            ? currentNodeIds.filter((currentNodeId) => currentNodeId !== nodeId)
            : [...currentNodeIds, nodeId]
        );
      }),
    [expandedNodeIds, traceability]
  );

  useEffect(() => {
    setExpandedNodeIds([]);
  }, [traceability?.requirement?.id]);

  function centerFlow() {
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.18, duration: 350 });
    });
  }

  if (!traceability?.requirement) {
    return <p className="empty-state">Selecione um requisito para visualizar o fluxo.</p>;
  }

  return (
    <div className="traceability-flow">
      <div className="traceability-flow-toolbar">
        <div>
          <span className="eyebrow">Fluxo visual</span>
          <p>Arraste o canvas, use zoom e acompanhe a cadeia rastreável.</p>
        </div>
        <button className="button button-secondary" type="button" onClick={centerFlow}>
          Centralizar fluxo
        </button>
      </div>

      {traceability.tasks.length === 0 && (
        <p className="traceability-flow-empty">
          Este requisito ainda não possui tarefas vinculadas.
        </p>
      )}

      <div className="traceability-flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export function TraceabilityFlow({ traceability }) {
  return (
    <ReactFlowProvider>
      <TraceabilityFlowCanvas traceability={traceability} />
    </ReactFlowProvider>
  );
}
