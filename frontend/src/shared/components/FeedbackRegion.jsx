import { useEffect, useState } from 'react';

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
  retryAfterSeconds = 0
}) {
  const [remaining, setRemaining] = useState(retryAfterSeconds);

  useEffect(() => setRemaining(retryAfterSeconds), [retryAfterSeconds]);
  useEffect(() => {
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

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
