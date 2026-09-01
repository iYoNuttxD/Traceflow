import { useCountdown } from '../hooks/useCountdown.js';
import './FeedbackRegion.css';

const feedback = Object.freeze({
  error: { icon: '!', role: 'alert' },
  'rate-limit': { icon: '⏱', role: 'alert' },
  warning: { icon: '⚠', role: 'alert' },
  success: { icon: '✓', role: 'status' },
  info: { icon: 'i', role: 'status' }
});

export function FeedbackRegion({
  error,
  success,
  warning,
  info,
  rateLimit,
  retryAfterSeconds = 0,
  remainingRetryAfterSeconds
}) {
  const internalRemaining = useCountdown(
    remainingRetryAfterSeconds === undefined ? retryAfterSeconds : 0
  );
  const remaining = remainingRetryAfterSeconds ?? internalRemaining;

  const entry = error
    ? ['error', error]
    : rateLimit
      ? ['rate-limit', rateLimit]
      : warning
        ? ['warning', warning]
        : success
          ? ['success', success]
          : info
            ? ['info', info]
            : null;

  if (!entry) return <div className="feedback-region" aria-live="polite" aria-atomic="true" />;

  const [variant, message] = entry;
  const semantics = feedback[variant];
  return (
    <div
      className={`message message-${variant}`}
      role={semantics.role}
      aria-live={semantics.role === 'status' ? 'polite' : undefined}
      aria-atomic="true"
    >
      <span className="message-icon" aria-hidden="true">
        {semantics.icon}
      </span>
      <span>
        {message}
        {variant === 'rate-limit' && remaining > 0 && (
          <small className="message-countdown">Tente novamente em {remaining}s.</small>
        )}
      </span>
    </div>
  );
}
