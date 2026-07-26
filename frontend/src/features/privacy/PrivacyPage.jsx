import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { normalizeApiError, useConfirm } from '../../shared/index.js';
import { useAuth } from '../auth/index.js';
import { privacyApi } from './privacy.api.js';

export function PrivacyPage() {
  const confirm = useConfirm();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: ''
  });
  const [sessions, setSessions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [request, setRequest] = useState(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [sessionList, auditPage, deletion] = await Promise.all([
      privacyApi.sessions(),
      privacyApi.audit(),
      privacyApi.deletionRequest()
    ]);
    setSessions(sessionList);
    setAudit(auditPage.events || []);
    setRequest(deletion);
  }
  useEffect(() => {
    load().catch((value) => setError(normalizeApiError(value).message));
  }, []);
  async function run(operation, success) {
    setError('');
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (value) {
      setError(normalizeApiError(value).message);
    }
  }
  async function submitProfile(event) {
    event.preventDefault();
    await run(async () => {
      await privacyApi.updateProfile(profile);
      await refresh();
      setProfile((value) => ({ ...value, currentPassword: '' }));
    }, 'Perfil atualizado.');
  }
  async function exportData() {
    await run(async () => {
      const record = await privacyApi.requestExport();
      window.location.assign(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/account/personal-data/export/${record.id}/download`
      );
    }, 'Exportação preparada.');
  }
  async function deactivate() {
    if (
      !(await confirm({
        title: 'Desativar conta',
        description: 'Sua sessão será encerrada e sua conta ficará desativada.',
        confirmLabel: 'Desativar'
      }))
    )
      return;
    await run(async () => {
      await privacyApi.deactivate(password);
      navigate('/login');
    }, 'Conta desativada.');
  }

  return (
    <main className="page-container">
      <h1>Privacidade e conta</h1>
      {error && <div className="message message-error">{error}</div>}
      {message && <div className="message message-success">{message}</div>}
      <section>
        <h2>Perfil</h2>
        <form onSubmit={submitProfile}>
          <label>
            Nome
            <input
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
            />
          </label>
          <label>
            Senha atual
            <input
              type="password"
              value={profile.currentPassword}
              onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })}
            />
          </label>
          <button type="submit">Salvar perfil</button>
        </form>
      </section>
      <section>
        <h2>Sessões</h2>
        {sessions.map((session) => (
          <article key={session.id}>
            <span>{session.current ? 'Sessão atual' : `Sessão ${session.id}`}</span>
            <button
              type="button"
              onClick={() => run(() => privacyApi.revokeSession(session.id), 'Sessão revogada.')}
            >
              Revogar
            </button>
          </article>
        ))}
        <button
          type="button"
          onClick={() => run(() => privacyApi.revokeAllSessions(), 'Sessões revogadas.')}
        >
          Revogar todas
        </button>
      </section>
      <section>
        <h2>Portabilidade</h2>
        <button type="button" onClick={exportData}>
          Exportar meus dados
        </button>
      </section>
      <section>
        <h2>Exclusão</h2>
        <label>
          Confirme sua senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {request ? (
          <button
            type="button"
            onClick={() => run(() => privacyApi.cancelDeletion(), 'Solicitação cancelada.')}
          >
            Cancelar solicitação de exclusão
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              run(() => privacyApi.requestDeletion(password), 'Solicitação registrada.')
            }
          >
            Solicitar exclusão
          </button>
        )}
        <button type="button" onClick={deactivate}>
          Desativar conta
        </button>
      </section>
      <section>
        <h2>Atividade da conta</h2>
        {audit.length ? (
          audit.map((event) => (
            <article key={event.id}>
              {event.action} — {new Date(event.occurredAt).toLocaleString('pt-BR')}
            </article>
          ))
        ) : (
          <p>Nenhum evento registrado.</p>
        )}
      </section>
    </main>
  );
}
