import { memo } from 'react';
import { Link } from 'react-router';
import {
  formatInstant,
  notificationCardLabel,
  notificationIconName,
  notificationSentence,
  notificationState,
  notificationTone,
  orphanGithubUrl,
  readToggleLabel
} from '../model/notification-view.js';
import { NotificationIcon } from './NotificationIcon.jsx';

export const NotificationItem = memo(function NotificationItem({
  notification,
  busy,
  onToggleRead,
  onOpen
}) {
  const unread = !notification.readAt;
  const state = notificationState(notification);
  const githubUrl = orphanGithubUrl(notification);
  const content = (
    <>
      <span className="notification-item__sentence">
        {unread && (
          <>
            <span className="notification-item__dot" aria-hidden="true" />
            <span className="notification-item__hidden">Não lida: </span>
          </>
        )}
        {notificationSentence(notification)}
      </span>
      <span className="notification-item__meta">
        {notification.project?.name} ·{' '}
        <time dateTime={notification.createdAt}>{formatInstant(notification.createdAt)}</time>
        {state && ` · ${state}`}
        {!notification.link && ' · Tarefa excluída'}
        {githubUrl && ' · abre no GitHub em nova aba'}
      </span>
    </>
  );

  return (
    <article
      className="notification-item"
      data-unread={unread || undefined}
      aria-label={notificationCardLabel(notification)}
    >
      <span
        className={`notification-item__icon notification-item__icon--${notificationTone(notification)}`}
      >
        <NotificationIcon name={notificationIconName(notification)} />
      </span>
      {notification.link ? (
        <Link
          className="notification-item__main"
          to={notification.link}
          onClick={() => onOpen(notification)}
        >
          {content}
        </Link>
      ) : githubUrl ? (
        <a
          className="notification-item__main"
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onOpen(notification, { external: true })}
        >
          {content}
        </a>
      ) : (
        <div className="notification-item__main">{content}</div>
      )}
      <button
        type="button"
        className="notification-item__toggle"
        onClick={() => onToggleRead(notification)}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        aria-label={readToggleLabel(notification)}
        title={unread ? 'Marcar como lida' : 'Marcar como não lida'}
      >
        <NotificationIcon name={unread ? 'check' : 'dot'} />
      </button>
    </article>
  );
});
