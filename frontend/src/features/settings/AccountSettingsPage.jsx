import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ContextualErrorPage,
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
  const [email, setEmail] = useState({ newEmail: '', currentPassword: '' });
  const [deactivationPassword, setDeactivationPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [initialError, setInitialError] = useState(null);
  const [busy, setBusy] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const actionLock = useRef(false);
  const cooldown = useCountdown(retryAfterSeconds);

  const load = useCallback(async () => {
    const result = await settingsApi.account();
    setAccount(result);
    setProfile({ name: result.name, username: result.username || '' });
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
  if (!account) return <p>Carregando conta...</p>;
  const active = account.accountStatus === 'ACTIVE';
  const sensitiveActionReady = account.hasLocalPassword || account.recentlyReauthenticated;
  return (
    <>
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      {!account.hasLocalPassword && (
        <section className="settings-card">
          <h2>Confirmação para ações sensíveis</h2>
          <p>
            Esta conta usa GitHub para autenticação. Confirme a identidade no GitHub antes de
            alterar o e-mail, desativar ou excluir a conta.
          </p>
          <GithubSensitiveReauthentication
            account={account}
            returnTo="/settings/account"
            onError={setError}
          />
        </section>
      )}
      <section className="settings-card">
        <h2>Perfil</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run('profile', () => settingsApi.updateProfile(profile.name), 'Nome atualizado.');
          }}
        >
          <label>
            Nome
            <input
              value={profile.name}
              disabled={!active}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            />
          </label>
          <button
            disabled={!active || Boolean(busy) || cooldown > 0}
            aria-busy={busy === 'profile'}
            type="submit"
          >
            {busy === 'profile' ? 'Salvando nome...' : 'Salvar nome'}
          </button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              'username',
              () => settingsApi.updateUsername(profile.username),
              'Username atualizado.'
            );
          }}
        >
          <label>
            Username
            <input
              value={profile.username}
              disabled={!active}
              onChange={(event) => setProfile({ ...profile, username: event.target.value })}
            />
          </label>
          {account.nextUsernameChangeAt && (
            <small>
              Próxima alteração: {new Date(account.nextUsernameChangeAt).toLocaleString('pt-BR')}
            </small>
          )}
          <button
            disabled={!active || Boolean(busy) || cooldown > 0}
            aria-busy={busy === 'username'}
            type="submit"
          >
            {busy === 'username' ? 'Salvando username...' : 'Salvar username'}
          </button>
        </form>
      </section>
      <section className="settings-card">
        <h2>E-mail</h2>
        <p>
          Atual: <strong>{account.email}</strong>
        </p>
        {account.pendingEmailChange && (
          <div className="settings-callout">
            Confirmação pendente para {account.pendingEmailChange.newEmail}.
            <button
              type="button"
              disabled={Boolean(busy) || cooldown > 0}
              aria-busy={busy === 'cancel-email'}
              onClick={() =>
                void run('cancel-email', settingsApi.cancelEmailChange, 'Alteração cancelada.')
              }
            >
              Cancelar
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              'email',
              () => settingsApi.requestEmailChange(email.newEmail, email.currentPassword),
              'Enviamos a confirmação para o novo e-mail.'
            );
          }}
        >
          <label>
            Novo e-mail
            <input
              type="email"
              disabled={!active}
              value={email.newEmail}
              onChange={(event) => setEmail({ ...email, newEmail: event.target.value })}
            />
          </label>
          {account.hasLocalPassword && (
            <PasswordField
              id="emailCurrentPassword"
              label="Senha atual"
              autoComplete="current-password"
              disabled={!active}
              value={email.currentPassword}
              onChange={(event) => setEmail({ ...email, currentPassword: event.target.value })}
            />
          )}
          <button
            disabled={!active || !sensitiveActionReady || Boolean(busy) || cooldown > 0}
            aria-busy={busy === 'email'}
            type="submit"
          >
            {busy === 'email' ? 'Confirmando e-mail...' : 'Confirmar novo e-mail'}
          </button>
        </form>
      </section>
      <section className="settings-card danger-zone">
        <h2>Desativar conta</h2>
        <p>A conta entra em modo restrito. Projetos e dados permanecem preservados.</p>
        {account.hasLocalPassword && (
          <PasswordField
            id="deactivationPassword"
            label="Senha atual"
            autoComplete="current-password"
            disabled={!active}
            value={deactivationPassword}
            onChange={(event) => setDeactivationPassword(event.target.value)}
          />
        )}
        <div className="danger-zone-actions">
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
      </section>
    </>
  );
}
