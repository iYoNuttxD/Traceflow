import { formatMetricValue } from '../dashboard-display.js';
import './IndicatorProgress.css';

export function IndicatorProgress({ value, referenceValue, referenceLabel, health, label }) {
  const hasReference =
    Number.isFinite(referenceValue) && referenceValue >= 0 && referenceValue <= 100;
  const description = `${label}: ${formatMetricValue(value, 'PERCENT')}.${hasReference ? ` Referência: ${referenceLabel}, ${formatMetricValue(referenceValue, 'PERCENT')}.` : ''}`;
  return (
    <div
      className={`indicator-progress indicator-progress--${(health ?? 'neutral').toLowerCase()}`}
    >
      <progress value={value} max="100" aria-label={description} />
      {hasReference && (
        <span
          className="indicator-progress__reference"
          aria-hidden="true"
          style={{ left: `${referenceValue}%` }}
        />
      )}
    </div>
  );
}
