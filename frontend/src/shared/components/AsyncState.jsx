import { useState } from 'react';
import { useCountdown } from '../hooks/useCountdown.js';

export function LoadingState({ message = 'Carregando...' }) {
  return (
    <div className="async-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {message}
    </div>
  );
}

export function EmptyState({ title = 'Nenhum resultado encontrado.', description }) {
  return (
    <section className="async-state" aria-live="polite">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </section>
  );
}

export function ErrorState({ message, onRetry, retryAfterSeconds = 0 }) {
  const remaining = useCountdown(retryAfterSeconds);
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    if (!onRetry || remaining > 0 || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section className="async-state message message-error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={() => void retry()}
          disabled={remaining > 0 || retrying}
          aria-busy={retrying}
        >
          {retrying
            ? 'Tentando...'
            : remaining > 0
              ? `Tentar novamente em ${remaining}s`
              : 'Tentar novamente'}
        </button>
      )}
    </section>
  );
}

export function ForbiddenState({
  message = 'Você não possui permissão para acessar este conteúdo.'
}) {
  return (
    <section className="async-state message message-error" role="alert">
      <h2>Acesso restrito</h2>
      <p>{message}</p>
    </section>
  );
}

export function RequestState({
  loading,
  error,
  empty,
  forbidden,
  onRetry,
  retryAfterSeconds,
  children
}) {
  if (loading) return <LoadingState />;
  if (forbidden) return <ForbiddenState message={error} />;
  if (error)
    return <ErrorState message={error} onRetry={onRetry} retryAfterSeconds={retryAfterSeconds} />;
  if (empty) return <EmptyState />;
  return children;
}
