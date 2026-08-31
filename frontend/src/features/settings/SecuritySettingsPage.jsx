import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { authApi, githubOAuthErrorMessage, PasswordField, useAuth } from '../auth/index.js';
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
import './SecuritySettingsPage.css';

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
  const searchParams = new URLSearchParams(location.search);
  const githubError =
    searchParams.get('github') === 'error'
      ? githubOAuthErrorMessage(searchParams.get('reason'))
      : '';
  const [message, setMessage] = useState(
    !githubError && searchParams.get('githubReauth') === 'success'
      ? 'Identidade confirmada. Agora crie sua senha.'
      : ''
  );
  const [error, setError] = useState(githubError);
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
    setMessage('');
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
      queueMicrotask(() => document.getElementById('initialPasswordConfirmation')?.focus());
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
      queueMicrotask(() => document.getElementById('passwordConfirmation')?.focus());
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

  const orderedSessions = [...sessions].sort(
    (left, right) => Number(right.current) - Number(left.current)
  );
  const otherSessionCount = sessions.filter((session) => !session.current).length;
  const policyContext = account ? { username: account.username, email: account.email } : undefined;

  return (
    <div className="settings-stack">
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      {!account ? (
        <div className="settings-loading">
          <LoadingState message="Carregando segurança..." />
        </div>
      ) : (
        <article className="settings-surface security-settings-surface">
          <section className="settings-section" aria-labelledby="settings-password-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="settings-password-title">Senha</h2>
                <p>
                  {account.hasLocalPassword
                    ? 'Atualize a senha usada no login local.'
                    : 'Crie uma senha local para sua conta.'}
                </p>
              </div>
            </div>
            {account.hasLocalPassword === false && !account.canInitializePassword ? (
              <div className="settings-panel settings-panel-info">
                <h3>Confirme sua identidade</h3>
                <p>Confirme novamente com GitHub para criar uma senha local.</p>
                <div className="settings-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={reauthenticating}
                    aria-busy={reauthenticating}
                    onClick={() => void reauthenticate()}
                  >
                    {reauthenticating
                      ? 'Conectando ao GitHub...'
                      : 'Confirmar identidade com GitHub'}
                  </button>
                </div>
              </div>
            ) : account.hasLocalPassword === false ? (
              <form
                className="settings-field-grid"
                onSubmit={(event) => void initializePassword(event)}
              >
                <PasswordField
                  id="initialPassword"
                  label="Nova senha"
                  value={initialPassword.newPassword}
                  onChange={(event) => updateInitialPassword('newPassword', event.target.value)}
                  error={passwordErrors.newPassword}
                  minLength={12}
                  showRequirements
                  policyContext={policyContext}
                />
                <PasswordField
                  id="initialPasswordConfirmation"
                  label="Confirmar nova senha"
                  value={initialPassword.confirmation}
                  onChange={(event) => updateInitialPassword('confirmation', event.target.value)}
                  error={passwordErrors.confirmation}
                  minLength={12}
                  showConfirmationStatus
                  confirmationValue={initialPassword.newPassword}
                />
                <div className="settings-actions settings-field-full">
                  <button
                    className="button button-primary"
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
                </div>
              </form>
            ) : (
              <form
                className="settings-field-grid"
                onSubmit={(event) => void changePassword(event)}
              >
                <div className="settings-field-full settings-form">
                  <PasswordField
                    id="currentPassword"
                    label="Senha atual"
                    autoComplete="current-password"
                    value={password.currentPassword}
                    onChange={(event) => updatePassword('currentPassword', event.target.value)}
                    error={passwordErrors.currentPassword}
                  />
                </div>
                <PasswordField
                  id="newPassword"
                  label="Nova senha"
                  value={password.newPassword}
                  onChange={(event) => updatePassword('newPassword', event.target.value)}
                  error={passwordErrors.newPassword}
                  minLength={12}
                  showRequirements
                  policyContext={policyContext}
                />
                <PasswordField
                  id="passwordConfirmation"
                  label="Confirmar nova senha"
                  value={password.confirmation}
                  onChange={(event) => updatePassword('confirmation', event.target.value)}
                  error={passwordErrors.confirmation}
                  minLength={12}
                  showConfirmationStatus
                  confirmationValue={password.newPassword}
                />
                <div className="settings-actions settings-field-full">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={Boolean(busy) || cooldown > 0}
                    aria-busy={busy === 'change-password'}
                  >
                    {busy === 'change-password' ? 'Alterando senha...' : 'Alterar senha'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="settings-section" aria-labelledby="settings-sessions-title">
            <div className="settings-section-heading">
              <div>
                <h2 id="settings-sessions-title">Sessões</h2>
                <p>Revise e encerre sessões ativas da sua conta.</p>
              </div>
            </div>
            <div className="settings-block-stack">
              {orderedSessions.length ? (
                <div className="session-list">
                  {orderedSessions.map((session) => (
                    <article className="session-row" key={session.sessionId}>
                      <div className="session-copy">
                        <div className="session-title">
                          <strong>{session.current ? 'Este dispositivo' : 'Outra sessão'}</strong>
                          {session.current && (
                            <span className="settings-status-badge settings-status-success">
                              Sessão atual
                            </span>
                          )}
                        </div>
                        <small>
                          Última atividade: {new Date(session.lastSeenAt).toLocaleString('pt-BR')}
                        </small>
                      </div>
                      <button
                        className="button button-danger"
                        type="button"
                        disabled={Boolean(busy) || cooldown > 0}
                        aria-busy={busy === `revoke-session-${session.sessionId}`}
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
                  ))}
                </div>
              ) : (
                <div className="settings-panel">
                  <h3>Nenhuma sessão ativa</h3>
                  <p>Não foi possível identificar uma sessão ativa.</p>
                </div>
              )}
              {orderedSessions.length > 0 && otherSessionCount === 0 && (
                <div className="settings-panel session-secondary-empty">
                  <h3>Nenhuma outra sessão ativa</h3>
                  <p>Somente a sessão atual está conectada.</p>
                </div>
              )}
              {otherSessionCount > 0 && (
                <div className="settings-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={Boolean(busy) || cooldown > 0}
                    aria-busy={busy === 'revoke-other-sessions'}
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
                </div>
              )}
            </div>
          </section>
        </article>
      )}
    </div>
  );
}
