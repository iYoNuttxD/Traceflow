import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { projectMembersApi } from '../features/members/index.js';
import { parseProjectAccessInput } from '../features/projects/services/project-access-input.js';
import { Card, FeedbackRegion, LoadingState, normalizeApiError } from '../shared/index.js';

const roleLabels = Object.freeze({ MEMBER: 'Membro', VIEWER: 'Visualizador' });

export function JoinProjectPage() {
  const navigate = useNavigate();
  const { accessCode: routeAccessCode } = useParams();
  const [input, setInput] = useState(routeAccessCode || '');
  const [details, setDetails] = useState(null);
  const [joinedProject, setJoinedProject] = useState(null);
  const [loading, setLoading] = useState(Boolean(routeAccessCode));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    void projectMembersApi
      .joinDetails(accessCode)
      .then((responseDetails) => {
        if (active) setDetails(responseDetails);
      })
      .catch((requestError) => {
        if (active)
          setError(normalizeApiError(requestError, 'Não foi possível consultar o código.').message);
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
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await projectMembersApi.joinProject({ accessCode: input });
      setJoinedProject(response.data.project);
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(normalizeApiError(requestError, 'Não foi possível entrar no projeto.').message);
    } finally {
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

      <FeedbackRegion error={error} success={success} />

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
            disabled={submitting}
            onClick={() => void joinProject()}
          >
            {submitting ? 'Entrando...' : 'Entrar no projeto'}
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
