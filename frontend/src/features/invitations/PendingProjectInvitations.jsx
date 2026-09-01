import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { FeedbackRegion, normalizeApiError, useCountdown } from '../../shared/index.js';
import { personalInvitationsApi } from './personal-invitations.api.js';
import './PendingProjectInvitations.css';

const roleLabels = Object.freeze({
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador'
});

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

export function PendingProjectInvitations({ onAccepted, onStateChange }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [acceptedProject, setAcceptedProject] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const actionLock = useRef(false);

  useEffect(() => {
    let active = true;
    void personalInvitationsApi
      .list()
      .then((items) => {
        if (active) setInvitations(items || []);
      })
      .catch((requestError) => {
        if (active) {
          const normalized = normalizeApiError(
            requestError,
            'Não foi possível carregar seus convites.'
          );
          setError(normalized.message);
          setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    onStateChange?.({ count: invitations.length, loading });
  }, [invitations.length, loading, onStateChange]);

  async function respond(invitation, action) {
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy(invitation.id);
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);
    try {
      if (action === 'accept') {
        await personalInvitationsApi.accept(invitation.id);
        setAcceptedProject(invitation.project);
        setSuccess(`Você agora participa do projeto “${invitation.project.name}”.`);
        await onAccepted?.();
      } else {
        await personalInvitationsApi.decline(invitation.id);
        setSuccess('Convite recusado.');
      }
      setInvitations((current) => current.filter(({ id }) => id !== invitation.id));
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível responder ao convite.');
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }

  return (
    <>
      {(error || success || acceptedProject) && (
        <div className="projects-grid__feedback">
          <FeedbackRegion
            error={cooldown ? undefined : error}
            rateLimit={cooldown ? error : undefined}
            retryAfterSeconds={retryAfterSeconds}
            success={success}
          />
          {acceptedProject && (
            <Link
              className="button button-secondary link-button invitation-open-project"
              to={`/projects/${acceptedProject.id}`}
            >
              Abrir projeto
            </Link>
          )}
        </div>
      )}

      {loading && (
        <article className="invitation-card invitation-card--loading" aria-busy="true">
          <span className="invitation-card__label">Convites</span>
          <p>Carregando convites...</p>
        </article>
      )}

      {!loading &&
        invitations.map((invitation) => (
          <article className="invitation-card" key={invitation.id}>
            <span className="invitation-card__label">Convite</span>
            <div className="invitation-card__copy">
              <h3>{invitation.project.name}</h3>
              <p>Você foi convidado para participar deste projeto.</p>
            </div>
            <div className="invitation-card__metadata">
              <span>
                Papel: <strong>{roleLabels[invitation.role] || invitation.role}</strong>
              </span>
              <span>Expira em {formatDate(invitation.expiresAt)}</span>
            </div>
            <div className="invitation-card__actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={busy !== null || cooldown > 0}
                aria-busy={busy === invitation.id}
                onClick={() => void respond(invitation, 'decline')}
              >
                {cooldown > 0 ? `Recusar em ${cooldown}s` : 'Recusar'}
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={busy !== null || cooldown > 0}
                aria-busy={busy === invitation.id}
                onClick={() => void respond(invitation, 'accept')}
              >
                {cooldown > 0 ? `Aceitar em ${cooldown}s` : 'Aceitar'}
              </button>
            </div>
          </article>
        ))}
    </>
  );
}
