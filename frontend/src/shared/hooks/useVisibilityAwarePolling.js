import { useEffect, useRef } from 'react';

function pageIsVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useVisibilityAwarePolling({ enabled = true, intervalMs, callback }) {
  const callbackRef = useRef(callback);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !Number.isFinite(intervalMs) || intervalMs <= 0) return undefined;

    let active = true;

    const refresh = async () => {
      if (!active || !pageIsVisible() || inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        await callbackRef.current();
      } catch {
        // O owner apresenta falhas de revalidação sem gerar uma rejection global.
      } finally {
        if (active) inFlightRef.current = false;
      }
    };

    const timerId = window.setInterval(() => void refresh(), intervalMs);
    const handleVisibilityChange = () => {
      if (pageIsVisible()) void refresh();
    };
    const handleFocus = () => {
      if (pageIsVisible()) void refresh();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      inFlightRef.current = false;
      window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, intervalMs]);
}
