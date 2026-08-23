import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { authApi, PasswordField, useAuth } from '../auth/index.js';
import {
  ContextualErrorPage,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useCountdown,
  useConfirm
} from '../../shared/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';

export function SecuritySettingsPage() {
  const confirm = useConfirm();
  const location = useLocation();
  const { refresh } = useAuth();
  const [account, setAccount] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [password, setPassword] = useState({
    currentPassword: '',
    newPassword: '',
    confirmation: ''
  });
  const [initialPassword, setInitialPassword] = useState({ newPassword: '', confirmation: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [reauthenticating, setReauthenticating] = useState(false);
  const [message, setMessage] = useState(
    new URLSearchParams(location.search).get('githubReauth') === 'success'
      ? 'Identidade confirmada. Agora crie sua senha.'
      : ''
  );
  const [error, setError] = useState('');
  const [initialError, setInitialError] = useState(null);
  const [busy, setBusy] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const actionLock = useRef(false);
  const cooldown = useCountdown(retryAfterSeconds);

  const load = useCallback(async () => {
    const [nextAccount, nextSessions] = await Promise.all([
      settingsApi.account(),
      settingsApi.sessions()
    ]);
    setAccount(nextAccount);
    setSessions(nextSessions);
  }, []);

  const loadInitial = useCallback(async () => {
    setInitialError(null);
    try {
      await load();
    } catch (value) {
      setInitialError(normalizeApiError(value, 'Não foi possível carregar sua segurança.'));
    }
  }, [load]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function run(key, operation, success) {
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy(key);
    setError('');
    setRetryAfterSeconds(0);
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      const fieldErrors = normalized.fieldErrors || {};
      setPasswordErrors(fieldErrors);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      const firstInvalidField = Object.keys(fieldErrors)[0];
      if (firstInvalidField)
        queueMicrotask(() => document.getElementById(firstInvalidField)?.focus());
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  }

  async function reauthenticate() {
    if (reauthenticating) return;
    setError('');
    setReauthenticating(true);
    try {
      const result = await authApi.startGithubSensitiveReauthentication('/settings/security');
      window.location.assign(result.url);
    } catch (value) {
      setError(normalizeApiError(value).message);
      setReauthenticating(false);
    }
  }

  async function initializePassword(event) {
    event.preventDefault();
    if (initialPassword.newPassword !== initialPassword.confirmation) {
      setError('');
      setPasswordErrors({ confirmation: 'As senhas não coincidem.' });
      return;
    }
    await run(
      'initialize-password',
      async () => {
        await settingsApi.initializePassword(initialPassword);
        setInitialPassword({ newPassword: '', confirmation: '' });
        setPasswordErrors({});
        await refresh();
      },
      'Senha criada. Você também pode entrar com e-mail ou nome de usuário.'
    );
  }

  async function changePassword(event) {
    event.preventDefault();
    if (password.newPassword !== password.confirmation) {
      setError('');
      setPasswordErrors({ confirmation: 'As senhas não coincidem.' });
      return;
    }
    await run(
      'change-password',
      async () => {
        await settingsApi.changePassword(password);
        setPassword({ currentPassword: '', newPassword: '', confirmation: '' });
        setPasswordErrors({});
      },
      'Senha alterada com sucesso. As outras sessões foram encerradas.'
    );
  }

  function updateInitialPassword(field, value) {
    setInitialPassword((current) => ({ ...current, [field]: value }));
    setPasswordErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  function updatePassword(field, value) {
    setPassword((current) => ({ ...current, [field]: value }));
    setPasswordErrors((current) => ({ ...current, [field]: undefined }));
    setError('');
  }

  if (!account && initialError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(initialError)}
        onRetry={loadInitial}
        requestId={getErrorRequestId(initialError)}
        retryAfterSeconds={initialError.retryAfterSeconds}
        embedded
      />
    );
  }

  return (
    <>
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      <section className="settings-card">
        {!account ? (
          <LoadingState message="Carregando segurança..." />
        ) : account.hasLocalPassword === false ? (
          <>
            <h2>Criar senha de acesso</h2>
            <p>
              Sua conta utiliza atualmente o GitHub para autenticação. Cadastre uma senha para
              também entrar usando seu e-mail ou nome de usuário.
            </p>
            {account.canInitializePassword ? (
              <form onSubmit={(event) => void initializePassword(event)}>
                <PasswordField
                  id="initialPassword"
                  label="Nova senha"
                  value={initialPassword.newPassword}
                  onChange={(event) => updateInitialPassword('newPassword', event.target.value)}
                  error={passwordErrors.newPassword}
                  minLength={12}
                  showRequirements
                />
                <PasswordField
                  id="initialPasswordConfirmation"
                  label="Confirmar nova senha"
                  value={initialPassword.confirmation}
                  onChange={(event) => updateInitialPassword('confirmation', event.target.value)}
                  error={passwordErrors.confirmation}
                  minLength={12}
                />
                <button
                  type="submit"
                  disabled={
                    !initialPassword.newPassword ||
                    !initialPassword.confirmation ||
                    Boolean(busy) ||
                    cooldown > 0
                  }
                  aria-busy={busy === 'initialize-password'}
                >
                  {busy === 'initialize-password' ? 'Criando senha...' : 'Criar senha'}
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled={reauthenticating}
                aria-busy={reauthenticating}
                onClick={() => void reauthenticate()}
              >
                {reauthenticating ? 'Conectando ao GitHub...' : 'Confirmar identidade com GitHub'}
              </button>
            )}
          </>
        ) : (
          <>
            <h2>Alterar senha</h2>
            <form onSubmit={(event) => void changePassword(event)}>
              <PasswordField
                id="currentPassword"
                label="Senha atual"
                autoComplete="current-password"
                value={password.currentPassword}
                onChange={(event) => updatePassword('currentPassword', event.target.value)}
                error={passwordErrors.currentPassword}
              />
              <PasswordField
                id="newPassword"
                label="Nova senha"
                value={password.newPassword}
                onChange={(event) => updatePassword('newPassword', event.target.value)}
                error={passwordErrors.newPassword}
                showRequirements
              />
              <PasswordField
                id="passwordConfirmation"
                label="Confirmar nova senha"
                value={password.confirmation}
                onChange={(event) => updatePassword('confirmation', event.target.value)}
                error={passwordErrors.confirmation}
              />
              <button
                type="submit"
                disabled={Boolean(busy) || cooldown > 0}
                aria-busy={busy === 'change-password'}
              >
                {busy === 'change-password' ? 'Alterando senha...' : 'Alterar senha'}
              </button>
            </form>
          </>
        )}
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
                disabled={Boolean(busy) || cooldown > 0}
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
                  await run(
                    `revoke-session-${session.sessionId}`,
                    () => settingsApi.revokeSession(session.sessionId),
                    'Sessão revogada.'
                  );
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
          disabled={Boolean(busy) || cooldown > 0}
          onClick={() =>
            void run(
              'revoke-other-sessions',
              settingsApi.revokeOtherSessions,
              'Outras sessões revogadas.'
            )
          }
        >
          Encerrar outras sessões
        </button>
      </section>
    </>
  );
}
