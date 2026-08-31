import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import {
  ContextualErrorPage,
  LoadingState,
  TraceFlowIcon,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useCountdown
} from '../../shared/index.js';
import { githubOAuthErrorMessage } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import { SensitiveActionDialog } from './SensitiveActionDialog.jsx';
import { SettingsFeedback } from './SettingsFeedback.jsx';
import './IntegrationsSettingsPage.css';

export function IntegrationsSettingsPage() {
  const location = useLocation();
  const [account, setAccount] = useState(null);
  const [identity, setIdentity] = useState({ linked: false });
  const [integrations, setIntegrations] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [authorizing, setAuthorizing] = useState(false);
  const searchParams = new URLSearchParams(location.search);
  const githubError =
    searchParams.get('github') === 'error'
      ? githubOAuthErrorMessage(searchParams.get('reason'))
      : '';
  const [message, setMessage] = useState(
    githubError
      ? ''
      : searchParams.get('githubIdentity') === 'success'
        ? 'GitHub OAuth vinculado.'
        : searchParams.get('githubReauth') === 'success'
          ? 'Identidade GitHub confirmada para ações sensíveis.'
          : ''
  );
  const [error, setError] = useState(githubError);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
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

  async function completeSensitiveAction(operation, success) {
    setError('');
    setMessage('');
    setRetryAfterSeconds(0);
    try {
      await operation();
      setMessage(success);
      await load();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      throw value;
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

  function openDialog(kind, trigger, authorization = null) {
    setDialog({ kind, trigger, authorization });
  }

  async function confirmDialog(password) {
    if (dialog.kind === 'link') {
      const result = await settingsApi.startGithubIdentityLink(password);
      window.location.assign(result.url);
      return;
    }
    if (dialog.kind === 'unlink') {
      await completeSensitiveAction(
        () => settingsApi.unlinkGithubIdentity(password),
        'GitHub OAuth desvinculado.'
      );
      return;
    }
    await completeSensitiveAction(
      () => settingsApi.removeGithubAuthorization(dialog.authorization.id, password),
      'GitHub App desconectada desta conta TraceFlow.'
    );
  }

  function dialogProps() {
    if (!dialog) return null;
    if (dialog.kind === 'link') {
      return {
        title: 'Vincular GitHub OAuth',
        description: 'Confirme sua senha atual antes de continuar para o GitHub.',
        independence: 'Esta ação não instala a GitHub App.',
        confirmLabel: 'Continuar com GitHub',
        destructive: false,
        mode: 'password'
      };
    }
    if (dialog.kind === 'unlink') {
      const prerequisite = !account?.hasLocalPassword;
      return {
        title: prerequisite ? 'Crie uma senha antes de desvincular' : 'Desvincular GitHub OAuth?',
        description: prerequisite
          ? 'O GitHub OAuth é o único método de entrada disponível para esta conta.'
          : 'Você não poderá mais entrar usando esta conta GitHub.',
        independence: 'A integração por GitHub App continuará funcionando normalmente.',
        confirmLabel: 'Desvincular',
        mode: prerequisite ? 'prerequisite' : 'password'
      };
    }

    const needsGithubReauth = !account?.hasLocalPassword && !account?.recentlyReauthenticated;
    const mode = account?.hasLocalPassword ? 'password' : needsGithubReauth ? 'github' : 'confirm';
    return {
      title: 'Desconectar GitHub App?',
      description: 'A integração com repositórios, sincronização e webhooks será interrompida.',
      independence: 'O login com GitHub não será afetado.',
      confirmLabel: 'Desconectar',
      mode,
      account,
      returnTo: '/settings/integrations'
    };
  }

  if (loading) {
    return (
      <div className="settings-loading">
        <LoadingState message="Carregando integrações..." />
      </div>
    );
  }
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

  const activeDialogProps = dialogProps();

  return (
    <div className="settings-stack">
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      <article className="settings-surface">
        <section className="settings-section" aria-labelledby="settings-github-oauth-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-github-oauth-title">GitHub OAuth</h2>
              <p>Usado para entrar no TraceFlow.</p>
            </div>
          </div>
          {identity.linked ? (
            <div className="integration-box integration-box-compact">
              <strong className="integration-identity">@{identity.githubLogin}</strong>
              <span className="settings-status-badge settings-status-success">Vinculada</span>
              <button
                className="button button-danger"
                type="button"
                disabled={cooldown > 0}
                onClick={(event) => openDialog('unlink', event.currentTarget)}
              >
                Desvincular
              </button>
            </div>
          ) : (
            <div className="settings-panel">
              <h3>GitHub OAuth não vinculado</h3>
              <p>Vincule uma identidade GitHub para também usá-la no login.</p>
              <div className="settings-actions">
                <button
                  className="button button-provider"
                  type="button"
                  disabled={cooldown > 0}
                  onClick={(event) => openDialog('link', event.currentTarget)}
                >
                  Vincular GitHub OAuth
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="settings-github-app-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-github-app-title">GitHub App</h2>
              <p>Usada para integração com repositórios, sincronização e webhooks.</p>
            </div>
          </div>
          <div className="settings-section-flow">
            <div className="settings-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={authorizing || cooldown > 0}
                aria-busy={authorizing}
                onClick={() => void authorize()}
              >
                {authorizing
                  ? 'Abrindo GitHub...'
                  : integrations.length > 0
                    ? 'Adicionar ou atualizar acesso'
                    : 'Instalar ou autorizar GitHub App'}
              </button>
            </div>
            {!integrations.length ? (
              <div className="settings-panel">
                <h3>GitHub App não instalada</h3>
                <p>Autorize a App para integrar repositórios e sincronização.</p>
              </div>
            ) : (
              <div className="integration-list">
                {integrations.map((item) => {
                  const projectCount = item.projects.length;
                  const repositoryCount = item.repositories.length;
                  return (
                    <article className="integration-box" key={item.id}>
                      <div className="integration-box-header">
                        <strong className="integration-identity">
                          {item.installation.accountLogin}
                        </strong>
                        <span
                          className={`settings-status-badge ${
                            item.installation.status === 'ACTIVE'
                              ? 'settings-status-success'
                              : 'settings-status-warning'
                          }`}
                        >
                          {item.installation.status === 'ACTIVE'
                            ? 'Ativa'
                            : item.installation.status}
                        </span>
                      </div>
                      <div className="integration-metadata">
                        <span>
                          {repositoryCount}{' '}
                          {repositoryCount === 1
                            ? 'repositório autorizado'
                            : 'repositórios autorizados'}
                        </span>
                        <span>
                          {projectCount}{' '}
                          {projectCount === 1 ? 'projeto vinculado' : 'projetos vinculados'}
                        </span>
                      </div>
                      <div className="integration-box-actions">
                        <a
                          className="button integration-external-link"
                          href={item.installation.manageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Gerenciar acesso no GitHub"
                        >
                          Gerenciar no GitHub
                          <TraceFlowIcon name="externalLink" />
                        </a>
                        <button
                          className="button button-danger"
                          type="button"
                          disabled={cooldown > 0}
                          onClick={(event) => openDialog('disconnect', event.currentTarget, item)}
                        >
                          Desconectar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </article>
      {dialog && activeDialogProps && (
        <SensitiveActionDialog
          {...activeDialogProps}
          trigger={dialog.trigger}
          onConfirm={confirmDialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
