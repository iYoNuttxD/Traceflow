import { useEffect, useId, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import { useCommitSuggestions } from '../hooks/useCommitSuggestions.js';
import '../../../shared/styles/traceability-controls.css';
import './CommitSuggestionsCard.css';

const statusLabels = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rejeitada'
};

function summarizedMessage(message) {
  if (!message) return 'Commit sem mensagem.';
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

function resultMessage(result) {
  if (result.createdSuggestions > 0) {
    return `${result.createdSuggestions} ${result.createdSuggestions === 1 ? 'commit sugerido' : 'commits sugeridos'}.`;
  }
  if (result.skippedSuggestions > 0) {
    return `Nenhuma nova sugestão. ${result.skippedSuggestions} ${result.skippedSuggestions === 1 ? 'referência não gerou' : 'referências não geraram'} nova sugestão.`;
  }
  return 'Nenhuma sugestão encontrada.';
}

function CommitSuggestionInfo() {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnPointerDown);
    return () => document.removeEventListener('pointerdown', closeOnPointerDown);
  }, [open]);

  function closeOnEscape(event) {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <span className="commit-suggestions-info" ref={containerRef} onKeyDown={closeOnEscape}>
      <button
        type="button"
        ref={triggerRef}
        className="commit-suggestions-info__trigger"
        aria-label="Como funcionam as sugestões de commits"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <TraceFlowIcon name="info" />
      </button>
      {open && (
        <span className="commit-suggestions-info__tooltip" id={tooltipId} role="tooltip">
          O TraceFlow procura, nas mensagens dos commits já importados do projeto, referências como
          {' [TASK-42] '}ao identificador da tarefa. As sugestões não criam vínculos
          automaticamente; você decide o que confirmar.
        </span>
      )}
    </span>
  );
}

export function CommitSuggestionsCard({ projectId, taskId, onConfirmed, disabled = false }) {
  const {
    suggestions,
    permissions,
    loading,
    actionId,
    scanning,
    scanResult,
    error,
    scan,
    confirmSuggestion,
    rejectSuggestion
  } = useCommitSuggestions({ projectId, taskId, onConfirmed });

  if (!taskId) {
    return (
      <div className="commit-suggestions-control commit-suggestions-control--unavailable">
        <span className="commit-suggestions-control__title">Sugestões de commits</span>
        <p className="field-help">Sugestões de commits ficam disponíveis após salvar a tarefa.</p>
      </div>
    );
  }

  return (
    <div className="commit-suggestions-control">
      <div className="commit-suggestions-control__header">
        <span className="commit-suggestions-control__title">
          Sugestões de commits
          <CommitSuggestionInfo />
        </span>
        {permissions.canReview && (
          <button
            className="button button-outline button-compact"
            type="button"
            disabled={disabled || scanning || actionId !== null}
            onClick={() => void scan()}
          >
            {scanning ? 'Buscando...' : 'Sugerir commits'}
          </button>
        )}
      </div>
      {scanResult && (
        <p className="commit-suggestions-control__result" role="status">
          {resultMessage(scanResult)}
        </p>
      )}
      {error && (
        <div className="message message-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="commit-suggestions-control__empty" role="status">
          Carregando sugestões de commits...
        </p>
      ) : !error && suggestions.length === 0 ? (
        <p className="commit-suggestions-control__empty">Nenhuma sugestão encontrada.</p>
      ) : !error ? (
        <div
          className="traceability-suggestions-list"
          aria-label={`Sugestões (${suggestions.length})`}
        >
          {suggestions.map((suggestion) => {
            const processing = actionId === suggestion.id;
            return (
              <article className="traceability-suggestion" key={suggestion.id}>
                <div>
                  <strong>{suggestion.commit.shortHash || suggestion.commit.hash}</strong>
                  <p>{summarizedMessage(suggestion.commit.message)}</p>
                  <span>
                    Task #{suggestion.task.id}: {suggestion.task.title}
                  </span>
                  <span className="status-badge status-pendente">
                    {statusLabels[suggestion.status] || suggestion.status}
                  </span>
                </div>
                {permissions.canReview && suggestion.status === 'PENDING' && (
                  <div className="form-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={disabled || processing || actionId !== null}
                      onClick={() => void confirmSuggestion(suggestion)}
                    >
                      {processing ? 'Processando...' : 'Confirmar'}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={disabled || processing || actionId !== null}
                      onClick={() => void rejectSuggestion(suggestion)}
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
