import { useEffect, useState } from 'react';
import { normalizeApiError, useConfirm } from '../../shared/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';

export function SecuritySettingsPage() {
  const confirm = useConfirm();
  const [sessions, setSessions] = useState([]);
  const [password, setPassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmation: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    setSessions(await settingsApi.sessions());
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
  return (
    <>
      <SettingsFeedback error={error} message={message} />
      <section className="settings-card">
        <h2>Alterar senha</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => settingsApi.changePassword(password),
              'Senha alterada; as outras sessões foram encerradas.'
            );
          }}
        >
          <label>
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={password.currentPassword}
              onChange={(event) =>
                setPassword({ ...password, currentPassword: event.target.value })
              }
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={password.newPassword}
              onChange={(event) => setPassword({ ...password, newPassword: event.target.value })}
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={password.confirmation}
              onChange={(event) => setPassword({ ...password, confirmation: event.target.value })}
            />
          </label>
          <button type="submit">Alterar senha</button>
        </form>
      </section>
      <section className="settings-card">
        <h2>Sessões ativas</h2>
        {sessions.length ? (
          sessions.map((session) => (
            <article className="session-row" key={session.sessionId}>
              <div>
                <strong>{session.current ? 'Este dispositivo' : 'Outra sessão'}</strong>
                <small>
                  Última atividade: {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                </small>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: 'Revogar sessão',
                      description: session.current
                        ? 'Você precisará entrar novamente.'
                        : 'Esse dispositivo perderá o acesso.',
                      confirmLabel: 'Revogar'
                    }))
                  )
                    return;
                  await run(() => settingsApi.revokeSession(session.sessionId), 'Sessão revogada.');
                }}
              >
                Revogar
              </button>
            </article>
          ))
        ) : (
          <p>Nenhuma sessão ativa.</p>
        )}
        <button
          type="button"
          onClick={() => void run(settingsApi.revokeOtherSessions, 'Outras sessões revogadas.')}
        >
          Encerrar outras sessões
        </button>
      </section>
    </>
  );
}
