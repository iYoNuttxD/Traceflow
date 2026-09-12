import { useCallback, useEffect, useState } from 'react';
import { useTestCaseScope } from '../../testCases/index.js';
import {
  EmptyState,
  ErrorState,
  HistoryEventRow,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import { getRequirementSituationHistory } from '../api/traceability.api.js';
import {
  historyReasons,
  mergeById,
  situationLabel,
  sourceLabels
} from '../model/requirement-view.js';
export function RequirementHistory({ projectId, requirementId }) {
  const scope = useTestCaseScope(`${projectId}:${requirementId}`);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedCursor, setFailedCursor] = useState(null);
  const load = useCallback(
    async (cursor = null) => {
      const token = scope.begin('history');
      setLoading(true);
      setError(null);
      try {
        const next = await getRequirementSituationHistory(
          projectId,
          requirementId,
          { limit: 30, ...(cursor ? { cursor } : {}) },
          { signal: token.controller.signal }
        );
        if (scope.accepts('history', token))
          setData((previous) => ({
            ...next,
            items: cursor ? mergeById(previous?.items || [], next.items) : next.items
          }));
      } catch (error) {
        if (scope.accepts('history', token)) {
          setError(normalizeApiError(error, 'Não foi possível carregar o histórico.'));
          setFailedCursor(cursor);
        }
      } finally {
        if (scope.accepts('history', token)) setLoading(false);
      }
    },
    [projectId, requirementId, scope]
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div className="requirement-history" data-requirement-history tabIndex={-1}>
      {data?.items.map((event) => (
        <HistoryEventRow
          key={event.id}
          date={event.occurredAt}
          title={historyReasons[event.reason] || 'Situação de rastreabilidade alterada'}
          author="Registro automático"
        >
          <span>
            {event.reason === 'BASELINE_INITIALIZED'
              ? `Situação inicial observada: ${situationLabel(event.toSituation)}`
              : `${situationLabel(event.fromSituation)} → ${situationLabel(event.toSituation)}`}
          </span>
          {sourceLabels[event.sourceEntityType] && event.sourceEntityId != null && (
            <small>
              Origem: {sourceLabels[event.sourceEntityType]} #{event.sourceEntityId}
            </small>
          )}
        </HistoryEventRow>
      ))}
      {loading && <LoadingState message="Carregando histórico..." />}
      {error && (
        <ErrorState
          message={error.message}
          retryAfterSeconds={error.retryAfterSeconds}
          onRetry={() => load(failedCursor)}
        />
      )}
      {!loading && !error && data?.items.length === 0 && (
        <EmptyState title="Nenhuma mudança de situação registrada." />
      )}
      {data?.nextCursor && !error && (
        <button
          type="button"
          className="button button-secondary button-compact"
          disabled={loading}
          onClick={() => load(data.nextCursor)}
        >
          Carregar mais eventos
        </button>
      )}
    </div>
  );
}
