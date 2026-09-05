import { useEffect, useState } from 'react';
import { scheduleApi } from '../../schedule/index.js';
import { KANBAN_COLUMNS } from '../components/kanban-display.js';
import { normalizeApiError } from '../../../shared/index.js';

export function useFrozenSprintBoard(projectId, sprintId) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!sprintId) return;
    const controller = new AbortController();
    const context = { projectId, sprintId, attempt };
    scheduleApi
      .listSprintTasks(sprintId, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const projection = response.data;
        // A terminal selection must never fall back to a live Task response.
        if (!projection.isFrozen) throw new Error('O snapshot desta Sprint não está disponível.');
        const columns = Object.fromEntries(
          KANBAN_COLUMNS.map((column) => [
            column.status,
            projection.tasks.filter((task) => task.status === column.status)
          ])
        );
        setResult({ ...context, projection, board: { columns }, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            ...context,
            error: normalizeApiError(error, 'Não foi possível carregar o quadro congelado.').message
          });
      });
    return () => controller.abort();
  }, [projectId, sprintId, attempt]);
  const current =
    result?.projectId === projectId && result?.sprintId === sprintId && result?.attempt === attempt
      ? result
      : null;
  return {
    ...current,
    loading: Boolean(sprintId && !current),
    retry: () => setAttempt((value) => value + 1)
  };
}
