import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCountdown } from '../hooks/useCountdown.js';
import './FeedbackRegion.css';

const feedback = Object.freeze({
  error: { icon: '!', role: 'alert' },
  'rate-limit': { icon: '⏱', role: 'alert' },
  warning: { icon: '⚠', role: 'alert' },
  success: { icon: '✓', role: 'status' },
  info: { icon: 'i', role: 'status' }
});

function TransientFeedback({ children }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return visible
    ? createPortal(<div className="feedback-region--transient">{children}</div>, document.body)
    : null;
}

export function FeedbackRegion({
  error,
  success,
  warning,
  info,
  rateLimit,
  retryAfterSeconds = 0,
  remainingRetryAfterSeconds,
  transient = false
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

  if (!entry)
    return transient ? null : (
      <div className="feedback-region" aria-live="polite" aria-atomic="true" />
    );

  const [variant, message] = entry;
  const semantics = feedback[variant];
  const content = (
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
  return transient ? (
    <TransientFeedback key={`${variant}:${message}`}>{content}</TransientFeedback>
  ) : (
    content
  );
}
