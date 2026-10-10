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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [failedPage, setFailedPage] = useState(1);
  const current = useRef(null);
  const countRef = useRef(onCount);
  countRef.current = onCount;

  const load = useCallback(
    async (page = 1) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      setLoading(true);
      setError(null);
      try {
        const next = await listNotifications(
          { status, page, limit: PAGE_SIZE },
          { signal: controller.signal, fresh: true }
        );
        if (current.current !== controller) return;
        setData((previous) => ({
          ...next,
          notifications:
            page === 1
              ? next.notifications
              : mergeById(previous?.notifications || [], next.notifications)
        }));
        countRef.current?.(next.unreadCount);
      } catch (failure) {
        if (current.current !== controller) return;
        setError(normalizeApiError(failure, 'Não foi possível carregar as notificações.'));
        setFailedPage(page);
      } finally {
        if (current.current === controller) setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    void load(1);
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
    data,
    loading,
    error,
    changeStatus(next) {
      if (next === status) return;
      current.current?.abort();
      setData(null);
      setStatus(next);
    },
    retry: () => load(failedPage),
    more: () => load(data.pagination.page + 1),
    reload: () => load(1),
    replace
  };
}
