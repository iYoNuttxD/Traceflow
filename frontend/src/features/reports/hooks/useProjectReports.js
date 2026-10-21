import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { reportsApi } from '../api/reports.api.js';
import { isReportActive } from '../model/report-display.js';

export const REPORTS_PAGE_SIZE = 12;
export const REPORTS_MAX_LISTED = 100;
export const REPORT_POLL_MS = 2500;

// Lista do projeto + acompanhamento das gerações ativas. A geração roda no servidor;
// enquanto houver alguma na fila ou gerando, a lista é relida em intervalos curtos.
// Os filtros são aplicados pela API, então total e paginação já vêm filtrados.
export function useProjectReports(projectId, { pollMs = REPORT_POLL_MS, params = {} } = {}) {
  const [state, setState] = useState({
    items: [],
    pagination: null,
    summary: null,
    loading: true,
    error: null
  });
  const generation = useRef(0);
  const controller = useRef(null);
  const limit = useRef(REPORTS_PAGE_SIZE);
  const paramsKey = JSON.stringify(params);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const current = ++generation.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      if (!silent) setState((previous) => ({ ...previous, loading: true }));
      try {
        const data = await reportsApi.list(
          projectId,
          { ...JSON.parse(paramsKey), page: 1, limit: limit.current },
          { signal: request.signal, fresh: true }
        );
        if (current !== generation.current) return null;
        setState({
          items: data.items,
          pagination: data.pagination,
          summary: data.summary ?? null,
          loading: false,
          error: null
        });
        return data;
      } catch (error) {
        if (request.signal.aborted || current !== generation.current) return null;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: normalizeApiError(error, 'Não foi possível carregar os relatórios.')
        }));
        return null;
      }
    },
    [projectId, paramsKey]
  );

  useEffect(() => {
    limit.current = REPORTS_PAGE_SIZE;
    void load();
    return () => {
      generation.current += 1;
      controller.current?.abort();
    };
  }, [load]);

  const hasActive = state.items.some(isReportActive);
  useEffect(() => {
    if (!hasActive || state.error) return undefined;
    const timer = window.setTimeout(() => void load({ silent: true }), pollMs);
    return () => window.clearTimeout(timer);
  }, [hasActive, state.items, state.error, load, pollMs]);

  // A API aceita no máximo 100 por página; acima disso a tela avisa o recorte.
  const loadMore = useCallback(() => {
    limit.current = Math.min(REPORTS_MAX_LISTED, limit.current + REPORTS_PAGE_SIZE);
    return load({ silent: true });
  }, [load]);

  const create = useCallback(
    async (body) => {
      const result = await reportsApi.create(projectId, body);
      await load({ silent: true });
      return result;
    },
    [projectId, load]
  );

  return { ...state, hasActive, load, loadMore, create };
}
