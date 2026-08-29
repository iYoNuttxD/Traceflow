import { useState } from 'react';
import { FeedbackRegion, useCountdown } from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import './AuthShell.css';

export function AuthShell({ eyebrow, title, description, children, footer }) {
  const { bootstrapError, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const retryAfterSeconds = bootstrapError?.retryAfterSeconds || 0;
  const remaining = useCountdown(retryAfterSeconds);

  async function retryBootstrap() {
    if (retrying || remaining > 0) return;
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-card">
          <header className="auth-header">
            <span className="auth-brand">TRACEFLOW</span>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1 id="auth-title">{title}</h1>
            {description && <p>{description}</p>}
          </header>
          {bootstrapError && (
            <div className="auth-bootstrap-feedback">
              <FeedbackRegion
                error={bootstrapError.isRateLimit ? undefined : bootstrapError.message}
                rateLimit={bootstrapError.isRateLimit ? bootstrapError.message : undefined}
                retryAfterSeconds={retryAfterSeconds}
              />
              <button
                className="button button-secondary button-compact"
                type="button"
                disabled={retrying || remaining > 0}
                onClick={() => void retryBootstrap()}
              >
                {retrying
                  ? 'Tentando novamente...'
                  : remaining > 0
                    ? `Tentar novamente em ${remaining}s`
                    : 'Tentar novamente'}
              </button>
            </div>
          )}
          {children}
          {footer && <footer className="auth-footer">{footer}</footer>}
        </div>
      </section>
    </main>
  );
}
