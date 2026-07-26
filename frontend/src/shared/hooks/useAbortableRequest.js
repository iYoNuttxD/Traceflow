import { useCallback, useEffect, useRef } from 'react';
import { isRequestCanceled } from '../../api/http-client.js';

export function useAbortableRequest() {
  const current = useRef(null);
  useEffect(() => () => current.current?.abort(), []);

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);

  const run = useCallback(async (operation) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    try {
      const result = await operation(controller.signal);
      return controller.signal.aborted ? undefined : result;
    } catch (error) {
      if (isRequestCanceled(error) || controller.signal.aborted) return undefined;
      throw error;
    } finally {
      if (current.current === controller) current.current = null;
    }
  }, []);

  return { run, cancel };
}
