import { useCallback, useEffect, useState } from 'react';
import { useTestCaseScope } from '../../testCases/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { getTraceabilityAlerts } from '../api/traceability.api.js';
import { emptyAlertFilters } from '../model/alert-view.js';
import { mergeById } from '../model/requirement-view.js';

export function useTraceabilityAlerts(projectId) {
  const scope = useTestCaseScope(`${projectId}:alerts`);
  const [filters, setFilters] = useState(emptyAlertFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedPage, setFailedPage] = useState(1);
  const load = useCallback(
    async (page = 1) => {
      const token = scope.begin('alerts');
      setLoading(true);
      setError(null);
      try {
        const next = await getTraceabilityAlerts(
          projectId,
          { ...filters, page, limit: 20 },
          { signal: token.controller.signal, fresh: true }
        );
        if (!scope.accepts('alerts', token)) return;
        setData((previous) => ({
          ...next,
          alerts: page === 1 ? next.alerts : mergeById(previous?.alerts || [], next.alerts)
        }));
      } catch (failure) {
        if (scope.accepts('alerts', token)) {
          setError(normalizeApiError(failure, 'Não foi possível carregar os alertas.'));
          setFailedPage(page);
        }
      } finally {
        if (scope.accepts('alerts', token)) setLoading(false);
      }
    },
    [projectId, filters, scope]
  );
  useEffect(() => {
    void load();
  }, [load]);
  function reset(nextFilters) {
    scope.cancelRead('alerts');
    setData(null);
    setError(null);
    setLoading(true);
    setFilters(nextFilters);
  }
  return {
    data,
    loading,
    error,
    filters,
    change: (key, value) => reset({ ...filters, [key]: value }),
    clear: () => reset(emptyAlertFilters),
    retry: () => load(failedPage),
    more: () => load(data.pagination.page + 1),
    reload: () => load(1)
  };
}
