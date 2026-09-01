import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ContextualErrorPage,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useCountdown,
  useConfirm
} from '../../shared/index.js';
import { PasswordField, useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';
import { GithubSensitiveReauthentication } from './GithubSensitiveReauthentication.jsx';

export function AccountSettingsPage() {
  const confirm = useConfirm();
  const { refresh } = useAuth();
  const [account, setAccount] = useState(null);
  const [profile, setProfile] = useState({ name: '', username: '' });
  const savedProfile = useRef(profile);
  const [email, setEmail] = useState({ newEmail: '', currentPassword: '' });
  const [deactivationPassword, setDeactivationPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [initialError, setInitialError] = useState(null);
  const [busy, setBusy] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const actionLock = useRef(false);
  const cooldown = useCountdown(retryAfterSeconds);

  const load = useCallback(async () => {
    const result = await settingsApi.account();
    const nextProfile = { name: result.name, username: result.username || '' };
    setAccount(result);
    setProfile(nextProfile);
    savedProfile.current = nextProfile;
  }, []);

  const loadInitial = useCallback(async () => {
    setInitialError(null);
    try {
      await load();
    } catch (value) {
      setInitialError(normalizeApiError(value, 'Não foi possível carregar sua conta.'));
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
    setWarning('');
    setMessage('');
    setRetryAfterSeconds(0);
    try {
      await operation();
      setMessage(success);
      await load();
      await refresh();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  }

  async function saveProfile() {
    if (actionLock.current || cooldown > 0) return;
    const changes = [];
    if (profile.name !== savedProfile.current.name) {
      changes.push({
        operation: () => settingsApi.updateProfile(profile.name),
        success: 'Nome atualizado.',
        failure: 'Não foi possível alterar o nome'
      });
    }
    if (profile.username !== savedProfile.current.username) {
      changes.push({
        operation: () => settingsApi.updateUsername(profile.username),
        success: 'Username atualizado.',
        failure: 'Não foi possível alterar o username'
      });
    }
    if (!changes.length) return;

    actionLock.current = true;
    setBusy('profile');
    setError('');
    setWarning('');
    setMessage('');
    setRetryAfterSeconds(0);
    try {
      const results = await Promise.allSettled(changes.map(({ operation }) => operation()));
      const normalizedResults = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return { status: result.status, message: changes[index].success };
        }
        const normalized = normalizeApiError(result.reason);
        return {
          status: result.status,
          message: `${changes[index].failure}: ${normalized.message}`,
          retryAfterSeconds: normalized.retryAfterSeconds || 0
        };
      });

      const [accountReload, authReload] = await Promise.allSettled([load(), refresh()]);
      if (accountReload.status === 'rejected') {
        const normalized = normalizeApiError(
          accountReload.reason,
          'As alterações terminaram, mas não foi possível recarregar o perfil.'
        );
        setError(normalized.message);
        setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
        return;
      }
      if (authReload.status === 'rejected') {
        setError(
          normalizeApiError(
            authReload.reason,
            'O perfil foi recarregado, mas a sessão não pôde ser atualizada.'
          ).message
        );
        return;
      }

      const successes = normalizedResults.filter((result) => result.status === 'fulfilled');
      const failures = normalizedResults.filter((result) => result.status === 'rejected');
      const failureMessage = failures.map((result) => result.message).join(' ');
      setRetryAfterSeconds(
        failures.reduce((maximum, result) => Math.max(maximum, result.retryAfterSeconds), 0)
      );
      if (!failures.length) {
        setMessage('Alterações salvas.');
      } else if (successes.length) {
        setWarning(`${successes.map((result) => result.message).join(' ')} ${failureMessage}`);
      } else {
        setError(failureMessage);
      }
    } finally {
      actionLock.current = false;
      setBusy('');
    }
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
  if (!account) {
    return (
      <div className="settings-loading">
        <LoadingState message="Carregando conta..." />
      </div>
    );
  }

  const active = account.accountStatus === 'ACTIVE';
  const sensitiveActionReady = account.hasLocalPassword || account.recentlyReauthenticated;
  const profileChanged =
    profile.name !== savedProfile.current.name ||
    profile.username !== savedProfile.current.username;

  return (
    <div className="settings-stack">
      <SettingsFeedback
        error={error}
        warning={warning}
        message={message}
        retryAfterSeconds={cooldown}
      />
      <article className="settings-surface">
        <section className="settings-section" aria-labelledby="settings-profile-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-profile-title">Perfil</h2>
              <p>Dados usados para identificar sua conta no TraceFlow.</p>
            </div>
          </div>
          <form
            className="settings-field-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <div className="form-field">
              <label htmlFor="settings-profile-name">Nome</label>
              <input
                id="settings-profile-name"
                name="name"
                autoComplete="name"
                value={profile.name}
                disabled={!active}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="settings-profile-username">Username</label>
              <input
                id="settings-profile-username"
                name="username"
                autoComplete="username"
                value={profile.username}
                disabled={!active}
                aria-describedby={account.nextUsernameChangeAt ? 'username-change-help' : undefined}
                onChange={(event) => setProfile({ ...profile, username: event.target.value })}
              />
              {account.nextUsernameChangeAt && (
                <small className="settings-field-help" id="username-change-help">
                  Nova alteração disponível em{' '}
                  {new Date(account.nextUsernameChangeAt).toLocaleString('pt-BR')}.
                </small>
              )}
            </div>
            <div className="settings-actions settings-field-full">
              <button
                className="button button-primary"
                disabled={!active || !profileChanged || Boolean(busy) || cooldown > 0}
                aria-busy={busy === 'profile'}
                type="submit"
              >
                {busy === 'profile' ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </section>

        <section className="settings-section" aria-labelledby="settings-email-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-email-title">E-mail</h2>
              <p>Altere o endereço usado pela conta.</p>
            </div>
          </div>
          <div className="settings-section-flow">
            <div className="settings-inline-status">
              <div>
                <h3>{account.email}</h3>
                <p>E-mail atual da conta.</p>
              </div>
            </div>
            {account.pendingEmailChange ? (
              <div className="settings-panel settings-panel-warning" role="status">
                <h3>Alteração pendente</h3>
                <p>Aguardando confirmação de {account.pendingEmailChange.newEmail}.</p>
                <div className="settings-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={Boolean(busy) || cooldown > 0}
                    aria-busy={busy === 'cancel-email'}
                    onClick={() =>
                      void run(
                        'cancel-email',
                        settingsApi.cancelEmailChange,
                        'Alteração cancelada.'
                      )
                    }
                  >
                    Cancelar alteração
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="settings-field-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    'email',
                    () => settingsApi.requestEmailChange(email.newEmail, email.currentPassword),
                    'Enviamos a confirmação para o novo e-mail.'
                  );
                }}
              >
                <div className="form-field">
                  <label htmlFor="settings-new-email">Novo e-mail</label>
                  <input
                    id="settings-new-email"
                    name="newEmail"
                    type="email"
                    autoComplete="email"
                    disabled={!active}
                    value={email.newEmail}
                    onChange={(event) => setEmail({ ...email, newEmail: event.target.value })}
                  />
                </div>
                {account.hasLocalPassword ? (
                  <PasswordField
                    id="emailCurrentPassword"
                    label="Senha atual"
                    autoComplete="current-password"
                    disabled={!active}
                    value={email.currentPassword}
                    onChange={(event) =>
                      setEmail({ ...email, currentPassword: event.target.value })
                    }
                  />
                ) : (
                  <div className="settings-field-full settings-panel settings-panel-info">
                    <h3>Confirme sua identidade</h3>
                    <p>Esta ação exige uma confirmação GitHub recente.</p>
                    <GithubSensitiveReauthentication
                      account={account}
                      returnTo="/settings/account"
                      onError={setError}
                    />
                  </div>
                )}
                <div className="settings-actions settings-field-full">
                  <button
                    className="button button-secondary"
                    disabled={!active || !sensitiveActionReady || Boolean(busy) || cooldown > 0}
                    aria-busy={busy === 'email'}
                    type="submit"
                  >
                    {busy === 'email' ? 'Solicitando...' : 'Solicitar alteração'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <section
          className="settings-section settings-danger-section"
          aria-labelledby="settings-account-management-title"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-account-management-title">Gerenciamento da conta</h2>
              <p>Desativar interrompe o acesso sem remover os dados imediatamente.</p>
            </div>
          </div>
          <div className="settings-section-flow">
            {account.hasLocalPassword ? (
              <div className="settings-form">
                <PasswordField
                  id="deactivationPassword"
                  label="Senha atual"
                  autoComplete="current-password"
                  disabled={!active}
                  value={deactivationPassword}
                  onChange={(event) => setDeactivationPassword(event.target.value)}
                />
              </div>
            ) : (
              <GithubSensitiveReauthentication
                account={account}
                returnTo="/settings/account"
                onError={setError}
              />
            )}
            <div className="settings-actions">
              <button
                className="button button-danger"
                disabled={!active || !sensitiveActionReady || Boolean(busy) || cooldown > 0}
                aria-busy={busy === 'deactivate'}
                type="button"
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: 'Desativar conta',
                      description:
                        'Você perderá acesso às áreas operacionais até confirmar a reativação.',
                      confirmLabel: 'Desativar'
                    }))
                  )
                    return;
                  await run(
                    'deactivate',
                    () => settingsApi.deactivate(deactivationPassword),
                    'Conta desativada.'
                  );
                }}
              >
                Desativar conta
              </button>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
