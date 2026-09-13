import {
  GithubExternalAction,
  computeEffortView,
  resolveEffort,
  formatHoursMinutes,
  EFFORT_STATUS_TONES,
  EFFORT_STATUS_LABELS,
  taskPriorityLabels
} from '../../tasks/index.js';
import { DetailSurface } from '../../../shared/index.js';
import { graphFields, GraphStatus } from './GraphNode.jsx';
import { identity, nodeLabels, relationLabels } from '../model/graph.js';
import { phaseLabel } from '../model/phase.js';
import { TraceabilityHelp } from './TraceabilityHelp.jsx';
export function TraceabilityInspector({ node, contract, onClose, onSelect, onDetails }) {
  const d = node.data;
  const related = contract.edges.filter((e) => e.source === node.id || e.target === node.id);
  const entities = new Map(contract.nodes.map((n) => [n.id, n]));
  const p = d.projection;
  const fields = graphFields(node.type, d);
  if (node.type === 'TASK') {
    const index = fields.findIndex(([label]) => label === 'PR / commits');
    const pr = entities.get(`pull-request:${d.pullRequestId}`);
    fields.splice(
      index,
      1,
      [
        'Pull request',
        pr ? `PR #${pr.data.number}` : d.pullRequestId ? 'Em outra página' : 'Nenhum'
      ],
      ['Commits', d.commitCount ?? d.commitLinks?.length ?? 0]
    );
  }
  if (['PULL_REQUEST', 'COMMIT', 'ISSUE'].includes(node.type)) {
    const tasks = [
      ...new Set(related.map((edge) => (edge.source === node.id ? edge.target : edge.source)))
    ]
      .map((id) => entities.get(id))
      .filter((entity) => entity?.type === 'TASK');
    fields.push([
      'Tarefas relacionadas',
      tasks.length
        ? tasks.slice(0, 4).map(identity).join(' · ') +
          (tasks.length > 4 ? ` +${tasks.length - 4}` : '')
        : 'Nenhuma carregada'
    ]);
    for (const [label, key] of [
      ['Criado em', 'createdAtGithub'],
      ['Encerrado em', 'closedAtGithub'],
      ['Merge em', 'mergedAtGithub']
    ])
      if (d[key]) fields.push([label, new Date(d[key]).toLocaleString('pt-BR')]);
  }
  const traceLabels = new Set([
    'Requisito',
    'Pull request',
    'Commits',
    'Tarefas relacionadas',
    'Correção de',
    'Tarefas',
    'Testes / defeitos',
    'Evidências',
    'Caso / versão',
    'Referência testada',
    'Detectado em'
  ]);
  const renderFields = (items) => (
    <dl className="trace-inspector-fields">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {label === 'Responsável' && value ? (
              <span className="tc-card-responsible">
                <span className="tc-avatar" aria-hidden="true">
                  {value.slice(0, 1)}
                </span>
                {value}
              </span>
            ) : (
              (value ?? '—')
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  const effort =
    node.type === 'TASK'
      ? computeEffortView({ effort: resolveEffort(null, d), liveSeconds: 0 })
      : null;
  return (
    <aside className="trace-inspector" aria-label={`Inspector de ${identity(node)}`}>
      <header>
        <div>
          <span className="eyebrow">{nodeLabels[node.type]}</span>
          <h3 tabIndex={-1}>{identity(node)}</h3>
        </div>
        <button className="button button-secondary button-compact" onClick={onClose}>
          Fechar Inspector
        </button>
      </header>
      <h4>{d.title || d.message || `${identity(node)} · TC-${d.testCaseId}`}</h4>
      <div className="trace-node-badges">
        <GraphStatus type={node.type} detail={d} />
        {node.type === 'TASK' && d.priority && (
          <span className={`priority-badge priority-${d.priority.toLowerCase()}`}>
            {taskPriorityLabels[d.priority] || d.priority}
          </span>
        )}
      </div>
      {node.type === 'REQUIREMENT' && (
        <p>
          Fase atual: <strong>{phaseLabel(p?.situation)}</strong>
          <TraceabilityHelp topic="phase" />
        </p>
      )}
      {node.type === 'TASK' && d.correctionDefects?.length > 0 && (
        <p>
          Papel: Correção de{' '}
          {d.correctionDefects.map((v) => `DEF-${v.id} (ciclo ${v.cycle})`).join(', ')}
        </p>
      )}
      {node.type === 'TEST_EXECUTION' && d.retests?.length > 0 && (
        <p>
          Contexto: Reteste de{' '}
          {d.retests.map((v) => `DEF-${v.defectId} · ciclo ${v.correctionCycle}`).join(', ')}
        </p>
      )}
      <DetailSurface title="Informações">
        {renderFields(
          fields.filter(([label]) => !traceLabels.has(label) && label !== 'Status / prioridade')
        )}
      </DetailSurface>
      {effort && (
        <DetailSurface title="Esforço">
          <dl className="trace-inspector-fields">
            <div>
              <dt>Estimado</dt>
              <dd>
                {d.estimatedEffort == null
                  ? 'Não informado'
                  : `${Number(d.estimatedEffort).toLocaleString('pt-BR')}h`}
              </dd>
            </div>
            <div>
              <dt>Realizado</dt>
              <dd>{effort.totalSeconds ? formatHoursMinutes(effort.totalSeconds) : '0h'}</dd>
            </div>
            {effort.usagePercent != null && (
              <div>
                <dt>Progresso do esforço</dt>
                <dd>
                  <span className={`tc-badge tc-badge--${EFFORT_STATUS_TONES[effort.status]}`}>
                    {Number(effort.usagePercent).toLocaleString('pt-BR')}%
                  </span>
                </dd>
              </div>
            )}
          </dl>
          {d.estimatedEffort != null && <small>{EFFORT_STATUS_LABELS[effort.status]}</small>}
        </DetailSurface>
      )}
      {fields.some(([label]) => traceLabels.has(label)) && (
        <DetailSurface title="Rastreabilidade">
          {renderFields(fields.filter(([label]) => traceLabels.has(label)))}
        </DetailSurface>
      )}
      {p && (
        <DetailSurface title="Evidências da cadeia">
          <dl className="trace-inspector-fields">
            <div>
              <dt>Artefatos</dt>
              <dd>
                {p.artifacts.pullRequests} PRs · {p.artifacts.commits} commits ·{' '}
                {p.artifacts.issues} issues
                <p>
                  Contagem da projeção: um PR compartilhado pode contar em mais de uma tarefa. No
                  fluxo, cada artefato aparece uma vez.
                </p>
              </dd>
            </div>
            <div>
              <dt>Resultados atuais</dt>
              <dd>
                {p.validation.pass} PASS · {p.validation.fail} FAIL · {p.validation.blocked} BLOCKED
                · {p.validation.neverExecuted} nunca executados
              </dd>
            </div>
            <div>
              <dt>Defeitos por situação</dt>
              <dd>
                {p.defects.open} abertos · {p.defects.inCorrection} em correção ·{' '}
                {p.defects.waitingRetest} aguardando reteste · {p.defects.validated} validados
              </dd>
            </div>
          </dl>
        </DetailSurface>
      )}
      <DetailSurface title="Relações na cadeia">
        {related.length ? (
          <ul>
            {related.map((e) => {
              const other = entities.get(e.source === node.id ? e.target : e.source);
              return (
                <li key={e.id}>
                  <span>
                    {e.source === node.id ? '→' : '←'}{' '}
                    {relationLabels[e.relationType || e.type] || 'Coleção'}
                    {e.failedStep ? ` · Passo ${e.failedStep}` : ''}
                    {e.correctionCycle ? ` · Ciclo ${e.correctionCycle}` : ''}
                  </span>
                  {other ? (
                    <button
                      className="trace-relation-link"
                      onClick={() => {
                        onSelect(other.id);
                        queueMicrotask(() =>
                          document
                            .querySelector('.trace-inspector h3')
                            ?.focus({ preventScroll: true })
                        );
                      }}
                    >
                      {identity(other)} ·{' '}
                      {other.data.title || other.data.message || nodeLabels[other.type]}
                    </button>
                  ) : (
                    <span>Artefato em outra página</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Nenhuma relação carregada.</p>
        )}
      </DetailSurface>
      {contract.pagination?.page < contract.pagination?.totalPages && (
        <p>Há outras relações disponíveis em Carregar mais relações.</p>
      )}
      {['TASK', 'TEST_CASE', 'TEST_EXECUTION', 'DEFECT'].includes(node.type) && (
        <button className="button button-secondary" onClick={() => onDetails(node)}>
          Abrir detalhes
        </button>
      )}
      {d.githubUrl && (
        <GithubExternalAction href={d.githubUrl}>Abrir no GitHub</GithubExternalAction>
      )}
    </aside>
  );
}
