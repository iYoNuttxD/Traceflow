import { useCallback, useEffect, useState } from 'react';
import {
  confirmCommitSuggestion,
  getCommitSuggestions,
  rejectCommitSuggestion
} from '../../traceability/index.js';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar as sugestões de commits.';

export function useCommitSuggestions({ projectId, taskId, onConfirmed }) {
  const [suggestions, setSuggestions] = useState([]);
  const [permissions, setPermissions] = useState({ canReview: false });
  const [loading, setLoading] = useState(Boolean(taskId));
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const { run } = useAbortableRequest();

  const load = useCallback(async () => {
    if (!taskId) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    let settled = false;
    try {
      const data = await run((signal) => getCommitSuggestions(projectId, {
        status: 'PENDING', taskId, page: 1, limit: 20
      }, { signal }));
      if (!data) return;
      settled = true;
      setSuggestions(data.suggestions || []);
      setPermissions(data.permissions || { canReview: false });
    } catch (cause) {
      settled = true;
      setError(normalizeApiError(cause, fallbackMessage).message);
    } finally {
      if (settled) setLoading(false);
    }
  }, [projectId, run, taskId]);

  useEffect(() => { void load(); }, [load]);

  const review = useCallback(async (suggestion, operation, confirmed) => {
    setActionId(suggestion.id);
    setError('');
    try {
      await operation(projectId, suggestion.id);
      if (confirmed) onConfirmed?.(suggestion.commit);
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    } catch (cause) {
      setError(normalizeApiError(cause, fallbackMessage).message);
    } finally {
      setActionId(null);
    }
  }, [onConfirmed, projectId]);

  return {
    suggestions,
    permissions,
    loading,
    actionId,
    error,
    retry: load,
    confirmSuggestion: (suggestion) => review(suggestion, confirmCommitSuggestion, true),
    rejectSuggestion: (suggestion) => review(suggestion, rejectCommitSuggestion, false)
  };
}
