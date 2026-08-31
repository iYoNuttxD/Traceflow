import { useState } from 'react';
import {
  BackButton,
  FeedbackRegion,
  PublicPageShell,
  useCountdown
} from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import './AuthShell.css';

export function AuthShell({
  title,
  description,
  children,
  footer,
  backTo,
  backLabel = 'Voltar para entrar',
  wide = false
}) {
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
    <PublicPageShell>
      <section
        className={`auth-shell${wide ? ' auth-shell--wide' : ''}`}
        aria-labelledby="auth-title"
      >
        <div className="auth-card">
          {backTo && (
            <div className="auth-back-row">
              <BackButton to={backTo} label={backLabel} />
            </div>
          )}
          <header className="auth-header">
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
    </PublicPageShell>
  );
}
