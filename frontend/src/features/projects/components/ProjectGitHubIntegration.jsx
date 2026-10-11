import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { GitHubSyncProgress } from '../../github/index.js';
import { FeedbackRegion, Switch } from '../../../shared/index.js';
import { GitHubRepositorySelector } from './GitHubRepositorySelector.jsx';
import { useGithubRepositoryCatalog } from '../hooks/useGithubRepositoryCatalog.js';
import {
  isActiveGithubRun,
  useProjectGithubIntegration
} from '../hooks/useProjectGithubIntegration.js';
import './ProjectGitHubIntegration.css';

function dateTime(value) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : 'Não realizada';
}

function ConnectRepositoryForm({ projectId, busy, cooldown, onConnect, onCancel }) {
  const catalog = useGithubRepositoryCatalog({ projectId });
  const [selected, setSelected] = useState('');
  const container = useRef(null);
  const repository = catalog.repositories.find((item) => item.fullName === selected);
  useEffect(() => {
    container.current?.querySelector('button, input, select, a')?.focus();
  }, []);
  const unavailable = Boolean(catalog.repositoriesError || catalog.installationsError);
  return (
    <form
      ref={container}
      className="project-github__connection-form"
      aria-label="Vincular repositório GitHub"
      onSubmit={(event) => {
        event.preventDefault();
        if (repository?.selectable && !unavailable && !busy && !cooldown)
          void onConnect(repository);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <GitHubRepositorySelector
        {...catalog}
        currentRepositoryFullName={selected}
        onRepositoryChange={setSelected}
        repositoryRequired
        submitting={Boolean(busy)}
        repositoriesError={catalog.repositoriesError || catalog.installationsError}
        repositoryDisabled={catalog.installations.length === 0}
        repositoryEmptyMessage="Nenhum repositório autorizado disponível. Confira o acesso nas integrações da sua conta."
        onRetryRepositories={
          cooldown
            ? undefined
            : () => {
                void catalog.loadInstallations();
                void catalog.loadRepositories({ fresh: true });
              }
        }
        repositoryContext={<Link to="/settings/integrations">Gerenciar acesso ao GitHub</Link>}
      />
      {!catalog.loadingRepositories && !unavailable && catalog.installations.length === 0 && (
        <p className="field-help">
          Autorize a GitHub App nas integrações da sua conta para selecionar um repositório.
        </p>
      )}
      <div className="project-github__actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={Boolean(busy)}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={
            !repository?.selectable ||
            unavailable ||
            catalog.loadingRepositories ||
            Boolean(busy) ||
            cooldown > 0
          }
          aria-busy={busy === 'connect'}
        >
          {busy === 'connect' ? 'Vinculando...' : 'Vincular repositório'}
        </button>
      </div>
    </form>
  );
}

export function ProjectGitHubIntegration({ project, role, onIntegrationChange }) {
  const state = useProjectGithubIntegration(project, onIntegrationChange);
  const { integration, run, busy, cooldown } = state;
  const [selecting, setSelecting] = useState(false);
  const heading = useRef(null);
  const trigger = useRef(null);
  const location = useLocation();
  const owner = role === 'OWNER';
  const canConnect = owner && (!integration || integration.status === 'RECONNECT_REQUIRED');
  const canSync = ['OWNER', 'MANAGER'].includes(role) && integration?.status === 'ACTIVE';
  const activeRun = isActiveGithubRun(run);
  const failed = Boolean(
    state.initialSyncError ||
    run?.status === 'FAILED' ||
    (!run && integration?.lastSyncStatus === 'FALHA')
  );
  const integrationLabel = !integration
    ? 'Não conectado'
    : integration.status === 'ACTIVE'
      ? 'Conectado'
      : integration.status === 'RECONNECT_REQUIRED'
        ? 'Reconexão necessária'
        : 'Integração inativa';
  const syncLabel =
    run?.status === 'QUEUED'
      ? 'Sincronização pendente'
      : activeRun || integration?.lastSyncStatus === 'SINCRONIZANDO'
        ? 'Sincronizando'
        : failed
          ? 'Falha na última sincronização'
          : run?.status === 'SUCCEEDED' || integration?.lastSyncStatus === 'SINCRONIZADO'
            ? 'Sincronizado'
            : 'Sincronização pendente';

  useEffect(() => {
    if (location.hash !== '#github-integration') return;
    heading.current?.focus();
    heading.current?.scrollIntoView?.({ block: 'start' });
  }, [location.hash]);

  function closeSelector() {
    setSelecting(false);
    queueMicrotask(() => trigger.current?.focus());
  }

  return (
    <section
      className="project-github"
      id="github-integration"
      aria-labelledby="project-github-title"
    >
      <header className="project-github__heading">
        <div>
          <h2 id="project-github-title" ref={heading} tabIndex="-1">
            Integração GitHub
          </h2>
          <p>Repositório e sincronização das evidências técnicas do projeto.</p>
        </div>
      </header>
      <FeedbackRegion success={state.success} />
      <FeedbackRegion
        error={cooldown ? undefined : state.error}
        rateLimit={cooldown ? state.error : undefined}
        retryAfterSeconds={state.retryAfterSeconds}
      />
      {state.refreshWarning && (
        <div>
          <FeedbackRegion warning={state.refreshWarning} />
          <button
            className="button button-secondary"
            type="button"
            disabled={state.refreshing || Boolean(busy) || cooldown > 0}
            onClick={() => void state.refresh()}
          >
            {state.refreshing ? 'Atualizando...' : 'Tentar atualizar dados'}
          </button>
        </div>
      )}
      <div className="project-github__group" aria-labelledby="project-github-repository-title">
        <h3 id="project-github-repository-title">Repositório</h3>
        <dl className="project-github__metadata">
          <div>
            <dt>Status</dt>
            <dd>
              <span
                className={`project-github__badge ${integration?.status === 'ACTIVE' ? 'project-github__badge--connected' : ''}`}
              >
                {integrationLabel}
              </span>
            </dd>
          </div>
          {integration && (
            <>
              <div>
                <dt>Repositório</dt>
                <dd>
                  <a href={integration.repositoryUrl} target="_blank" rel="noopener noreferrer">
                    {integration.repositoryFullName}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Branch padrão</dt>
                <dd>{integration.defaultBranch || 'Não informada'}</dd>
              </div>
            </>
          )}
        </dl>
        {!integration && <p>Este projeto ainda não possui um repositório GitHub vinculado.</p>}
        {integration && integration.status !== 'ACTIVE' && (
          <p>
            O repositório permanece vinculado. Verifique o acesso ao GitHub antes de sincronizar.
          </p>
        )}
        {canConnect && !selecting && (
          <div className="project-github__actions">
            <button
              ref={trigger}
              className="button button-primary"
              type="button"
              onClick={() => setSelecting(true)}
            >
              {integration ? 'Reconectar repositório' : 'Conectar repositório'}
            </button>
          </div>
        )}
        {canConnect && selecting && (
          <ConnectRepositoryForm
            projectId={project.id}
            busy={busy}
            cooldown={cooldown}
            onCancel={closeSelector}
            onConnect={async (repository) => {
              if (await state.connect(repository)) {
                setSelecting(false);
                heading.current?.focus();
              }
            }}
          />
        )}
      </div>
      {integration && (
        <>
          <div className="project-github__group" aria-labelledby="project-github-sync-title">
            <h3 id="project-github-sync-title">Sincronização</h3>
            <dl className="project-github__metadata">
              <div>
                <dt>Estado atual</dt>
                <dd>{activeRun && run.status !== 'QUEUED' ? 'Em andamento' : syncLabel}</dd>
              </div>
              <div>
                <dt>Último sucesso</dt>
                <dd>{dateTime(integration.lastSyncAt)}</dd>
              </div>
              <div>
                <dt>Última tentativa</dt>
                <dd>{dateTime(integration.lastSyncAttemptAt)}</dd>
              </div>
            </dl>
            <GitHubSyncProgress run={run} />
            {failed && (
              <FeedbackRegion
                warning={
                  state.initialSyncError ||
                  'Não foi possível concluir a última sincronização. O repositório e os dados já importados foram preservados.'
                }
              />
            )}
            {state.statusError && (
              <div>
                <FeedbackRegion warning={state.statusError} />
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={Boolean(busy) || cooldown > 0}
                  onClick={state.retryStatus}
                >
                  Consultar sincronização novamente
                </button>
              </div>
            )}
            {canSync && (
              <div className="project-github__actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={
                    Boolean(busy) ||
                    activeRun ||
                    cooldown > 0 ||
                    state.checkingStatus ||
                    Boolean(state.statusError)
                  }
                  aria-busy={busy === 'sync' || activeRun}
                  onClick={() => void state.sync()}
                >
                  {busy === 'sync' || activeRun
                    ? 'Sincronizando...'
                    : failed
                      ? 'Tentar sincronizar novamente'
                      : 'Sincronizar agora'}
                </button>
              </div>
            )}
          </div>
          <div className="project-github__group" aria-labelledby="project-github-automation-title">
            <h3 id="project-github-automation-title">Automação</h3>
            <div className="project-github__automatic">
              {owner ? (
                <Switch
                  label="Sincronização automática"
                  checked={integration.autoSyncEnabled === true}
                  disabled={Boolean(busy) || cooldown > 0}
                  onChange={(event) => void state.saveAutomatic(event.target.checked)}
                  describedBy="project-github-auto-help"
                />
              ) : (
                <strong>Sincronização automática</strong>
              )}
              <p id="project-github-auto-help">Permitir atualizações periódicas do repositório.</p>
              <p>
                {integration.autoSyncEnabled ? 'Ativada' : 'Desativada'}
                {activeRun && !integration.autoSyncEnabled
                  ? '. A execução atual continuará até a conclusão.'
                  : ''}
              </p>
            </div>
            {integration.autoSyncEnabled && (
              <dl className="project-github__metadata">
                <div>
                  <dt>Próxima sincronização</dt>
                  <dd>
                    {integration.nextSyncAt
                      ? dateTime(integration.nextSyncAt)
                      : activeRun
                        ? 'Será agendada após esta execução.'
                        : 'Agendamento indisponível'}
                  </dd>
                </div>
              </dl>
            )}
            {busy === 'settings' && <p role="status">Salvando preferência...</p>}
          </div>
        </>
      )}
    </section>
  );
}
