import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { ErrorState, FeedbackRegion, normalizeApiError } from '../../../shared/index.js';
import { reconcileTraceabilityAlerts } from '../api/traceability.api.js';
import { useAlertSummary } from '../hooks/useAlertSummary.js';
import {
  NO_REPOSITORY_MESSAGE,
  inconsistencySummaryParts,
  reconcileMessage,
  reconciliationNotice
} from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './InconsistencySummary.css';

export function InconsistencySummary({ projectId }) {
  const { summary, error, reload } = useAlertSummary(projectId);
  const [feedback, setFeedback] = useState({});
  const [reconciling, setReconciling] = useState(false);
  const permissions = summary?.permissions || {};
  const parts = inconsistencySummaryParts(summary, projectId);

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
    <section className="trace-inconsistency-summary" aria-label="Inconsistências abertas">
      {!summary && error ? (
        <ErrorState
          message={error.message}
          retryAfterSeconds={error.retryAfterSeconds}
          onRetry={reload}
        />
      ) : (
        <p className="trace-inconsistency-summary__sentence">
          {!summary
            ? 'Carregando inconsistências...'
            : parts.length
              ? parts.map((part, index) => (
                  <Fragment key={part.type}>
                    {index > 0 && ' · '}
                    <Link to={part.to}>{part.text}</Link>
                  </Fragment>
                ))
              : 'Nenhuma inconsistência aberta.'}
        </p>
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
      {permissions.canManage && (
        <div className="trace-alert-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={reconcile}
            disabled={reconciling}
            aria-busy={reconciling || undefined}
          >
            Reprocessar inconsistências
          </button>
        </div>
      )}
    </section>
  );
}
