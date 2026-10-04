import { useEffect, useState } from 'react';
import { indicatorsApi } from './api/indicators.api.js';

export function useDashboardPreference(projectId, active) {
  const [state, setState] = useState({ projectId: null, data: null, error: false });
  const [retry, setRetry] = useState(0);
  const preference = state.projectId === projectId ? state.data : null;
  useEffect(() => {
    if (!active || preference) return;
    const controller = new AbortController();
    setState({ projectId, data: null, error: false });
    void indicatorsApi.preference(projectId, { signal: controller.signal }).then(
      (response) => {
        if (!controller.signal.aborted) setState({ projectId, data: response.data, error: false });
      },
      () => {
        if (!controller.signal.aborted) setState({ projectId, data: null, error: true });
      }
    );
    return () => controller.abort();
  }, [projectId, active, preference, retry]);
  return {
    preference,
    error: state.projectId === projectId && state.error,
    retry: () => setRetry((value) => value + 1),
    accept: (data) => setState({ projectId, data, error: false })
  };
}
