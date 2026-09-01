import { useState } from 'react';
import { PublicPageShell, StatusSurface, useCountdown } from '../../../shared/index.js';
import './SessionBootstrapStatus.css';

export function SessionBootstrapStatus({ error, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const retryAfterSeconds = error?.retryAfterSeconds || 0;
  const remaining = useCountdown(retryAfterSeconds);

  async function retry() {
    if (!onRetry || retrying || remaining > 0) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  if (!error) {
    return (
      <PublicPageShell>
        <StatusSurface
          title="Carregando sessão..."
          description="Aguarde enquanto verificamos seu acesso."
          icon="refresh"
          role="status"
        />
      </PublicPageShell>
    );
  }

  return (
    <PublicPageShell>
      <StatusSurface
        title={error.isRateLimit ? 'Muitas solicitações' : 'Não foi possível restaurar a sessão'}
        description={error.message}
        icon="alert"
        tone={error.isRateLimit ? 'warning' : 'danger'}
        role="alert"
        actions={
          <button
            className="button button-primary"
            type="button"
            disabled={retrying || remaining > 0}
            aria-busy={retrying}
            onClick={() => void retry()}
          >
            {retrying
              ? 'Tentando novamente...'
              : remaining > 0
                ? `Tentar novamente em ${remaining}s`
                : 'Tentar novamente'}
          </button>
        }
      >
        {error.requestId && (
          <p className="session-bootstrap-reference">Código de referência: {error.requestId}</p>
        )}
      </StatusSurface>
    </PublicPageShell>
  );
}
