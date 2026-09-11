import { graphFields, GraphStatus } from './GraphNode.jsx';
import { identity, nodeLabels, relationLabels } from '../model/graph.js';
import { phaseLabel } from '../model/phase.js';
import { TraceabilityHelp } from './TraceabilityHelp.jsx';
export function TraceabilityInspector({ node, contract, onClose, onSelect, onDetails }) {
  const d = node.data;
  const related = contract.edges.filter((e) => e.source === node.id || e.target === node.id);
  const entities = new Map(contract.nodes.map((n) => [n.id, n]));
  const p = d.projection;
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
      <dl className="trace-inspector-fields">
        {graphFields(node.type, d).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {p && (
        <dl className="trace-inspector-fields">
          <div>
            <dt>Artefatos</dt>
            <dd>
              {p.artifacts.pullRequests} PRs · {p.artifacts.commits} commits · {p.artifacts.issues}{' '}
              issues
              <p>
                Contagem da projeção: um PR compartilhado pode contar em mais de uma tarefa. No
                fluxo, cada artefato aparece uma vez.
              </p>
            </dd>
          </div>
          <div>
            <dt>Resultados atuais</dt>
            <dd>
              {p.validation.pass} PASS · {p.validation.fail} FAIL · {p.validation.blocked} BLOCKED ·{' '}
              {p.validation.neverExecuted} nunca executados
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
      )}
      <section>
        <h4>Relações na cadeia</h4>
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
      </section>
      {contract.pagination?.page < contract.pagination?.totalPages && (
        <p>Há outras relações disponíveis em Carregar mais relações.</p>
      )}
      {['TASK', 'TEST_CASE', 'TEST_EXECUTION', 'DEFECT'].includes(node.type) && (
        <button className="button button-secondary" onClick={() => onDetails(node)}>
          Abrir detalhes
        </button>
      )}
      {d.githubUrl && (
        <a className="button button-secondary" href={d.githubUrl} target="_blank" rel="noreferrer">
          Abrir no GitHub
        </a>
      )}
    </aside>
  );
}
