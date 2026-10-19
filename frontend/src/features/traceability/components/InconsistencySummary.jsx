import { useId } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../../shared/index.js';
import { useAlertSummary } from '../hooks/useAlertSummary.js';
import {
  NO_REPOSITORY_MESSAGE,
  inconsistencyMetrics,
  reconciliationNotice
} from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './InconsistencySummary.css';

export function InconsistencySummary({ projectId }) {
  const headingId = useId();
  const { summary, error, reload } = useAlertSummary(projectId);
  const notice = reconciliationNotice(summary?.reconciliation);

  return (
    <div className="trace-inconsistency-summary" role="group" aria-labelledby={headingId}>
      <div className="trace-inconsistency-summary__heading">
        <h3 id={headingId}>Inconsistências abertas</h3>
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
      {notice && (
        <p className="trace-alert-notice" role="status">
          {notice}
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
