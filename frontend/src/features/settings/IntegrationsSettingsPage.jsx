import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
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
import { PasswordField } from '../auth/index.js';
import { GithubSensitiveReauthentication } from './GithubSensitiveReauthentication.jsx';

export function IntegrationsSettingsPage() {
  const confirm = useConfirm();
  const location = useLocation();
  const [account, setAccount] = useState(null);
  const [identity, setIdentity] = useState({ linked: false });
  const [integrations, setIntegrations] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [identityPassword, setIdentityPassword] = useState('');
  const [linking, setLinking] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [message, setMessage] = useState(
    new URLSearchParams(location.search).get('githubIdentity') === 'success'
      ? 'Conta GitHub vinculada com sucesso.'
      : new URLSearchParams(location.search).get('githubReauth') === 'success'
        ? 'Identidade GitHub confirmada para ações sensíveis.'
        : ''
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);
  const [busy, setBusy] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const actionLock = useRef(false);
  const cooldown = useCountdown(retryAfterSeconds);

  const load = useCallback(async () => {
    const [nextAccount, nextIdentity, nextIntegrations] = await Promise.all([
      settingsApi.account(),
      settingsApi.githubIdentity(),
      settingsApi.github()
    ]);
    setAccount(nextAccount);
    setIdentity(nextIdentity);
    setIntegrations(nextIntegrations);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setInitialError(null);
    try {
      await load();
    } catch (value) {
      setInitialError(normalizeApiError(value, 'Não foi possível carregar suas integrações.'));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function removeAuthorization(id) {
    if (
      !(await confirm({
        title: 'Remover autorização pessoal',
        description:
          'A instalação e os projetos da equipe serão preservados. Somente seu acesso pessoal será removido.',
        confirmLabel: 'Remover autorização'
      }))
    )
      return;
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy(`authorization-${id}`);
    setError('');
    setRetryAfterSeconds(0);
    try {
      await settingsApi.removeGithubAuthorization(id, passwords[id] || '');
      setMessage('Autorização pessoal removida.');
      setPasswords((current) => ({ ...current, [id]: '' }));
      await load();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  }

  async function startIdentityLink() {
    if (linking || cooldown > 0) return;
    setLinking(true);
    setError('');
    setRetryAfterSeconds(0);
    try {
      const result = await settingsApi.startGithubIdentityLink(identityPassword);
      window.location.assign(result.url);
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      setLinking(false);
    }
  }

  async function unlinkIdentity() {
    if (
      !(await confirm({
        title: 'Desvincular conta GitHub',
        description:
          'Você não poderá mais entrar com esta conta GitHub. Projetos e integrações com repositórios serão preservados.',
        confirmLabel: 'Desvincular'
      }))
    )
      return;
    if (actionLock.current || cooldown > 0) return;
    actionLock.current = true;
    setBusy('unlink-identity');
    setError('');
    setRetryAfterSeconds(0);
    try {
      await settingsApi.unlinkGithubIdentity(identityPassword);
      setIdentityPassword('');
      setMessage('Conta GitHub desvinculada.');
      await load();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  }

  async function authorize() {
    if (authorizing || cooldown > 0) return;
    setAuthorizing(true);
    setError('');
    setRetryAfterSeconds(0);
    try {
      const response = await settingsApi.startGithubInstallation();
      window.location.assign(response.data.url);
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      setAuthorizing(false);
    }
  }

  if (loading) return <LoadingState message="Carregando integrações..." />;
  if (initialError) {
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
  const sensitiveActionReady = account?.hasLocalPassword || account?.recentlyReauthenticated;

  return (
    <>
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      <section className="settings-card github-identity-card">
        <h2>Conta GitHub</h2>
        <p>
          Usada para autenticar sua conta TraceFlow. Não concede acesso a projetos ou repositórios.
        </p>
        {identity.linked ? (
          <>
            <div className="integration-card">
              <div>
                <strong>@{identity.githubLogin}</strong>
                <small>Vinculada</small>
              </div>
              <p>Você pode utilizar esta conta para entrar no TraceFlow.</p>
            </div>
            <section className="github-authorization-danger danger-zone">
              <h3>Desvincular conta GitHub</h3>
              <p>
                Você não poderá mais entrar com esta conta GitHub. Seus projetos e integrações com
                repositórios não serão removidos.
              </p>
              {account?.hasLocalPassword ? (
                <>
                  <PasswordField
                    id="unlinkGithubIdentityPassword"
                    label="Senha atual da conta"
                    autoComplete="current-password"
                    value={identityPassword}
                    onChange={(event) => setIdentityPassword(event.target.value)}
                  />
                  <div className="danger-zone-actions">
                    <button
                      className="button button-danger"
                      type="button"
                      disabled={!identityPassword || Boolean(busy) || cooldown > 0}
                      aria-busy={busy === 'unlink-identity'}
                      onClick={() => void unlinkIdentity()}
                    >
                      Desvincular conta GitHub
                    </button>
                  </div>
                </>
              ) : (
                <p className="danger-impact">
                  Antes de desvincular o GitHub,{' '}
                  <Link to="/settings/security">crie uma senha em Segurança</Link>.
                </p>
              )}
            </section>
          </>
        ) : (
          <>
            <p>Nenhuma conta GitHub vinculada.</p>
            <PasswordField
              id="linkGithubIdentityPassword"
              label="Senha atual da conta TraceFlow"
              autoComplete="current-password"
              value={identityPassword}
              onChange={(event) => setIdentityPassword(event.target.value)}
            />
            <button
              type="button"
              disabled={!identityPassword || linking || cooldown > 0}
              aria-busy={linking}
              onClick={() => void startIdentityLink()}
            >
              {linking ? 'Conectando ao GitHub...' : 'Vincular conta GitHub'}
            </button>
          </>
        )}
      </section>

      {!account?.hasLocalPassword && integrations.length > 0 && (
        <section className="settings-card">
          <h2>Confirmação para remover autorizações</h2>
          <p>Confirme sua identidade GitHub antes de remover uma autorização pessoal.</p>
          <GithubSensitiveReauthentication
            account={account}
            returnTo="/settings/integrations"
            onError={setError}
          />
        </section>
      )}

      <section className="settings-card">
        <h2>GitHub App</h2>
        <p>
          Autoriza o acesso a repositórios. Este domínio é independente da conta GitHub usada para
          entrar.
        </p>
        <button
          className="button button-secondary"
          type="button"
          disabled={authorizing || Boolean(busy) || cooldown > 0}
          aria-busy={authorizing}
          onClick={() => void authorize()}
        >
          {authorizing
            ? 'Abrindo GitHub...'
            : integrations.length > 0
              ? 'Adicionar ou atualizar acesso'
              : 'Instalar ou autorizar GitHub App'}
        </button>
        {!integrations.length && <p>Nenhuma autorização GitHub vinculada à sua conta.</p>}
        {integrations.map((item) => {
          const projectCount = item.projects.length;
          return (
            <div className="integration-entry" key={item.id}>
              <article className="integration-card">
                <div>
                  <strong>{item.installation.accountLogin}</strong>
                  <small>
                    {item.installation.accountType} · {item.installation.status}
                  </small>
                </div>
                <p>
                  {item.repositories.length} repositório(s) acessível(is) · {projectCount}{' '}
                  projeto(s) conectado(s)
                </p>
                <a
                  className="text-link"
                  href={item.installation.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Gerenciar acesso no GitHub
                </a>
              </article>
              <section
                className="github-authorization-danger danger-zone"
                aria-labelledby={`github-danger-${item.id}`}
              >
                <h3 id={`github-danger-${item.id}`}>Zona de risco</h3>
                <strong>Remover autorização pessoal</strong>
                <p>
                  Sua autorização será removida do TraceFlow. A GitHub App não será desinstalada e
                  projetos e artefatos não serão excluídos.
                </p>
                {projectCount > 0 && (
                  <p className="danger-impact" role="status">
                    Esta autorização está relacionada a {projectCount}{' '}
                    {projectCount === 1 ? 'projeto' : 'projetos'}.
                  </p>
                )}
                {account?.hasLocalPassword && (
                  <PasswordField
                    id={`githubAuthorizationPassword-${item.id}`}
                    label="Senha atual"
                    autoComplete="current-password"
                    value={passwords[item.id] || ''}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                )}
                <div className="danger-zone-actions">
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={
                      !sensitiveActionReady ||
                      (account?.hasLocalPassword && !passwords[item.id]) ||
                      Boolean(busy) ||
                      cooldown > 0
                    }
                    aria-busy={busy === `authorization-${item.id}`}
                    onClick={() => void removeAuthorization(item.id)}
                  >
                    Remover minha autorização
                  </button>
                </div>
              </section>
            </div>
          );
        })}
      </section>
    </>
  );
}
