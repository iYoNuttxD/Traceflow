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
const detached = Object.freeze({
  unreadCount: 0,
  refresh: async () => {},
  report: () => {},
  begin: () => 0
});

export function UnreadNotificationsProvider({ children }) {
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const blockedUntil = useRef(0);
  const current = useRef(null);
  const issued = useRef(0);
  const applied = useRef(0);

  const begin = useCallback(() => {
    issued.current += 1;
    return issued.current;
  }, []);

  const accept = useCallback((ticket, count) => {
    if (ticket <= applied.current) return;
    applied.current = ticket;
    setUnreadCount(count);
  }, []);

  const refresh = useCallback(async () => {
    if (Date.now() < blockedUntil.current) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const ticket = begin();
    try {
      const next = await getUnreadNotificationCount({ signal: controller.signal, fresh: true });
      accept(ticket, Number(next?.unreadCount) || 0);
    } catch (failure) {
      const error = normalizeApiError(failure);
      if (error.status === 429) blockedUntil.current = Date.now() + error.retryAfterSeconds * 1000;
    }
  }, [accept, begin]);

  const report = useCallback(
    (count, ticket = begin()) => {
      if (Number.isInteger(count) && count >= 0) accept(ticket, count);
    },
    [accept, begin]
  );

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

  const value = useMemo(
    () => ({ unreadCount, refresh, report, begin }),
    [unreadCount, refresh, report, begin]
  );
  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}

export function useUnreadNotifications() {
  return useContext(UnreadNotificationsContext) ?? detached;
}
