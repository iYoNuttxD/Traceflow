import { useCallback, useEffect, useState } from 'react';
import { useTestCaseScope } from '../../testCases/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { getTraceabilityAlertSummary } from '../api/traceability.api.js';

export function useAlertSummary(projectId) {
  const scope = useTestCaseScope(`${projectId}:alert-summary`);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const reload = useCallback(async () => {
    const token = scope.begin('summary');
    try {
      const next = await getTraceabilityAlertSummary(projectId, {
        signal: token.controller.signal,
        fresh: true
      });
      if (!scope.accepts('summary', token)) return;
      setSummary(next ?? null);
      setError(null);
    } catch (failure) {
      if (scope.accepts('summary', token))
        setError(normalizeApiError(failure, 'Não foi possível carregar o resumo dos alertas.'));
    }
  }, [projectId, scope]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { summary, error, reload };
}
