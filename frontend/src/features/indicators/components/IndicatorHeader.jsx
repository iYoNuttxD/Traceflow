import { DashboardHelp } from './DashboardHelp.jsx';
import { HEALTH_STATUS_LABELS } from '../health-display.js';

/** Shared heading rhythm for every indicator, regardless of its data state. */
export function IndicatorHeader({ title, assessment, dataState, children }) {
  const status = assessment?.status;
  const health = ['HEALTHY', 'ATTENTION', 'CRITICAL'].includes(status);
  return (
    <header className="indicator-card__header">
      <div className="indicator-card__heading-row">
        <h4>{title}</h4>
        <DashboardHelp title={title}>{children}</DashboardHelp>
      </div>
      {(health || dataState) && (
        <div className="indicator-card__status-line">
          {health && (
            <span
              className={`indicator-card__health indicator-card__health--${status.toLowerCase()}`}
            >
              {HEALTH_STATUS_LABELS[status]}
            </span>
          )}
          {dataState && (
            <span
              className={`indicator-card__state indicator-card__state--${dataState.state.toLowerCase()}`}
            >
              {dataState.label}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
