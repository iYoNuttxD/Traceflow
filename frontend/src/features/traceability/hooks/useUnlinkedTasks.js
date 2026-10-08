import { useCallback, useEffect, useState } from 'react';
import { useTestCaseScope } from '../../testCases/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { getTasksWithoutTechnicalLinks } from '../api/traceability.api.js';
import { mergeById } from '../model/requirement-view.js';

export function useUnlinkedTasks(projectId) {
  const scope = useTestCaseScope(`${projectId}:unlinked-tasks`);
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedPage, setFailedPage] = useState(1);
  const load = useCallback(
    async (page = 1) => {
      const token = scope.begin('tasks');
      setLoading(true);
      setError(null);
      try {
        const next = await getTasksWithoutTechnicalLinks(
          projectId,
          { status, page, limit: 20 },
          { signal: token.controller.signal, fresh: true }
        );
        if (!scope.accepts('tasks', token)) return;
        setData((previous) => ({
          ...next,
          tasks: page === 1 ? next.tasks : mergeById(previous?.tasks || [], next.tasks)
        }));
      } catch (failure) {
        if (scope.accepts('tasks', token)) {
          setError(
            normalizeApiError(failure, 'Não foi possível carregar as tarefas sem vínculo técnico.')
          );
          setFailedPage(page);
        }
      } finally {
        if (scope.accepts('tasks', token)) setLoading(false);
      }
    },
    [projectId, status, scope]
  );
  useEffect(() => {
    void load();
  }, [load]);
  return {
    data,
    loading,
    error,
    status,
    changeStatus(value) {
      scope.cancelRead('tasks');
      setData(null);
      setError(null);
      setLoading(true);
      setStatus(value);
    },
    retry: () => load(failedPage),
    more: () => load(data.pagination.page + 1)
  };
}
