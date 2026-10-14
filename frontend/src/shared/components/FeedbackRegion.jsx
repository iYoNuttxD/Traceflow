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

  const [variant, message] = entry ?? [];
  const key = entry ? `${variant}:${message}` : null;
  const [dismissed, setDismissed] = useState(null);
  useEffect(() => {
    setDismissed(null);
    if (!transient || !['success', 'info'].includes(variant)) return;
    const timer = window.setTimeout(() => setDismissed(key), 4000);
    return () => window.clearTimeout(timer);
  }, [transient, variant, key]);
  const semantics = feedback[variant];
  const content =
    entry && dismissed !== key ? (
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
          {variant === 'rate-limit' && (
            <>
              <span className="sr-only">
                {retryAfterSeconds > 0
                  ? ` Aguarde ${retryAfterSeconds} segundos antes de tentar novamente.`
                  : ' Aguarde o prazo informado antes de tentar novamente.'}
              </span>
              {remaining > 0 && (
                <small className="message-countdown" aria-hidden="true">
                  Tente novamente em {remaining}s.
                </small>
              )}
            </>
          )}
        </span>
      </div>
    ) : null;
  const region = (
    <div className={transient ? 'feedback-region feedback-region--transient' : 'feedback-region'}>
      <div aria-live="polite" aria-atomic="true">
        {semantics?.role === 'status' ? content : null}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {semantics?.role === 'alert' ? content : null}
      </div>
    </div>
  );
  return transient ? createPortal(region, document.body) : region;
}
