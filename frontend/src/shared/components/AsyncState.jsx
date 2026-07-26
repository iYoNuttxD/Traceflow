export function LoadingState({ message = 'Carregando...' }) {
  return <div className="async-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{message}</div>;
}

export function EmptyState({ title = 'Nenhum resultado encontrado.', description }) {
  return <section className="async-state" aria-live="polite"><h3>{title}</h3>{description && <p>{description}</p>}</section>;
}

export function ErrorState({ message, onRetry }) {
  return <section className="async-state message message-error" role="alert"><p>{message}</p>{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</section>;
}

export function ForbiddenState({ message = 'Você não possui permissão para acessar este conteúdo.' }) {
  return <section className="async-state message message-error" role="alert"><h2>Acesso restrito</h2><p>{message}</p></section>;
}

export function RequestState({ loading, error, empty, forbidden, onRetry, children }) {
  if (loading) return <LoadingState />;
  if (forbidden) return <ForbiddenState message={error} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return <EmptyState />;
  return children;
}
