import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useLocation } from 'react-router';
import { normalizeApiError } from '../../../shared/index.js';
import { getUnreadNotificationCount } from '../api/notifications.api.js';
import { POLL_INTERVAL_MS } from '../model/notification-view.js';

const UnreadNotificationsContext = createContext(null);
const detached = Object.freeze({ unreadCount: 0, refresh: async () => {}, report: () => {} });

export function UnreadNotificationsProvider({ children }) {
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const blockedUntil = useRef(0);
  const current = useRef(null);

  const refresh = useCallback(async () => {
    if (Date.now() < blockedUntil.current) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    try {
      const next = await getUnreadNotificationCount({ signal: controller.signal, fresh: true });
      if (current.current === controller) setUnreadCount(Number(next?.unreadCount) || 0);
    } catch (failure) {
      const error = normalizeApiError(failure);
      if (error.status === 429)
        blockedUntil.current = Date.now() + (error.retryAfterSeconds || 60) * 1000;
    }
  }, []);

  const report = useCallback((count) => {
    if (Number.isInteger(count) && count >= 0) setUnreadCount(count);
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const whenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(whenVisible, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
      current.current?.abort();
    };
  }, [refresh]);

  const value = useMemo(() => ({ unreadCount, refresh, report }), [unreadCount, refresh, report]);
  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}

export function useUnreadNotifications() {
  return useContext(UnreadNotificationsContext) ?? detached;
}
