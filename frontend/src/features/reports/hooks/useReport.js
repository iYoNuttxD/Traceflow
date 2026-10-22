import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { reportsApi } from '../api/reports.api.js';
import { isReportActive } from '../model/report-display.js';
import { pollRetryDelay } from '../model/report-polling.js';
import { REPORT_POLL_MS } from './useProjectReports.js';

export function useReport(projectId, reportId, { pollMs = REPORT_POLL_MS } = {}) {
  const [state, setState] = useState({ report: null, loading: true, error: null, failures: 0 });
  const generation = useRef(0);
  const controller = useRef(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const current = ++generation.current;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      if (!silent) setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const report = await reportsApi.get(projectId, reportId, {
          signal: request.signal,
          fresh: true
        });
        if (current === generation.current)
          setState({ report, loading: false, error: null, failures: 0 });
      } catch (error) {
        if (request.signal.aborted || current !== generation.current) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: normalizeApiError(error, 'Não foi possível carregar o relatório.'),
          failures: silent ? previous.failures + 1 : 1
        }));
      }
    },
    [projectId, reportId]
  );

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
      controller.current?.abort();
    };
  }, [load]);

  // Falha na atualização mantém o relatório anterior na tela; `polling` diz se ainda há
  // uma nova consulta agendada, para a tela não prometer atualização que parou.
  const active = isReportActive(state.report);
  const delay = state.error ? pollRetryDelay(state.error, state.failures, pollMs) : pollMs;
  const polling = active && delay != null;
  useEffect(() => {
    if (!polling) return undefined;
    const timer = window.setTimeout(() => void load({ silent: true }), delay);
    return () => window.clearTimeout(timer);
  }, [polling, delay, state.report, state.error, load]);

  return {
    report: state.report,
    loading: state.loading,
    error: state.error,
    polling,
    reload: load
  };
}
