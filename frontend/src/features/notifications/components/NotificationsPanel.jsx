import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EmptyState,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  SelectControl,
  normalizeApiError
} from '../../../shared/index.js';
import {
  escapeBelongsToExpandedControl,
  useDialogLayer
} from '../../../shared/components/dialog-stack.js';
import { markAllNotificationsRead, markNotification } from '../api/notifications.api.js';
import { useUnreadNotifications } from '../context/UnreadNotificationsContext.jsx';
import { useNotifications } from '../hooks/useNotifications.js';
import {
  NOTIFICATION_FILTERS,
  NOTIFICATION_GROUPS,
  UNAVAILABLE_MESSAGE,
  loadMoreLabel,
  markAllMessage,
  notificationEmptyTitle
} from '../model/notification-view.js';
import { NotificationIcon } from './NotificationIcon.jsx';
import { NotificationItem } from './NotificationItem.jsx';
import { NotificationPreferencesForm } from './NotificationPreferencesForm.jsx';
import './NotificationsPanel.css';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');
const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

function failureFeedback(failure, fallback) {
  const error = normalizeApiError(failure, fallback);
  if (error.status === 404) return { info: UNAVAILABLE_MESSAGE, unavailable: true };
  if (error.status === 429)
    return { rateLimit: error.message, retryAfterSeconds: error.retryAfterSeconds };
  return { error: error.message };
}

export function NotificationsPanel({ onClose, sidebarState = 'expanded' }) {
  const isTopLayer = useDialogLayer(true);
  const { unreadCount, refresh: refreshCount, report, begin } = useUnreadNotifications();
  const list = useNotifications({ onCount: report, beginCount: begin });
  const [feedback, setFeedback] = useState({});
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const [view, setView] = useState('list');
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const preferencesTitleRef = useRef(null);
  const preferencesButtonRef = useRef(null);
  const viewChangedRef = useRef(false);
  const listRef = useRef(list);
  const busyRef = useRef(busyIds);
  listRef.current = list;
  busyRef.current = busyIds;
  const items = list.data?.notifications || [];
  const remaining = Math.max((list.data?.pagination?.total ?? 0) - items.length, 0);

  useEffect(() => {
    if (!viewChangedRef.current) return;
    if (view === 'preferences') preferencesTitleRef.current?.focus();
    else preferencesButtonRef.current?.focus();
  }, [view]);

  function showView(next) {
    viewChangedRef.current = true;
    setView(next);
  }

  useEffect(() => {
    titleRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (!isTopLayer() || escapeBelongsToExpandedControl(event)) return;
        event.preventDefault();
        onClose();
        return;
      }
      const panel = panelRef.current;
      if (event.key !== 'Tab' || !panel || !isTopLayer()) return;
      const focusable = [...panel.querySelectorAll(focusableSelector)].filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      );
      if (focusable.length === 0) return;
      const active = document.activeElement;
      const follows = (element) =>
        Boolean(active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
      const others = focusable.filter((element) => element !== active);
      if (!panel.contains(active)) {
        event.preventDefault();
        focusable[0].focus();
      } else if (event.shiftKey && !others.some((element) => !follows(element))) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && !others.some(follows)) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTopLayer, onClose]);

  const toggleRead = useCallback(
    async (notification) => {
      if (busyRef.current.has(notification.id)) return;
      setBusyIds((previous) => new Set(previous).add(notification.id));
      setFeedback({});
      try {
        const response = await markNotification(notification.id, !notification.readAt);
        listRef.current.replace(response.notification);
        await refreshCount();
      } catch (failure) {
        const next = failureFeedback(failure, 'Não foi possível atualizar a notificação.');
        setFeedback(next);
        if (next.unavailable) {
          await listRef.current.reload();
          void refreshCount();
          titleRef.current?.focus();
        }
      } finally {
        setBusyIds((previous) => {
          const next = new Set(previous);
          next.delete(notification.id);
          return next;
        });
      }
    },
    [refreshCount]
  );

  async function markAll() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setFeedback({});
    try {
      const response = await markAllNotificationsRead();
      setFeedback({ success: markAllMessage(response.updated) });
      await list.reload();
      await refreshCount();
      titleRef.current?.focus();
    } catch (failure) {
      setFeedback(failureFeedback(failure, 'Não foi possível marcar as notificações como lidas.'));
    } finally {
      setMarkingAll(false);
    }
  }

  const open = useCallback(
    (notification, { external = false } = {}) => {
      if (!notification.readAt)
        markNotification(notification.id, true)
          .then((response) => {
            if (external && response?.notification) listRef.current.replace(response.notification);
            return refreshCount();
          })
          .catch(() => {});
      if (!external) onClose({ restoreFocus: false });
    },
    [onClose, refreshCount]
  );

  function changeTab(event) {
    if (!TAB_KEYS.has(event.key)) return;
    event.preventDefault();
    const values = NOTIFICATION_FILTERS.map((filter) => filter.value);
    const index = values.indexOf(list.status);
    const next =
      event.key === 'Home'
        ? values[0]
        : event.key === 'End'
          ? values.at(-1)
          : values[(index + (event.key === 'ArrowRight' ? 1 : values.length - 1)) % values.length];
    list.changeStatus(next);
    panelRef.current?.querySelector(`#notifications-tab-${next}`)?.focus();
  }

  const closeButton = (
    <button
      type="button"
      className="notifications-panel__icon-button"
      aria-label="Fechar notificações"
      onClick={() => onClose()}
    >
      <NotificationIcon name="close" />
    </button>
  );

  return createPortal(
    <div className="notifications-panel-layer" data-sidebar-state={sidebarState}>
      <div className="notifications-panel__backdrop" aria-hidden="true" onClick={() => onClose()} />
      <section
        ref={panelRef}
        className="notifications-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          view === 'preferences' ? 'notifications-preferences-title' : 'notifications-panel-title'
        }
      >
        {view === 'preferences' ? (
          <>
            <header className="notifications-panel__header">
              <button
                type="button"
                className="notifications-panel__icon-button"
                aria-label="Voltar às notificações"
                title="Voltar às notificações"
                onClick={() => showView('list')}
              >
                <NotificationIcon name="back" />
              </button>
              <h2 id="notifications-preferences-title" ref={preferencesTitleRef} tabIndex={-1}>
                Preferências
              </h2>
              {closeButton}
            </header>
            <div className="notifications-panel__body notifications-panel__preferences">
              <p>Escolha quais avisos você quer receber.</p>
              <NotificationPreferencesForm />
            </div>
          </>
        ) : (
          <>
            <header className="notifications-panel__header">
              <h2 id="notifications-panel-title" ref={titleRef} tabIndex={-1}>
                Notificações
              </h2>
              <button
                ref={preferencesButtonRef}
                type="button"
                className="notifications-panel__icon-button"
                aria-label="Preferências de notificação"
                title="Preferências de notificação"
                onClick={() => showView('preferences')}
              >
                <NotificationIcon name="settings" />
              </button>
              {closeButton}
            </header>
            <div
              className="internal-tabs notifications-panel__tabs"
              role="tablist"
              aria-label="Mostrar"
              onKeyDown={changeTab}
            >
              {NOTIFICATION_FILTERS.map((filter) => {
                const selected = list.status === filter.value;
                return (
                  <button
                    key={filter.value}
                    id={`notifications-tab-${filter.value}`}
                    type="button"
                    role="tab"
                    className={`internal-tab${selected ? ' internal-tab--active' : ''}`}
                    aria-selected={selected}
                    aria-controls="notifications-panel-list"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => list.changeStatus(filter.value)}
                  >
                    {filter.label}
                    {filter.value === 'UNREAD' && unreadCount > 0 && (
                      <span className="notifications-panel__count">{unreadCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="notifications-panel__toolbar">
              <label className="notifications-panel__origin">
                <span>Origem</span>
                <SelectControl
                  value={list.group}
                  onChange={(event) => list.changeGroup(event.target.value)}
                >
                  {NOTIFICATION_GROUPS.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.label}
                    </option>
                  ))}
                </SelectControl>
              </label>
              <button
                type="button"
                className="button button-secondary button-compact"
                onClick={markAll}
                aria-disabled={markingAll || unreadCount === 0}
                aria-busy={markingAll || undefined}
              >
                Marcar todas como lidas
              </button>
            </div>
            {(feedback.success || feedback.error || feedback.info || feedback.rateLimit) && (
              <div className="notifications-panel__feedback">
                <FeedbackRegion
                  success={feedback.success}
                  error={feedback.error}
                  info={feedback.info}
                  rateLimit={feedback.rateLimit}
                  retryAfterSeconds={feedback.retryAfterSeconds}
                />
              </div>
            )}
            <div
              id="notifications-panel-list"
              className="notifications-panel__body"
              role="tabpanel"
              aria-labelledby={`notifications-tab-${list.status}`}
            >
              {items.length > 0 && (
                <ul className="notifications-panel__list">
                  {items.map((notification) => (
                    <li key={notification.id}>
                      <NotificationItem
                        notification={notification}
                        busy={busyIds.has(notification.id)}
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
                <div className="notifications-panel__empty">
                  <span className="notifications-panel__empty-icon">
                    <NotificationIcon name="bell" />
                  </span>
                  <EmptyState title={notificationEmptyTitle(list.status, list.group)} />
                  {list.status === 'UNREAD' && (
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      onClick={() => list.changeStatus('ALL')}
                    >
                      Ver todas
                    </button>
                  )}
                </div>
              )}
              {!list.error && list.data?.nextCursor && (
                <div className="notifications-panel__more">
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={list.loading}
                    onClick={list.more}
                  >
                    {loadMoreLabel(remaining)}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>,
    document.body
  );
}
