import {
  alertFactText,
  alertStatusLabel,
  alertStatusTone,
  alertTypeLabel,
  formatInstant,
  resolutionLabel
} from '../model/alert-view.js';
import '../styles/trace-alert.css';

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
      <p>Detectada em {formatInstant(alert.detectedAt)}</p>
      {alert.status === 'RESOLVED' && (
        <p>
          Resolvida em {formatInstant(alert.resolvedAt)} · {resolutionLabel(alert.resolutionReason)}
        </p>
      )}
      {alert.dismissal && (
        <p>
          Dispensada por {alert.dismissal.by?.name || 'pessoa removida'} em{' '}
          {formatInstant(alert.dismissal.at)}: “{alert.dismissal.reason}”
        </p>
      )}
    </div>
  );
}
