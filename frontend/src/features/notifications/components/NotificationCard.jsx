import { memo } from 'react';
import { Link } from 'react-router';
import { GithubExternalAction } from '../../../shared/index.js';
import {
  formatInstant,
  githubLinkLabel,
  isInconsistency,
  notificationCardLabel,
  notificationContextText,
  notificationSubject,
  notificationTypeLabel,
  readToggleLabel
} from '../model/notification-view.js';
import './NotificationCard.css';

export const NotificationCard = memo(function NotificationCard({
  notification,
  busy,
  onToggleRead,
  onOpen
}) {
  const unread = !notification.readAt;
  const { project } = notification;
  const subject = notificationSubject(notification);
  const inconsistency = isInconsistency(notification);
  const artifact = notification.context?.artifact;
  const typeLabel = notificationTypeLabel(notification.type);
  const readAction = unread ? 'Marcar como lida' : 'Marcar como não lida';

  return (
    <article
      className="notification-card"
      data-unread={unread || undefined}
      aria-label={notificationCardLabel(notification)}
    >
      <div className="notification-card__badges">
        <span className="notification-pill notification-pill--type">{typeLabel}</span>
        {unread && <span className="notification-pill notification-pill--unread">Não lida</span>}
      </div>
      <h3 className="notification-card__subject">
        {subject.code && <span className="notification-card__code">{subject.code}</span>}
        <span className="notification-card__title">{subject.title}</span>
      </h3>
      <p className="notification-card__context">{notificationContextText(notification)}</p>
      {!inconsistency && artifact?.title && (
        <p className="notification-card__artifact">{artifact.title}</p>
      )}
      <p className="notification-card__meta">
        Projeto {project.name} · Recebida em {formatInstant(notification.createdAt)}
      </p>
      <div className="notification-card__actions">
        {notification.link ? (
          <Link
            className="button button-secondary button-compact link-button"
            to={notification.link}
            aria-label={
              inconsistency
                ? `Ver no Repositório: ${subject.code ? `${subject.code} ` : ''}${subject.title}`
                : `Abrir tarefa ${subject.code}`
            }
            onClick={() => onOpen(notification)}
          >
            {inconsistency ? 'Ver no Repositório' : 'Abrir tarefa'}
          </Link>
        ) : (
          <span className="notification-card__unavailable">Tarefa excluída</span>
        )}
        {artifact?.url && (
          <GithubExternalAction href={artifact.url} ariaLabel={githubLinkLabel(notification)} />
        )}
        <button
          type="button"
          className="button button-secondary button-compact"
          onClick={() => onToggleRead(notification)}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          aria-label={readToggleLabel(notification)}
        >
          {readAction}
        </button>
      </div>
    </article>
  );
});
