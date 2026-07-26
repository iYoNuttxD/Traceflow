import { useCommitSuggestions } from '../hooks/useCommitSuggestions.js';

const statusLabels = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rejeitada'
};

function summarizedMessage(message) {
  if (!message) return 'Commit sem mensagem.';
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

export function CommitSuggestionsCard({ projectId, taskId, onConfirmed }) {
  const { suggestions, permissions, loading, actionId, error, confirmSuggestion, rejectSuggestion } = useCommitSuggestions({ projectId, taskId, onConfirmed });

  return (
    <div className="traceability-picker">
      <span>Sugestões automáticas</span>
      <p className="field-help">Commits cuja mensagem contém [TASK-ID] para esta tarefa.</p>
      {!taskId && (
        <p className="field-help">Após salvar a tarefa, commits com [TASK-ID] poderão ser sugeridos automaticamente.</p>
      )}
      {error && <div className="message message-error" role="alert">{error}</div>}
      {taskId && loading ? (
        <p className="empty-state">Carregando sugestões de commits...</p>
      ) : taskId && !error && suggestions.length === 0 ? (
        <p className="empty-state">Nenhuma sugestão de commit pendente.</p>
      ) : taskId && !error ? (
        <div className="traceability-suggestions-list">
          {suggestions.map((suggestion) => {
            const processing = actionId === suggestion.id;
            return (
              <article className="traceability-suggestion" key={suggestion.id}>
                <div>
                  <strong>{suggestion.commit.shortHash || suggestion.commit.hash}</strong>
                  <p>{summarizedMessage(suggestion.commit.message)}</p>
                  <span>Task #{suggestion.task.id}: {suggestion.task.title}</span>
                  <span className="status-badge status-pendente">{statusLabels[suggestion.status] || suggestion.status}</span>
                </div>
                {permissions.canReview && suggestion.status === 'PENDING' && (
                  <div className="form-actions">
                    <button className="button" type="button" disabled={processing || actionId !== null} onClick={() => void confirmSuggestion(suggestion)}>
                      {processing ? 'Processando...' : 'Confirmar'}
                    </button>
                    <button className="button button-secondary" type="button" disabled={processing || actionId !== null} onClick={() => void rejectSuggestion(suggestion)}>
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
