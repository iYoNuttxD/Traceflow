import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { membersApi } from '../features/members/index.js';
import { useProjectsCatalog } from '../features/projects/index.js';
import { parseProjectAccessInput } from '../features/projects/services/project-access-input.js';
import {
  Card,
  FeedbackRegion,
  LoadingState,
  normalizeApiError,
  useCountdown
} from '../shared/index.js';
import '../shared/styles/form-layouts.css';
import './JoinProjectPage.css';

const roleLabels = Object.freeze({ MEMBER: 'Membro', VIEWER: 'Visualizador' });

export function JoinProjectPage() {
  const navigate = useNavigate();
  const { refreshProjects } = useProjectsCatalog();
  const { accessCode: routeAccessCode } = useParams();
  const [input, setInput] = useState(routeAccessCode || '');
  const [details, setDetails] = useState(null);
  const [joinedProject, setJoinedProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeAccessCode));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const submitLock = useRef(false);

  useEffect(() => {
    if (!routeAccessCode) {
      setDetails(null);
      setLoading(false);
      return undefined;
    }
    const accessCode = parseProjectAccessInput(routeAccessCode);
    if (!accessCode) {
      setError('Código de acesso inválido.');
      setDetails(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setInput(accessCode);
    setLoading(true);
    setError('');
    void membersApi
      .joinDetails(accessCode)
      .then((responseDetails) => {
        if (active) setDetails(responseDetails);
      })
      .catch((requestError) => {
        if (active) {
          const normalized = normalizeApiError(
            requestError,
            'Não foi possível consultar o código.'
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
  }, [routeAccessCode]);

  function continueToDetails(event) {
    event.preventDefault();
    const accessCode = parseProjectAccessInput(input);
    if (!accessCode) {
      setError('Informe um código ou link de acesso válido do TRACEFLOW.');
      return;
    }
    navigate(`/join/${encodeURIComponent(accessCode)}`);
  }

  async function joinProject() {
    if (submitLock.current || cooldown > 0) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);
    try {
      const response = await membersApi.joinProject({ accessCode: input });
      setJoinedProject(response.project);
      setSuccess(response.message);
      void refreshProjects();
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível entrar no projeto.');
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="page-container join-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">TRACEFLOW</span>
          <h1>Entrar no projeto</h1>
          <p>Confirme o projeto e o perfil antes de ingressar.</p>
        </div>
      </header>

      <FeedbackRegion
        error={cooldown ? undefined : error}
        rateLimit={cooldown ? error : undefined}
        retryAfterSeconds={retryAfterSeconds}
        success={success}
      />

      {!routeAccessCode && (
        <Card title="Código de acesso">
          <form className="member-form join-form" onSubmit={continueToDetails}>
            <label className="field">
              <span>Código ou link de acesso</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="TRC-... ou https://.../join/TRC-..."
              />
            </label>
            <button className="button button-primary" type="submit">
              Continuar
            </button>
          </form>
        </Card>
      )}

      {loading && <LoadingState message="Consultando código de acesso..." />}

      {details && !joinedProject && (
        <Card title="Confirmar entrada">
          <dl className="join-details">
            <div>
              <dt>Projeto</dt>
              <dd>{details.project.name}</dd>
            </div>
            <div>
              <dt>Seu perfil ao entrar</dt>
              <dd>{roleLabels[details.role] || details.role}</dd>
            </div>
          </dl>
          <button
            className="button button-primary"
            type="button"
            disabled={submitting || cooldown > 0}
            aria-busy={submitting}
            onClick={() => void joinProject()}
          >
            {submitting
              ? 'Entrando...'
              : cooldown > 0
                ? `Entrar em ${cooldown}s`
                : 'Entrar no projeto'}
          </button>
        </Card>
      )}

      {joinedProject && (
        <Link
          className="button button-secondary link-button join-project-link"
          to={`/projects/${joinedProject.id}`}
        >
          Abrir projeto
        </Link>
      )}
    </main>
  );
}
