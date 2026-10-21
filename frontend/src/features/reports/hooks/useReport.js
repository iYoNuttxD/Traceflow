import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { reportsApi } from '../api/reports.api.js';
import { isReportActive } from '../model/report-display.js';
import { REPORT_POLL_MS } from './useProjectReports.js';

export function useReport(projectId, reportId, { pollMs = REPORT_POLL_MS } = {}) {
  const [state, setState] = useState({ report: null, loading: true, error: null });
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
        if (current === generation.current) setState({ report, loading: false, error: null });
      } catch (error) {
        if (request.signal.aborted || current !== generation.current) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: normalizeApiError(error, 'Não foi possível carregar o relatório.')
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

  const active = isReportActive(state.report);
  useEffect(() => {
    if (!active || state.error) return undefined;
    const timer = window.setTimeout(() => void load({ silent: true }), pollMs);
    return () => window.clearTimeout(timer);
  }, [active, state.report, state.error, load, pollMs]);

  return { ...state, reload: load };
}
