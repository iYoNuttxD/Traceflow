import { useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useCountdown } from '../hooks/useCountdown.js';
import { PAGE_ERROR_TYPES, resolveErrorPageContext } from '../services/page-error.js';
import './GenericErrorPage.css';

const ERROR_CONTENT = Object.freeze({
  [PAGE_ERROR_TYPES.NETWORK]: {
    title: 'Não foi possível conectar ao TRACEFLOW.',
    description:
      'O servidor parece estar indisponível no momento. Verifique sua conexão e tente novamente.'
  },
  [PAGE_ERROR_TYPES.RATE_LIMIT]: {
    title: 'Muitas solicitações em pouco tempo.',
    description: 'Aguarde o tempo indicado antes de tentar novamente.'
  },
  [PAGE_ERROR_TYPES.SERVER]: {
    title: 'O TRACEFLOW encontrou um problema.',
    description:
      'Não foi possível concluir o carregamento desta página. Tente novamente em alguns instantes.'
  },
  [PAGE_ERROR_TYPES.NOT_FOUND]: {
    title: 'Página não encontrada.',
    description: 'O endereço informado não corresponde a uma página disponível.'
  },
  [PAGE_ERROR_TYPES.FORBIDDEN]: {
    title: 'Você não possui acesso a esta página.',
    description: 'Sua conta não tem permissão para visualizar este conteúdo.'
  },
  [PAGE_ERROR_TYPES.UNKNOWN]: {
    title: 'Não foi possível exibir esta página.',
    description: 'Ocorreu um erro inesperado. Tente novamente.'
  }
});

export function GenericErrorPage({
  type = PAGE_ERROR_TYPES.UNKNOWN,
  title,
  description,
  onRetry,
  showRetry = true,
  primaryLabel = 'Tentar novamente',
  secondaryAction,
  requestId,
  retryAfterSeconds = 0,
  embedded = false
}) {
  const headingRef = useRef(null);
  const headingId = useId();
  const [retrying, setRetrying] = useState(false);
  const remaining = useCountdown(retryAfterSeconds);
  const content = ERROR_CONTENT[type] || ERROR_CONTENT[PAGE_ERROR_TYPES.UNKNOWN];
  const Container = embedded ? 'section' : 'main';
  const typeClassName = type.toLowerCase().replaceAll('_', '-');

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleRetry() {
    if (retrying || remaining > 0) return;
    setRetrying(true);
    try {
      if (onRetry) await onRetry();
      else window.location.reload();
    } catch {
      // A página permanece disponível para uma nova tentativa explícita.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Container className={`error-page${embedded ? ' error-page-embedded' : ' page-container'}`}>
      <section
        className={`error-page-card error-page-${typeClassName}`}
        role="alert"
        aria-labelledby={headingId}
      >
        <span className="error-page-icon" aria-hidden="true">
          !
        </span>
        <h1 id={headingId} ref={headingRef} tabIndex="-1" className="error-page-title">
          {title || content.title}
        </h1>
        <p className="error-page-description">{description || content.description}</p>
        <div className="error-page-actions">
          {showRetry && (
            <button
              className="button button-primary"
              type="button"
              onClick={handleRetry}
              disabled={retrying || remaining > 0}
              aria-busy={retrying}
            >
              {retrying
                ? 'Tentando novamente...'
                : remaining > 0
                  ? `Tentar novamente em ${remaining}s`
                  : primaryLabel}
            </button>
          )}
          {secondaryAction && (
            <a className="button button-secondary" href={secondaryAction.href}>
              {secondaryAction.label}
            </a>
          )}
        </div>
        {requestId && <p className="error-page-reference">Código de referência: {requestId}</p>}
      </section>
    </Container>
  );
}

export function ContextualErrorPage({ secondaryAction, ...props }) {
  const location = useLocation();
  const context = resolveErrorPageContext(location.pathname);
  return (
    <GenericErrorPage
      {...props}
      secondaryAction={secondaryAction === undefined ? context.secondaryAction : secondaryAction}
    />
  );
}
