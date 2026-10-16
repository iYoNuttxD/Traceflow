import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { getTraceabilityAlertIndex } from '../api/traceability.api.js';

const EMPTY_INDEX = Object.freeze({
  tasks: new Map(),
  pullRequests: new Map(),
  issues: new Map()
});

function toMap(entries = []) {
  return new Map(entries.map((entry) => [entry.subjectId, entry.alertId]));
}

export function useOpenAlertIndex(projectId) {
  const [index, setIndex] = useState(EMPTY_INDEX);
  const [error, setError] = useState(null);
  const requestRef = useRef({ sequence: 0, controller: null });

  const reload = useCallback(async () => {
    const request = requestRef.current;
    request.controller?.abort();
    const controller = new AbortController();
    const sequence = ++request.sequence;
    request.controller = controller;
    try {
      const data = await getTraceabilityAlertIndex(
        projectId,
        { status: 'OPEN' },
        { signal: controller.signal, fresh: true }
      );
      if (sequence !== request.sequence) return;
      setIndex({
        tasks: toMap(data?.tasks),
        pullRequests: toMap(data?.pullRequests),
        issues: toMap(data?.issues)
      });
      setError(null);
    } catch (failure) {
      if (sequence !== request.sequence || controller.signal.aborted) return;
      setError(normalizeApiError(failure, 'Não foi possível carregar as inconsistências abertas.'));
    }
  }, [projectId]);

  useEffect(() => {
    const request = requestRef.current;
    setIndex(EMPTY_INDEX);
    setError(null);
    void reload();
    return () => {
      request.sequence += 1;
      request.controller?.abort();
    };
  }, [reload]);

  return { ...index, error, reload };
}
