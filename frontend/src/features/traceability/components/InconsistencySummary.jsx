import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ErrorState, FeedbackRegion, normalizeApiError } from '../../../shared/index.js';
import { reconcileTraceabilityAlerts } from '../api/traceability.api.js';
import { useAlertSummary } from '../hooks/useAlertSummary.js';
import {
  NO_REPOSITORY_MESSAGE,
  inconsistencyMetrics,
  reconcileMessage,
  reconciliationNotice
} from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './InconsistencySummary.css';

export function InconsistencySummary({ projectId }) {
  const headingId = useId();
  const { summary, error, reload } = useAlertSummary(projectId);
  const [feedback, setFeedback] = useState({});
  const [reconciling, setReconciling] = useState(false);
  const permissions = summary?.permissions || {};

  async function reconcile() {
    setReconciling(true);
    setFeedback({});
    try {
      const response = await reconcileTraceabilityAlerts(projectId);
      setFeedback({ success: reconcileMessage(response.result) });
      void reload();
    } catch (failure) {
      const failed = normalizeApiError(failure, 'Não foi possível reprocessar as inconsistências.');
      setFeedback({ error: failed.message, retryAfterSeconds: failed.retryAfterSeconds });
    } finally {
      setReconciling(false);
    }
  }

  return (
    <div className="trace-inconsistency-summary" role="group" aria-labelledby={headingId}>
      <div className="trace-inconsistency-summary__heading">
        <h3 id={headingId}>Inconsistências abertas</h3>
        {permissions.canManage && (
          <button
            type="button"
            className="button button-secondary button-compact"
            onClick={reconcile}
            disabled={reconciling}
            aria-busy={reconciling || undefined}
          >
            Reprocessar inconsistências
          </button>
        )}
      </div>
      {!summary && error ? (
        <ErrorState
          message={error.message}
          retryAfterSeconds={error.retryAfterSeconds}
          onRetry={reload}
        />
      ) : (
        <dl className="trace-inconsistency-summary__metrics" aria-busy={!summary || undefined}>
          {inconsistencyMetrics(summary, projectId).map((metric) => (
            <div key={metric.type}>
              <dt>{metric.label}</dt>
              <dd>
                {metric.count === null ? (
                  '—'
                ) : metric.count > 0 ? (
                  <Link to={metric.to} aria-label={metric.text}>
                    {metric.count.toLocaleString('pt-BR')}
                  </Link>
                ) : (
                  '0'
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <FeedbackRegion
        success={feedback.success}
        error={feedback.error}
        retryAfterSeconds={feedback.retryAfterSeconds}
      />
      {summary?.reconciliation?.stale && (
        <p className="trace-alert-notice" role="status">
          {reconciliationNotice(summary.reconciliation, permissions.canManage)}
        </p>
      )}
      {summary?.rules?.integrationConnected === false && (
        <p className="trace-alert-notice">
          {NO_REPOSITORY_MESSAGE} Toda tarefa concluída fica como concluída sem commit até o
          repositório ser conectado.{' '}
          <Link to={`/projects/${projectId}/repository`}>Abrir o repositório do projeto</Link>
        </p>
      )}
    </div>
  );
}
