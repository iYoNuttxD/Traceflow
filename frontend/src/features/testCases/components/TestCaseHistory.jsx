import { useState } from 'react';
import { ErrorState, LoadingState } from '../../../shared/index.js';
import { useCaseRead } from '../hooks/useCaseRead.js';
import { TestExecutionHistory } from './TestCaseDetails.jsx';

const labels = {
  CREATED: 'Caso criado',
  VERSION_CREATED: 'Nova versão',
  STATUS_CHANGED: 'Status alterado',
  RESPONSIBLE_CHANGED: 'Responsável alterado',
  DELETED: 'Caso excluído'
};
const fields = {
  title: 'Título',
  description: 'Descrição',
  preconditions: 'Pré-condições',
  expectedResult: 'Resultado esperado',
  requirementId: 'Requisito',
  taskIds: 'Tarefas',
  steps: 'Passos'
};
function Change({ item }) {
  const meta = item.metadataJson;
  return (
    <article className="tc-history-row">
      <div>
        <strong>{labels[item.action] || item.action}</strong>
        <p>
          {new Date(item.occurredAt).toLocaleString('pt-BR')} ·{' '}
          {item.actorUserId ? `Usuário #${item.actorUserId}` : 'Autor indisponível'}
        </p>
        <p>
          {item.fromVersion ? `v${item.fromVersion} → ` : ''}
          {item.toVersion ? `v${item.toVersion}` : ''}
        </p>
        {meta?.changedFields && (
          <p>{meta.changedFields.map((name) => fields[name] || name).join(', ')}</p>
        )}
        {item.action === 'STATUS_CHANGED' && (
          <p>
            {meta.from} → {meta.to}
          </p>
        )}
        {item.action === 'RESPONSIBLE_CHANGED' && (
          <p>
            {meta.from.name} (#{meta.from.id}) → {meta.to.name} (#{meta.to.id})
          </p>
        )}
      </div>
    </article>
  );
}
function HistoryStream({ id, kind, onSelect }) {
  const { data, loading, error, load } = useCaseRead(kind, id);
  return (
    <>
      {loading && !data && <LoadingState message="Carregando histórico…" />}
      {error && <ErrorState message={error.message} onRetry={() => load(data?.nextCursor)} />}
      {data &&
        (kind === 'executions' ? (
          <TestExecutionHistory executions={data.items} onSelect={onSelect} />
        ) : (
          <>
            {!data.items.length && <p>Nenhuma alteração registrada.</p>}
            {data.items.map((item) => (
              <Change key={item.id} item={item} />
            ))}
          </>
        ))}
      {data?.nextCursor && (
        <button
          className="button button-secondary"
          disabled={loading}
          onClick={() => load(data.nextCursor)}
        >
          {loading ? 'Carregando…' : 'Carregar mais registros'}
        </button>
      )}
    </>
  );
}
export function TestCaseHistory({ id, onSelect }) {
  const [tab, setTab] = useState('executions');
  const tabs = [
    ['executions', 'Execuções'],
    ['history', 'Alterações']
  ];
  return (
    <div className="tc-stack">
      <div className="internal-tabs" role="tablist" aria-label="Histórico do caso">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`tc-history-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`tc-history-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={`internal-tab ${tab === key ? 'internal-tab--active' : ''}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                setTab(tabs[target][0]);
                document.getElementById(`tc-history-${tabs[target][0]}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(([key]) => (
        <section
          key={key}
          hidden={tab !== key}
          role="tabpanel"
          id={`tc-history-panel-${key}`}
          aria-labelledby={`tc-history-${key}`}
        >
          {tab === key && (
            <HistoryStream key={`${id}:${key}`} id={id} kind={key} onSelect={onSelect} />
          )}
        </section>
      ))}
    </div>
  );
}
