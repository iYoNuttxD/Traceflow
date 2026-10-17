import { alertStatusLabel, alertStatusTone, alertTypeLabel } from '../model/alert-view.js';
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
