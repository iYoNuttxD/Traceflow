import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { membersApi } from '../features/members/members.api.js';
import { useProjectsCatalog } from '../features/projects/index.js';
import { Card, FeedbackRegion, normalizeApiError, useCountdown } from '../shared/index.js';
import './AcceptInvitationPage.css';

const roleLabels = Object.freeze({
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador'
});
const stateMessages = Object.freeze({
  ACCEPTED: 'Este convite já foi aceito.',
  DECLINED: 'Este convite foi recusado.',
  REVOKED: 'Este convite foi revogado pelo projeto.',
  EXPIRED: 'Este convite expirou.'
});

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(value)
  );
}

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProjects } = useProjectsCatalog();
  const token = params.get('token') || '';
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const actionLock = useRef(false);

  function showError(cause) {
    const normalized = normalizeApiError(cause);
    setError(normalized.message);
    setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
  }

  useEffect(() => {
    if (!token) {
      setError('O link do convite está incompleto. Solicite um novo convite ao projeto.');
      setLoading(false);
      return;
    }
    membersApi
      .invitationDetails(token)
      .then(setInvitation)
      .catch(showError)
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy('accept');
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);
    try {
      const data = await membersApi.acceptInvitation(token);
      void refreshProjects();
      navigate(`/projects/${data.membership.projectId}`, { replace: true });
    } catch (cause) {
      showError(cause);
      setBusy('');
      actionLock.current = false;
    }
  }

  async function decline() {
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy('decline');
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);
    try {
      await membersApi.declineInvitation(token);
      setInvitation((current) => (current ? { ...current, status: 'DECLINED' } : current));
      setSuccess('Convite recusado. Nenhuma associação foi criada.');
    } catch (cause) {
      showError(cause);
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  }

  const pending = invitation?.status === 'PENDING';

  return (
    <main className="page invitation-response-page">
      <Card>
        <div className="invitation-response-content">
          <span className="eyebrow">Convite para projeto</span>
          <h1>Participar de um projeto</h1>
          {loading ? (
            <p>Carregando os dados do convite...</p>
          ) : invitation ? (
            <>
              <p>
                Você foi convidado para <strong>{invitation.project.name}</strong> com o perfil de{' '}
                <strong>{roleLabels[invitation.role] || invitation.role}</strong>.
              </p>
              <small>Válido até {formatDateTime(invitation.expiresAt)}.</small>
              {!pending && <p className="invitation-state">{stateMessages[invitation.status]}</p>}
            </>
          ) : (
            <p>Não foi possível carregar os dados deste convite.</p>
          )}

          <FeedbackRegion
            error={cooldown ? undefined : error}
            rateLimit={cooldown ? error : undefined}
            retryAfterSeconds={retryAfterSeconds}
            success={success}
          />

          <div className="form-actions invitation-response-actions">
            {pending && (
              <>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={Boolean(busy) || cooldown > 0}
                  aria-busy={busy === 'accept'}
                  onClick={() => void accept()}
                >
                  {busy === 'accept'
                    ? 'Aceitando...'
                    : cooldown > 0
                      ? `Aceitar em ${cooldown}s`
                      : 'Aceitar convite'}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={Boolean(busy) || cooldown > 0}
                  aria-busy={busy === 'decline'}
                  onClick={() => void decline()}
                >
                  {busy === 'decline'
                    ? 'Recusando...'
                    : cooldown > 0
                      ? `Recusar em ${cooldown}s`
                      : 'Recusar convite'}
                </button>
              </>
            )}
            <Link className="button button-outline link-button" to="/projects">
              Ir para projetos
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
