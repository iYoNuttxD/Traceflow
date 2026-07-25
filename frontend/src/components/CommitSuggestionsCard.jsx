import { useCallback, useEffect, useState } from 'react';
import {
  confirmCommitSuggestion,
  getCommitSuggestions,
  rejectCommitSuggestion
} from '../api/api.js';

const statusLabels = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rejeitada'
};

function errorMessage(error) {
  return error?.response?.data?.message || 'Não foi possível processar as sugestões de commits.';
}

function summarizedMessage(message) {
  if (!message) return 'Commit sem mensagem.';
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

export function CommitSuggestionsCard({ projectId, taskId, onConfirmed }) {
  const [suggestions, setSuggestions] = useState([]);
  const [permissions, setPermissions] = useState({ canReview: false });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!taskId) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getCommitSuggestions(projectId, {
        status: 'PENDING',
        taskId,
        page: 1,
        limit: 20
      });
      setSuggestions(data.suggestions || []);
      setPermissions(data.permissions || { canReview: false });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => { void load(); }, [load]);

  async function review(suggestion, operation) {
    const suggestionId = suggestion.id;
    setActionId(suggestionId);
    setError('');
    try {
      await operation(projectId, suggestionId);
      if (operation === confirmCommitSuggestion) onConfirmed?.(suggestion.commit);
      setSuggestions((current) => current.filter((item) => item.id !== suggestionId));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setActionId(null);
    }
  }

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
                    <button className="button" type="button" disabled={processing || actionId !== null} onClick={() => void review(suggestion, confirmCommitSuggestion)}>
                      {processing ? 'Processando...' : 'Confirmar'}
                    </button>
                    <button className="button button-secondary" type="button" disabled={processing || actionId !== null} onClick={() => void review(suggestion, rejectCommitSuggestion)}>
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
