import {
  alertFactText,
  alertStatusLabel,
  alertStatusTone,
  alertTypeLabel,
  formatInstant,
  resolutionLabel
} from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './AlertCard.css';

export function AlertBadges({ alert }) {
  return (
    <div className="trace-alert-badges">
      <span className="trace-alert-pill trace-alert-pill--type">{alertTypeLabel(alert.type)}</span>
      <span className={`trace-alert-pill trace-alert-pill--${alertStatusTone(alert.status)}`}>
        {alertStatusLabel(alert.status)}
      </span>
    </div>
  );
}

export function AlertFacts({ alert }) {
  return (
    <div className="trace-alert-meta">
      <p>{alertFactText(alert)}</p>
      <p>Detectado em {formatInstant(alert.detectedAt)}</p>
      {alert.status === 'RESOLVED' && (
        <p>
          Resolvido em {formatInstant(alert.resolvedAt)} · {resolutionLabel(alert.resolutionReason)}
        </p>
      )}
      {alert.dismissal && (
        <p>
          Dispensado por {alert.dismissal.by?.name || 'pessoa removida'} em{' '}
          {formatInstant(alert.dismissal.at)}: “{alert.dismissal.reason}”
        </p>
      )}
    </div>
  );
}

export function AlertCard({ alert, onOpen }) {
  return (
    <article
      className="sprint-card trace-alert-card"
      aria-label={`${alertTypeLabel(alert.type)}: ${alert.subject.code}`}
    >
      <AlertBadges alert={alert} />
      <h3 className="trace-alert-subject">
        <span className="trace-alert-subject__code">{alert.subject.code}</span>
        {alert.subject.title}
      </h3>
      <AlertFacts alert={alert} />
      <div className="trace-alert-card__actions">
        <button
          type="button"
          className="button button-secondary"
          aria-label={`Ver detalhes do alerta ${alert.subject.code}`}
          onClick={(event) => onOpen(alert, event.currentTarget)}
        >
          Ver detalhes
        </button>
      </div>
    </article>
  );
}
