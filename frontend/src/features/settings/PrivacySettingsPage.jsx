import { useCallback, useEffect, useState } from 'react';
import {
  ContextualErrorPage,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../shared/index.js';
import { useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';
import { PasswordField } from '../auth/index.js';

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
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);
  const load = useCallback(async () => {
    setRequest(await settingsApi.deletion());
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
  async function run(operation, success) {
    setError('');
    try {
      await operation();
      setMessage(success);
      await load();
      await refresh();
    } catch (value) {
      setError(normalizeApiError(value).message);
    }
  }
  if (loading) return <LoadingState message="Carregando privacidade..." />;
  if (initialError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(initialError)}
        onRetry={loadInitial}
        requestId={getErrorRequestId(initialError)}
        embedded
      />
    );
  }
  return (
    <>
      <SettingsFeedback error={error} message={message} />
      <section className="settings-card">
        <h2>Portabilidade</h2>
        <p>Baixe um arquivo ZIP com documentos JSON versionados e sem credenciais.</p>
        <button
          type="button"
          onClick={() =>
            void run(async () => download(await settingsApi.exportData()), 'Exportação concluída.')
          }
        >
          Exportar meus dados
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
        <PasswordField
          id="privacyCurrentPassword"
          label="Senha atual"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div className="danger-zone-actions">
          {request ? (
            <button
              className="button button-secondary"
              type="button"
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
              onClick={async () => {
                if (
                  !(await confirm({
                    title: 'Solicitar exclusão',
                    description: 'A conta ficará restrita durante o prazo de carência.',
                    confirmLabel: 'Solicitar exclusão'
                  }))
                )
                  return;
                await run(() => settingsApi.requestDeletion(password), 'Exclusão agendada.');
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
