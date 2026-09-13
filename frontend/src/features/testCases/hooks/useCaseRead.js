import { useCallback, useEffect, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import { mergeItems } from '../model/test-cases.js';
import { useTestCaseScope } from './useTestCaseScope.js';

export function useCaseRead(kind, id) {
  const scope = useTestCaseScope(`${kind}:${id}`);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    async (cursor) => {
      const token = scope.begin('read');
      setLoading(true);
      setError(null);
      try {
        const options = { signal: token.controller.signal };
        const response = ['history', 'executions'].includes(kind)
          ? await testCasesApi[kind](id, { cursor, limit: 30 }, options)
          : await testCasesApi[kind](id, options);
        if (scope.accepts('read', token))
          setData((old) =>
            cursor ? { ...response, items: mergeItems(old?.items || [], response.items) } : response
          );
      } catch (e) {
        if (scope.accepts('read', token)) setError(normalizeApiError(e));
      } finally {
        if (scope.accepts('read', token)) setLoading(false);
      }
    },
    [id, kind, scope]
  );
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  return { data, error, loading, load };
}
