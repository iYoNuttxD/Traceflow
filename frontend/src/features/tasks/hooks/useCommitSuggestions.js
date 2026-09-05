import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmCommitSuggestion,
  getCommitSuggestions,
  rejectCommitSuggestion,
  scanCommitSuggestions
} from '../../traceability/index.js';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar as sugestões de commits.';

export function useCommitSuggestions({ projectId, taskId, onConfirmed }) {
  const [suggestions, setSuggestions] = useState([]);
  const [permissions, setPermissions] = useState({ canReview: false });
  const [loading, setLoading] = useState(Boolean(taskId));
  const [actionId, setActionId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const { run } = useAbortableRequest();
  const scanRequestRef = useRef(null);
  const contextRef = useRef(null);

  useEffect(() => {
    const context = { projectId, taskId };
    contextRef.current = context;
    scanRequestRef.current = null;
    setScanning(false);
    setScanResult(null);
    return () => {
      if (contextRef.current === context) contextRef.current = null;
    };
  }, [projectId, taskId]);

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
      const data = await run((signal) =>
        getCommitSuggestions(
          projectId,
          {
            status: 'PENDING',
            taskId,
            page: 1,
            limit: 20
          },
          { signal }
        )
      );
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

  useEffect(() => {
    void load();
  }, [load]);

  const review = useCallback(
    async (suggestion, operation, confirmed) => {
      const context = contextRef.current;
      setActionId(suggestion.id);
      setError('');
      try {
        await operation(projectId, suggestion.id);
        if (contextRef.current !== context) return;
        if (confirmed) onConfirmed?.(suggestion.commit);
        setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      } catch (cause) {
        if (contextRef.current !== context) return;
        setError(normalizeApiError(cause, fallbackMessage).message);
      } finally {
        if (contextRef.current === context) setActionId(null);
      }
    },
    [onConfirmed, projectId]
  );

  const scan = useCallback(async () => {
    if (!taskId || !permissions.canReview || scanRequestRef.current) return;

    const request = { projectId, taskId };
    scanRequestRef.current = request;
    setScanning(true);
    setScanResult(null);
    setError('');
    try {
      const result = await scanCommitSuggestions(projectId);
      if (scanRequestRef.current !== request) return;
      setScanResult(result);
      await load();
    } catch (cause) {
      if (scanRequestRef.current !== request) return;
      setError(normalizeApiError(cause, fallbackMessage).message);
    } finally {
      if (scanRequestRef.current === request) {
        scanRequestRef.current = null;
        setScanning(false);
      }
    }
  }, [load, permissions.canReview, projectId, taskId]);

  return {
    suggestions,
    permissions,
    loading,
    actionId,
    scanning,
    scanResult,
    error,
    retry: load,
    scan,
    confirmSuggestion: (suggestion) => review(suggestion, confirmCommitSuggestion, true),
    rejectSuggestion: (suggestion) => review(suggestion, rejectCommitSuggestion, false)
  };
}
