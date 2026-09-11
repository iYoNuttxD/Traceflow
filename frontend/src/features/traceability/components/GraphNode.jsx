import { Handle, Position } from '@xyflow/react';
import { TraceFlowIcon } from '../../../shared/index.js';
import { TestResultBadge, environments, referenceLabel } from '../../testCases/index.js';
import { DefectBadge } from '../../defects/index.js';
import { taskStatusLabels, taskPriorityLabels } from '../../tasks/index.js';
import { situations, requirementStatuses, percentageLabel } from '../model/requirement-view.js';
import { identity, nodeLabels } from '../model/graph.js';
const date = (value) => (value ? new Date(value).toLocaleString('pt-BR') : '—');
const compactIds = (items, prefix, key = 'id', total = items?.length || 0) =>
  items?.length
    ? items
        .slice(0, 4)
        .map((t) => `${prefix}-${t[key]}`)
        .join(', ') + (total > 4 ? ` +${total - 4}` : '')
    : 'Nenhum';
function fields(type, d) {
  if (type === 'REQUIREMENT') {
    const p = d.projection;
    return [
      ['Status', requirementStatuses[d.status] || d.status],
      ['Situação', situations[p?.situation]?.[0]],
      ['Progresso', p ? percentageLabel(p.progress) : '—'],
      ['Tarefas', p ? `${p.progress.tasksDone}/${p.progress.tasksTotal}` : '—'],
      ['Testes / defeitos', p ? `${p.validation.testCasesTotal} / ${p.defects.total}` : '—'],
      [
        'Evidências',
        p
          ? `Implementação: ${p.evidence.implementation ? 'presente' : 'ausente'} · Validação: ${p.evidence.validation ? 'presente' : 'ausente'} · Correção: ${{ NOT_APPLICABLE: 'não aplicável', PRESENT: 'presente', MISSING: 'ausente' }[p.evidence.correction]}`
          : '—'
      ]
    ];
  }
  if (type === 'TASK')
    return [
      [
        'Status / prioridade',
        `${taskStatusLabels[d.status] || d.status} · ${taskPriorityLabels[d.priority] || d.priority || '—'}`
      ],
      ['Responsável', d.responsible],
      ['Sprint', d.sprint?.name],
      ['Requisito', d.requirement ? `REQ-${d.requirement.id} · ${d.requirement.title}` : 'Nenhum'],
      [
        'PR / commits',
        `${d.pullRequestId ? 1 : 0} / ${d.commitCount ?? d.commitLinks?.length ?? 0}`
      ],
      ['Correção de', compactIds(d.correctionDefects, 'DEF', 'id', d.correctionDefectCount)]
    ];
  if (type === 'TEST_CASE')
    return [
      ['Responsável', d.responsible],
      ['Versão atual', `v${d.currentVersion}`],
      ['Requisito', d.requirementId ? `REQ-${d.requirementId}` : 'Sem vínculo direto'],
      ['Tarefas', compactIds(d.taskLinks, 'TASK', 'taskId', d.taskCount)],
      [
        'Última execução atual',
        d.latestExecution
          ? `EXEC-${String(d.latestExecution.id).padStart(4, '0')} · ${d.latestExecution.result}`
          : 'Nunca executado'
      ],
      ['Execuções / defeitos', `${d.executionCount} / ${d.defectCount}`]
    ];
  if (type === 'TEST_EXECUTION')
    return [
      ['Executor', d.executedByDisplayNameSnapshot],
      ['Data', date(d.executedAt)],
      ['Ambiente', environments[d.environment] || d.environment],
      ['Caso / versão', `TC-${d.testCaseId} · v${d.testCaseVersion}`],
      ['Referência testada', referenceLabel(d.testedReferenceSnapshot || {})],
      [
        'Passos',
        `PASS ${d.stepCounts?.PASS || 0} · FAIL ${d.stepCounts?.FAIL || 0} · BLOCKED ${d.stepCounts?.BLOCKED || 0}`
      ],
      ['Evidências', d._count?.evidence ?? 0]
    ];
  if (type === 'DEFECT')
    return [
      ['Responsável', d.responsible],
      [
        'Detectado em',
        `EXEC-${String(d.detectedStep?.executionId).padStart(4, '0')} · Passo ${d.detectedStep?.position}`
      ],
      ['Ciclo atual', d.currentCorrectionCycle],
      [
        'Tarefas de correção',
        d.correctionTaskCount ??
          d.taskLinks?.filter(
            (l) => l.relationType === 'CORRECTION' && l.correctionCycle === d.currentCorrectionCycle
          ).length ??
          0
      ],
      ['Último reteste', d.latestRetest || 'Não realizado']
    ];
  if (type === 'COMMIT')
    return [
      ['Hash', d.hash],
      ['Autor', d.authorName || d.authorUsername],
      ['Data', date(d.date)]
    ];
  return [
    ['Estado', d.state],
    ['Autor', d.authorUsername],
    ['Branches', d.sourceBranch ? `${d.sourceBranch} → ${d.targetBranch}` : null]
  ];
}
function Status({ type, detail: d }) {
  if (type === 'REQUIREMENT')
    return (
      <span
        className={`tc-badge tc-badge--${situations[d.projection?.situation]?.[1] || 'neutral'}`}
      >
        {situations[d.projection?.situation]?.[0] || requirementStatuses[d.status] || d.status}
      </span>
    );
  if (type === 'TASK')
    return (
      <span className="tc-badge tc-badge--neutral">{taskStatusLabels[d.status] || d.status}</span>
    );
  if (type === 'TEST_CASE')
    return (
      <>
        <TestResultBadge value={d.status} />
        <TestResultBadge
          value={d.latestExecution?.result || 'NEVER'}
          raw={Boolean(d.latestExecution)}
        />
      </>
    );
  if (type === 'TEST_EXECUTION')
    return (
      <>
        <TestResultBadge value={d.result} raw />
        <span>{environments[d.environment] || d.environment}</span>
      </>
    );
  if (type === 'DEFECT')
    return (
      <>
        <DefectBadge value={d.severity} />
        <DefectBadge value={d.status} />
      </>
    );
  return d.state ? <span className="tc-badge tc-badge--neutral">{d.state}</span> : null;
}
export function GraphNode({ data }) {
  const focus = () => data.onFocus?.();
  if (data.node.type === 'GROUP') {
    const g = data.node.data;
    return (
      <div className="trace-node trace-node-group">
        <Handle type="target" position={Position.Top} />
        <span className="eyebrow">{g.label}</span>
        <strong>{g.count} relacionados</strong>
        <span className="trace-node-hint">{g.ownerLabel}</span>
        <button
          className="button button-secondary nodrag"
          aria-expanded={g.open}
          onClick={data.onGroup}
          onFocus={focus}
          aria-label={`${g.open ? 'Recolher' : `Expandir ${g.count}`} ${g.label} de ${g.ownerLabel}`}
        >
          {g.open ? 'Recolher relações' : 'Expandir relações'}
        </button>
      </div>
    );
  }
  const n = data.node,
    d = n.data,
    id = identity(n);
  const openLabel = {
    TASK: 'Abrir tarefa',
    TEST_CASE: 'Abrir caso de teste',
    TEST_EXECUTION: 'Abrir execução',
    DEFECT: 'Abrir defeito'
  }[n.type];
  return (
    <div className={`trace-node ${data.expanded ? 'trace-node-expanded' : ''}`}>
      {data.hasTarget && <Handle type="target" position={Position.Top} />}
      <button
        className="trace-node-content nodrag"
        onClick={data.onToggle}
        onFocus={focus}
        aria-expanded={data.expanded}
        aria-label={`${data.expanded ? 'Recolher' : 'Expandir'} informações de ${id}`}
      >
        <span className="trace-node-heading">
          <span className="eyebrow">{nodeLabels[n.type]}</span>
          <span>{id}</span>
        </span>
        <strong>
          {n.type === 'TEST_EXECUTION'
            ? `TC-${d.testCaseId} · v${d.testCaseVersion}`
            : d.title || d.message || id}
        </strong>
        {n.type === 'TASK' && Boolean(d.correctionDefects?.length) && (
          <span className="task-correction-badge">
            <TraceFlowIcon name="bug" /> CORREÇÃO
          </span>
        )}
        {d.retests?.length > 0 && n.type === 'TEST_EXECUTION' && (
          <span className="trace-node-context">
            RETESTE · {d.retests.map((r) => `DEF-${r.defectId}`).join(', ')}
          </span>
        )}
        <span className="trace-node-badges">
          <Status type={n.type} detail={d} />
        </span>
        <span className="trace-node-hint">
          {data.expanded ? 'Recolher informações' : 'Ver informações'}
        </span>
      </button>
      {data.expanded && (
        <div className="trace-node-extra nodrag nowheel">
          <dl className="trace-node-detail">
            {fields(n.type, d).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {openLabel && (
            <button
              className="button button-secondary"
              onClick={(e) => data.onOpen(n, e.currentTarget)}
            >
              {openLabel}
            </button>
          )}
          {d.githubUrl && (
            <a
              className="button button-secondary"
              href={d.githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no GitHub
            </a>
          )}
        </div>
      )}
      {data.hasSource && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
