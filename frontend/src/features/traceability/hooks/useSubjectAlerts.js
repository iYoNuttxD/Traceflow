import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { getTraceabilityAlerts } from '../api/traceability.api.js';

export const SUBJECT_HISTORY_LIMIT = 50;

export function useSubjectAlerts(projectId, subject, { enabled = true } = {}) {
  const [state, setState] = useState({ loading: enabled, data: null, error: null });
  const requestRef = useRef({ sequence: 0, controller: null });
  const subjectKey = subject ? JSON.stringify(subject) : '';

  const reload = useCallback(async () => {
    const request = requestRef.current;
    request.controller?.abort();
    if (!enabled || !subjectKey) {
      request.sequence += 1;
      setState({ loading: false, data: null, error: null });
      return;
    }
    const controller = new AbortController();
    const sequence = ++request.sequence;
    request.controller = controller;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await getTraceabilityAlerts(
        projectId,
        { status: 'ALL', ...JSON.parse(subjectKey), limit: SUBJECT_HISTORY_LIMIT },
        { signal: controller.signal, fresh: true }
      );
      if (sequence === request.sequence) setState({ loading: false, data, error: null });
    } catch (failure) {
      if (sequence !== request.sequence || controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: normalizeApiError(
          failure,
          'Não foi possível carregar o histórico de inconsistências.'
        )
      }));
    }
  }, [enabled, projectId, subjectKey]);

  useEffect(() => {
    const request = requestRef.current;
    void reload();
    return () => {
      request.sequence += 1;
      request.controller?.abort();
    };
  }, [reload]);

  return {
    loading: state.loading,
    error: state.error,
    alerts: state.data?.alerts || [],
    total: state.data?.pagination?.total ?? 0,
    permissions: state.data?.permissions || {},
    loaded: Boolean(state.data),
    reload
  };
}
