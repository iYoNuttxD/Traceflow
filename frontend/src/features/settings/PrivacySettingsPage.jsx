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

function download(blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `traceflow-export-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PrivacySettingsPage() {
  const confirm = useConfirm();
  const { refresh } = useAuth();
  const [request, setRequest] = useState(null);
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);
  const [busy, setBusy] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const actionLock = useRef(false);
  const cooldown = useCountdown(retryAfterSeconds);

  const load = useCallback(async () => {
    const [nextRequest, nextAccount] = await Promise.all([
      settingsApi.deletion(),
      settingsApi.account()
    ]);
    setRequest(nextRequest);
    setAccount(nextAccount);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setInitialError(null);
    try {
      await load();
    } catch (value) {
      setInitialError(normalizeApiError(value, 'Não foi possível carregar sua privacidade.'));
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="settings-loading">
        <LoadingState message="Carregando privacidade..." />
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

  const sensitiveActionReady = account?.hasLocalPassword || account?.recentlyReauthenticated;

  return (
    <div className="settings-stack">
      <SettingsFeedback error={error} message={message} retryAfterSeconds={cooldown} />
      <article className="settings-surface">
        <section className="settings-section" aria-labelledby="settings-export-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-export-title">Portabilidade de dados</h2>
              <p>Exporte os dados disponíveis da sua conta em um arquivo ZIP.</p>
            </div>
          </div>
          <div className="settings-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={Boolean(busy) || cooldown > 0}
              aria-busy={busy === 'export'}
              onClick={() =>
                void run(
                  'export',
                  async () => download(await settingsApi.exportData()),
                  'Exportação concluída. O download foi iniciado.'
                )
              }
            >
              {busy === 'export' ? 'Preparando exportação...' : 'Exportar meus dados'}
            </button>
          </div>
        </section>

        <section
          className="settings-section settings-danger-section"
          aria-labelledby="settings-deletion-title"
        >
          <div className="settings-section-heading">
            <div>
              <h2 id="settings-deletion-title">Exclusão da conta</h2>
              <p>Solicite a exclusão ou cancele uma solicitação ainda pendente.</p>
            </div>
            {request && (
              <span className="settings-status-badge settings-status-warning">
                Exclusão pendente
              </span>
            )}
          </div>
          <div className="settings-section-flow">
            {request ? (
              <div className="settings-panel settings-panel-warning" role="status">
                <h3>Exclusão agendada</h3>
                <p>
                  A conta está programada para exclusão em{' '}
                  <strong>{new Date(request.scheduledFor).toLocaleString('pt-BR')}</strong>.
                </p>
              </div>
            ) : (
              <p className="settings-field-help">
                Após o prazo de carência, identificadores pessoais serão anonimizados. Artefatos
                colaborativos e rastreabilidade serão preservados.
              </p>
            )}
            {account?.hasLocalPassword ? (
              <div className="settings-form">
                <PasswordField
                  id="privacyCurrentPassword"
                  label="Senha atual"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            ) : (
              <div className="settings-panel settings-panel-info">
                <h3>Confirme sua identidade</h3>
                <p>Esta ação exige uma confirmação GitHub recente.</p>
                <GithubSensitiveReauthentication
                  account={account}
                  returnTo="/settings/privacy"
                  onError={setError}
                />
              </div>
            )}
            <div className="settings-actions">
              {request ? (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={!sensitiveActionReady || Boolean(busy) || cooldown > 0}
                  aria-busy={busy === 'cancel-deletion'}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: 'Cancelar exclusão',
                        description: 'Todas as sessões serão encerradas após o cancelamento.',
                        confirmLabel: 'Cancelar exclusão'
                      }))
                    )
                      return;
                    await run(
                      'cancel-deletion',
                      () => settingsApi.cancelDeletion(password),
                      'Exclusão cancelada. Entre novamente.'
                    );
                  }}
                >
                  Cancelar exclusão
                </button>
              ) : (
                <button
                  className="button button-danger"
                  type="button"
                  disabled={!sensitiveActionReady || Boolean(busy) || cooldown > 0}
                  aria-busy={busy === 'request-deletion'}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: 'Solicitar exclusão',
                        description: 'A conta ficará restrita durante o prazo de carência.',
                        confirmLabel: 'Solicitar exclusão'
                      }))
                    )
                      return;
                    await run(
                      'request-deletion',
                      () => settingsApi.requestDeletion(password),
                      'Exclusão agendada.'
                    );
                  }}
                >
                  Solicitar exclusão
                </button>
              )}
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}
