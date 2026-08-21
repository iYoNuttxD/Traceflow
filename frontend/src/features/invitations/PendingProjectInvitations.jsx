import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Card, FeedbackRegion, normalizeApiError, useCountdown } from '../../shared/index.js';
import { personalInvitationsApi } from './personal-invitations.api.js';

const roleLabels = Object.freeze({
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador'
});

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

export function PendingProjectInvitations({ onAccepted }) {
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
    <Card
      className="projects-dashboard-card personal-invitations-card"
      title="Meus convites pendentes"
    >
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
      {loading ? (
        <p className="empty-state">Carregando convites...</p>
      ) : invitations.length === 0 ? (
        <p className="empty-state">Nenhum convite pendente.</p>
      ) : (
        <div className="personal-invitation-list">
          {invitations.map((invitation) => (
            <article className="personal-invitation-item" key={invitation.id}>
              <div>
                <strong>{invitation.project.name}</strong>
                <span>Perfil: {roleLabels[invitation.role] || invitation.role}</span>
                <span>Expira em: {formatDate(invitation.expiresAt)}</span>
              </div>
              <div className="personal-invitation-actions">
                <button
                  className="button button-primary button-compact"
                  type="button"
                  disabled={busy !== null || cooldown > 0}
                  aria-busy={busy === invitation.id}
                  onClick={() => void respond(invitation, 'accept')}
                >
                  {cooldown > 0 ? `Aceitar em ${cooldown}s` : 'Aceitar'}
                </button>
                <button
                  className="button button-secondary button-compact"
                  type="button"
                  disabled={busy !== null || cooldown > 0}
                  aria-busy={busy === invitation.id}
                  onClick={() => void respond(invitation, 'decline')}
                >
                  {cooldown > 0 ? `Recusar em ${cooldown}s` : 'Recusar'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
