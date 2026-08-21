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
import { useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';
import { PasswordField } from '../auth/index.js';
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
  if (loading) return <LoadingState message="Carregando privacidade..." />;
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
      <section className="settings-card">
        <h2>Portabilidade</h2>
        <p>Baixe um arquivo ZIP com documentos JSON versionados e sem credenciais.</p>
        <button
          type="button"
          disabled={Boolean(busy) || cooldown > 0}
          aria-busy={busy === 'export'}
          onClick={() =>
            void run(
              'export',
              async () => download(await settingsApi.exportData()),
              'Exportação concluída.'
            )
          }
        >
          {busy === 'export' ? 'Preparando exportação...' : 'Exportar meus dados'}
        </button>
      </section>
      <section className="settings-card danger-zone">
        <h2>Excluir conta</h2>
        {request ? (
          <p>
            Exclusão agendada para{' '}
            <strong>{new Date(request.scheduledFor).toLocaleString('pt-BR')}</strong>. Até lá, a
            conta permanece restrita e a solicitação pode ser cancelada.
          </p>
        ) : (
          <p>
            Após o prazo de carência, identificadores pessoais serão anonimizados. Artefatos
            colaborativos e rastreabilidade serão preservados.
          </p>
        )}
        {account?.hasLocalPassword ? (
          <PasswordField
            id="privacyCurrentPassword"
            label="Senha atual"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        ) : (
          <GithubSensitiveReauthentication
            account={account}
            returnTo="/settings/privacy"
            onError={setError}
          />
        )}
        <div className="danger-zone-actions">
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
      </section>
    </>
  );
}
