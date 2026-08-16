import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Card, FeedbackRegion, normalizeApiError } from '../../shared/index.js';
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

  useEffect(() => {
    let active = true;
    void personalInvitationsApi
      .list()
      .then((items) => {
        if (active) setInvitations(items || []);
      })
      .catch((requestError) => {
        if (active)
          setError(
            normalizeApiError(requestError, 'Não foi possível carregar seus convites.').message
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function respond(invitation, action) {
    setBusy(invitation.id);
    setError('');
    setSuccess('');
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
      setError(normalizeApiError(requestError, 'Não foi possível responder ao convite.').message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Meus convites pendentes">
      <FeedbackRegion error={error} success={success} />
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
                  disabled={busy !== null}
                  onClick={() => void respond(invitation, 'accept')}
                >
                  Aceitar
                </button>
                <button
                  className="button button-secondary button-compact"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void respond(invitation, 'decline')}
                >
                  Recusar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
