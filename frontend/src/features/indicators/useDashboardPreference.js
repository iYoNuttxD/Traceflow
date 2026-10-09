import { useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../shared/index.js';
import { indicatorsApi } from './api/indicators.api.js';

export function useDashboardPreference(projectId, active) {
  const [state, setState] = useState({ projectId: null, data: null, error: false });
  const [retry, setRetry] = useState(0);
  const [pendingProjects, setPendingProjects] = useState([]);
  const pendingRef = useRef(new Set());
  const contextRef = useRef(null);
  const preference = state.projectId === projectId ? state.data : null;
  const saving = pendingProjects.includes(projectId);
  useEffect(() => {
    const context = { projectId, active: true };
    contextRef.current = context;
    setState({ projectId, data: null, error: false });
    return () => {
      context.active = false;
    };
  }, [projectId]);
  useEffect(() => {
    // A return to this project must read after its earlier write settles, not cache an old GET.
    if (!active || preference || saving) return;
    const controller = new AbortController();
    setState({ projectId, data: null, error: false });
    void indicatorsApi.preference(projectId, { signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) setState({ projectId, data: response.data, error: false });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            projectId,
            data: null,
            error: normalizeApiError(error, 'Não foi possível carregar seu painel.')
          });
      }
    );
    return () => controller.abort();
  }, [projectId, active, preference, retry, saving]);

  async function persist(operation) {
    const context = contextRef.current;
    if (!context?.active || context.projectId !== projectId || pendingRef.current.has(projectId))
      return false;
    pendingRef.current.add(projectId);
    setPendingProjects([...pendingRef.current]);
    try {
      const response = await operation();
      // A confirmed write belongs to this project owner, even if navigation closed its editor.
      // Project changes and owner unmount still invalidate the original request context.
      if (!context.active) return false;
      setState({ projectId, data: response.data, error: false });
      return true;
    } finally {
      pendingRef.current.delete(projectId);
      // Release the project lock in the surviving owner, even after a project switch.
      if (contextRef.current?.active) setPendingProjects([...pendingRef.current]);
    }
  }

  return {
    preference,
    saving,
    error: state.projectId === projectId && state.error,
    retry: () => setRetry((value) => value + 1),
    save: (configuration) => persist(() => indicatorsApi.savePreference(projectId, configuration)),
    reset: () => persist(() => indicatorsApi.resetPreference(projectId))
  };
}
