import { useRef, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import { markAllNotificationsRead, markNotification } from '../api/notifications.api.js';
import { NotificationCard } from '../components/NotificationCard.jsx';
import { useUnreadNotifications } from '../context/UnreadNotificationsContext.jsx';
import { useNotifications } from '../hooks/useNotifications.js';
import {
  NOTIFICATION_FILTERS,
  UNAVAILABLE_MESSAGE,
  markAllMessage,
  notificationEmptyTitle
} from '../model/notification-view.js';
import './NotificationsScreen.css';

function failureFeedback(failure, fallback) {
  const error = normalizeApiError(failure, fallback);
  if (error.status === 404) return { info: UNAVAILABLE_MESSAGE, unavailable: true };
  if (error.status === 429)
    return { rateLimit: error.message, retryAfterSeconds: error.retryAfterSeconds };
  return { error: error.message };
}

export function NotificationsScreen() {
  const { refresh: refreshCount, report } = useUnreadNotifications();
  const list = useNotifications({ onCount: report });
  const [feedback, setFeedback] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const headingRef = useRef(null);
  const items = list.data?.notifications || [];
  const unreadCount = list.data?.unreadCount ?? 0;

  async function toggleRead(notification) {
    if (busyId) return;
    setBusyId(notification.id);
    setFeedback({});
    try {
      const response = await markNotification(notification.id, !notification.readAt);
      list.replace(response.notification);
      await refreshCount();
    } catch (failure) {
      const next = failureFeedback(failure, 'Não foi possível atualizar a notificação.');
      setFeedback(next);
      if (next.unavailable) {
        await list.reload();
        void refreshCount();
        headingRef.current?.focus();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setFeedback({});
    try {
      const response = await markAllNotificationsRead();
      setFeedback({ success: markAllMessage(response.updated) });
      await list.reload();
      await refreshCount();
      headingRef.current?.focus();
    } catch (failure) {
      setFeedback(failureFeedback(failure, 'Não foi possível marcar as notificações como lidas.'));
    } finally {
      setMarkingAll(false);
    }
  }

  function open(notification) {
    if (notification.readAt) return;
    markNotification(notification.id, true)
      .then(() => refreshCount())
      .catch(() => {});
  }

  return (
    <main className="page-container notifications-screen">
      <header className="page-header notifications-screen__header">
        <div>
          <span className="eyebrow">Central</span>
          <h1>Notificações</h1>
          <p>
            Avisos sobre as tarefas pelas quais você é responsável: mudanças de status feitas por
            outras pessoas e prazos vencidos.
          </p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={markAll}
          aria-disabled={markingAll || unreadCount === 0}
          aria-busy={markingAll || undefined}
        >
          Marcar todas como lidas
        </button>
      </header>
      {(feedback.success || feedback.error || feedback.info || feedback.rateLimit) && (
        <FeedbackRegion
          success={feedback.success}
          error={feedback.error}
          info={feedback.info}
          rateLimit={feedback.rateLimit}
          retryAfterSeconds={feedback.retryAfterSeconds}
        />
      )}
      <fieldset className="notifications-filter">
        <legend>Mostrar</legend>
        {NOTIFICATION_FILTERS.map((filter) => (
          <label key={filter.value} className="notifications-filter__option">
            <input
              type="radio"
              name="notification-status"
              value={filter.value}
              checked={list.status === filter.value}
              onChange={() => list.changeStatus(filter.value)}
            />
            <span>{filter.label}</span>
          </label>
        ))}
      </fieldset>
      <section className="notifications-list-section" aria-labelledby="notifications-list-title">
        <h2 id="notifications-list-title" ref={headingRef} tabIndex={-1}>
          {list.status === 'ALL' ? 'Todas as notificações' : 'Não lidas'}
        </h2>
        {items.length > 0 && (
          <ul className="notifications-list">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationCard
                  notification={notification}
                  busy={busyId === notification.id}
                  onToggleRead={toggleRead}
                  onOpen={open}
                />
              </li>
            ))}
          </ul>
        )}
        {list.loading && <LoadingState message="Carregando notificações..." />}
        {list.error && (
          <ErrorState
            message={list.error.message}
            retryAfterSeconds={list.error.retryAfterSeconds}
            onRetry={list.retry}
          />
        )}
        {!list.loading && !list.error && list.data && items.length === 0 && (
          <EmptyState title={notificationEmptyTitle(list.status)} />
        )}
        {!list.error && list.data?.pagination.page < list.data?.pagination.totalPages && (
          <button
            type="button"
            className="button button-secondary notifications-load-more"
            disabled={list.loading}
            onClick={list.more}
          >
            Carregar mais notificações
          </button>
        )}
      </section>
    </main>
  );
}
