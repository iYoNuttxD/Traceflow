import { useState } from 'react';
import { FeedbackRegion } from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';

export function AuthShell({ eyebrow, title, description, children, footer }) {
  const { bootstrapError, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  async function retryBootstrap() {
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
                retryAfterSeconds={bootstrapError.retryAfterSeconds}
              />
              <button
                className="button button-secondary button-compact"
                type="button"
                disabled={retrying}
                onClick={() => void retryBootstrap()}
              >
                {retrying ? 'Tentando novamente...' : 'Tentar novamente'}
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
