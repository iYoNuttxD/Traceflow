import { ErrorState } from '../../../shared/index.js';
import { alertHistoryDetail, alertHistoryTitle, historyToggleLabel } from '../model/alert-view.js';
import './AlertHistory.css';

export function AlertHistoryToggle({ controls, expanded, total, disabled = false, onToggle }) {
  return (
    <button
      type="button"
      className="button button-secondary button-compact"
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onToggle}
    >
      {historyToggleLabel(total)}
    </button>
  );
}

export function AlertHistoryList({ id, entries, total, error, emptyText, onRetry }) {
  return (
    <div id={id} className="trace-alert-history">
      {error ? (
        <ErrorState
          message={error.message}
          retryAfterSeconds={error.retryAfterSeconds}
          onRetry={onRetry}
        />
      ) : entries.length === 0 ? (
        <p className="trace-alert-history__empty">{emptyText}</p>
      ) : (
        <ul className="trace-alert-history__list">
          {entries.map((alert) => (
            <li key={alert.id}>
              <strong>{alertHistoryTitle(alert)}</strong>
              <small>{alertHistoryDetail(alert)}</small>
            </li>
          ))}
        </ul>
      )}
      {!error && total > entries.length && (
        <p className="trace-alert-history__more">
          Mostrando as {entries.length.toLocaleString('pt-BR')} mais recentes de{' '}
          {total.toLocaleString('pt-BR')}.
        </p>
      )}
    </div>
  );
}
