import { DefectBadge } from './DefectDetails.jsx';
import { useCallback, useEffect, useState } from 'react';
import {
  ErrorState,
  LoadingState,
  normalizeApiError,
  HistoryEventRow
} from '../../../shared/index.js';
import { useTestCaseScope } from '../../testCases/index.js';
import { defectsApi } from '../api/defects.api.js';
import {
  historyLabels,
  statuses,
  severities,
  mergeItems,
  executionLabel
} from '../model/defects.js';
const value = (v) =>
  Array.isArray(v) ? v.join(', ') : statuses[v] || severities[v] || String(v ?? 'Sem vínculo');
export function DefectHistory({ id, onExecution }) {
  const scope = useTestCaseScope(id),
    [data, setData] = useState({ items: [], page: 0, total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null);
  const load = useCallback(
    async (page = 1) => {
      const t = scope.begin('history');
      setLoading(true);
      setError(null);
      try {
        const d = await defectsApi.history(
          id,
          { page, limit: 20 },
          { signal: t.controller.signal }
        );
        if (scope.accepts('history', t))
          setData((old) => ({ ...d, items: mergeItems(page > 1 ? old.items : [], d.items) }));
      } catch (e) {
        if (scope.accepts('history', t)) setError(normalizeApiError(e));
      } finally {
        if (scope.accepts('history', t)) setLoading(false);
      }
    },
    [id, scope]
  );
  useEffect(() => {
    setData({ items: [], page: 0, total: 0 });
    void load();
  }, [load]);
  return (
    <section className="tc-stack">
      {loading && <LoadingState message="Carregando histórico…" />}
      {error && (
        <ErrorState message={error.message} onRetry={() => load(data.page ? data.page + 1 : 1)} />
      )}
      <div className="defect-history-list">
        {data.items.map((e) => {
          const m = e.metadataJson || {};
          return (
            <HistoryEventRow
              key={e.id}
              date={e.occurredAt}
              title={historyLabels[e.action] || 'Alteração registrada'}
              author={e.actorUserId ? `Usuário #${e.actorUserId}` : 'Sistema'}
            >
              {m.from !== undefined && (
                <p>
                  {e.action === 'SEVERITY_CHANGED' ? <DefectBadge value={m.from} /> : value(m.from)}{' '}
                  → {e.action === 'SEVERITY_CHANGED' ? <DefectBadge value={m.to} /> : value(m.to)}
                </p>
              )}
              {m.taskId && (
                <p>
                  TASK-{m.taskId} · Ciclo {m.correctionCycle}
                </p>
              )}
              {m.testExecutionId && (
                <p>
                  <button
                    className="button button-outline button-compact"
                    onClick={() => onExecution(m.testExecutionId)}
                  >
                    {executionLabel(m.testExecutionId)}
                    {m.result ? ` · ${m.result}` : ''}
                  </button>
                  {m.correctionCycle ? ` · Ciclo ${m.correctionCycle}` : ''}
                </p>
              )}
              {e.action === 'CYCLE_REOPENED' && <p>Um novo ciclo de correção foi iniciado.</p>}
            </HistoryEventRow>
          );
        })}
      </div>
      {!loading && !error && !data.total && <p>Nenhuma alteração registrada.</p>}
      {data.items.length < data.total && (
        <button
          className="button button-secondary"
          disabled={loading}
          onClick={() => load(data.page + 1)}
        >
          Carregar mais
        </button>
      )}
    </section>
  );
}
