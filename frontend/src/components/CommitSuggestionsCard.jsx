import { useCallback, useEffect, useState } from 'react';
import {
  confirmCommitSuggestion,
  getCommitSuggestions,
  rejectCommitSuggestion,
  scanCommitSuggestions
} from '../api/api.js';
import { Card } from '../shared/index.js';

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

export function CommitSuggestionsCard({ projectId }) {
  const [suggestions, setSuggestions] = useState([]);
  const [permissions, setPermissions] = useState({ canReview: false });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getCommitSuggestions(projectId, { status: 'PENDING', page: 1, limit: 20 });
      setSuggestions(data.suggestions || []);
      setPermissions(data.permissions || { canReview: false });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function review(suggestionId, operation) {
    setActionId(suggestionId);
    setError('');
    try {
      await operation(projectId, suggestionId);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setActionId(null);
    }
  }

  async function scan() {
    setScanning(true);
    setError('');
    try {
      await scanCommitSuggestions(projectId);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setScanning(false);
    }
  }

  return (
    <Card title="Sugestões de commits">
      {permissions.canReview && (
        <button className="button button-secondary" type="button" disabled={scanning || actionId !== null} onClick={() => void scan()}>
          {scanning ? 'Analisando commits...' : 'Analisar commits existentes'}
        </button>
      )}
      {error && <div className="message message-error" role="alert">{error}</div>}
      {loading ? (
        <p className="empty-state">Carregando sugestões de commits...</p>
      ) : suggestions.length === 0 ? (
        <p className="empty-state">Nenhuma sugestão de commit pendente.</p>
      ) : (
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
                    <button className="button" type="button" disabled={processing || scanning} onClick={() => void review(suggestion.id, confirmCommitSuggestion)}>
                      {processing ? 'Processando...' : 'Confirmar'}
                    </button>
                    <button className="button button-secondary" type="button" disabled={processing || scanning} onClick={() => void review(suggestion.id, rejectCommitSuggestion)}>
                      Rejeitar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
