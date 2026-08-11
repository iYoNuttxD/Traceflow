import { useCallback, useEffect, useState } from 'react';
import {
  ContextualErrorPage,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../shared/index.js';
import { PasswordField, useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';

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
  async function run(operation, success) {
    setError('');
    setMessage('');
    try {
      await operation();
      setMessage(success);
      await load();
      await refresh();
    } catch (value) {
      setError(normalizeApiError(value).message);
    }
  }

  if (!account && initialError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(initialError)}
        onRetry={loadInitial}
        requestId={getErrorRequestId(initialError)}
        embedded
      />
    );
  }
  if (!account) return <p>Carregando conta...</p>;
  const active = account.accountStatus === 'ACTIVE';
  return (
    <>
      <SettingsFeedback error={error} message={message} />
      <section className="settings-card">
        <h2>Perfil</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => settingsApi.updateProfile(profile.name), 'Nome atualizado.');
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
          <button disabled={!active} type="submit">
            Salvar nome
          </button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => settingsApi.updateUsername(profile.username), 'Username atualizado.');
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
          <button disabled={!active} type="submit">
            Salvar username
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
              onClick={() => void run(settingsApi.cancelEmailChange, 'Alteração cancelada.')}
            >
              Cancelar
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
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
          <PasswordField
            id="emailCurrentPassword"
            label="Senha atual"
            autoComplete="current-password"
            disabled={!active}
            value={email.currentPassword}
            onChange={(event) => setEmail({ ...email, currentPassword: event.target.value })}
          />
          <button disabled={!active} type="submit">
            Confirmar novo e-mail
          </button>
        </form>
      </section>
      <section className="settings-card danger-zone">
        <h2>Desativar conta</h2>
        <p>A conta entra em modo restrito. Projetos e dados permanecem preservados.</p>
        <PasswordField
          id="deactivationPassword"
          label="Senha atual"
          autoComplete="current-password"
          disabled={!active}
          value={deactivationPassword}
          onChange={(event) => setDeactivationPassword(event.target.value)}
        />
        <div className="danger-zone-actions">
          <button
            className="button button-danger"
            disabled={!active}
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
              await run(() => settingsApi.deactivate(deactivationPassword), 'Conta desativada.');
            }}
          >
            Desativar conta
          </button>
        </div>
      </section>
    </>
  );
}
