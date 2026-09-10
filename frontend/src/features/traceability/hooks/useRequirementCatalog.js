import { useCallback, useEffect, useState } from 'react';
import { useTestCaseScope } from '../../testCases/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { getRequirementsTraceability } from '../api/traceability.api.js';
import { emptyFilters, mergeById } from '../model/requirement-view.js';

export function useRequirementCatalog(projectId) {
  const scope = useTestCaseScope(projectId);
  const [query, setQuery] = useState({ filters: emptyFilters, delay: 0 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedPage, setFailedPage] = useState(1);
  const load = useCallback(
    async (page = 1) => {
      const token = scope.begin('catalog');
      setLoading(true);
      setError(null);
      try {
        const next = await getRequirementsTraceability(
          projectId,
          { ...query.filters, page, limit: 20 },
          { signal: token.controller.signal }
        );
        if (!scope.accepts('catalog', token)) return;
        setData((previous) => ({
          ...next,
          items:
            page === 1
              ? next.items
              : mergeById(previous?.items || [], next.items, (item) => item.requirement.id)
        }));
      } catch (error) {
        if (scope.accepts('catalog', token)) {
          setError(normalizeApiError(error, 'Não foi possível carregar os requisitos.'));
          setFailedPage(page);
        }
      } finally {
        if (scope.accepts('catalog', token)) setLoading(false);
      }
    },
    [projectId, query, scope]
  );
  useEffect(() => {
    if (!query.delay) {
      void load();
      return;
    }
    const timer = setTimeout(() => void load(), query.delay);
    return () => clearTimeout(timer);
  }, [load, query.delay]);
  function change(key, value) {
    scope.cancelRead('catalog');
    setData(null);
    setError(null);
    setLoading(true);
    setQuery((current) => ({
      filters: { ...current.filters, [key]: value },
      delay: key === 'search' ? 300 : 0
    }));
  }
  function clear() {
    scope.cancelRead('catalog');
    setData(null);
    setError(null);
    setLoading(true);
    setQuery({ filters: emptyFilters, delay: 0 });
  }
  return {
    data,
    loading,
    error,
    filters: query.filters,
    change,
    clear,
    retry: () => load(failedPage),
    more: () => load(data.pagination.page + 1)
  };
}
