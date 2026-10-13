import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { listNotifications } from '../api/notifications.api.js';
import { PAGE_SIZE } from '../model/notification-view.js';

function mergeById(previous, next) {
  const seen = new Set(previous.map((item) => item.id));
  return [...previous, ...next.filter((item) => !seen.has(item.id))];
}

export function useNotifications({ onCount } = {}) {
  const [status, setStatus] = useState('UNREAD');
  const [group, setGroup] = useState('ALL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedCursor, setFailedCursor] = useState(null);
  const current = useRef(null);
  const countRef = useRef(onCount);
  countRef.current = onCount;

  const load = useCallback(
    async (cursor = null) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      setLoading(true);
      setError(null);
      try {
        const filters = group === 'ALL' ? { status } : { status, group };
        const next = await listNotifications(
          cursor
            ? { ...filters, cursor, limit: PAGE_SIZE }
            : { ...filters, page: 1, limit: PAGE_SIZE },
          { signal: controller.signal, fresh: true }
        );
        if (current.current !== controller) return;
        setData((previous) => ({
          ...next,
          notifications: cursor
            ? mergeById(previous?.notifications || [], next.notifications)
            : next.notifications
        }));
        countRef.current?.(next.unreadCount);
      } catch (failure) {
        if (current.current !== controller) return;
        setError(normalizeApiError(failure, 'Não foi possível carregar as notificações.'));
        setFailedCursor(cursor);
      } finally {
        if (current.current === controller) setLoading(false);
      }
    },
    [status, group]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => current.current?.abort(), []);

  const replace = useCallback((notification) => {
    setData((previous) =>
      previous
        ? {
            ...previous,
            notifications: previous.notifications.map((item) =>
              item.id === notification.id ? notification : item
            )
          }
        : previous
    );
  }, []);

  return {
    status,
    group,
    data,
    loading,
    error,
    changeStatus(next) {
      if (next === status) return;
      current.current?.abort();
      setData(null);
      setStatus(next);
    },
    changeGroup(next) {
      if (next === group) return;
      current.current?.abort();
      setData(null);
      setGroup(next);
    },
    retry: () => load(failedCursor),
    more: () => load(data.nextCursor),
    reload: () => load(),
    replace
  };
}
