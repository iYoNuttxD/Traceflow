import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getProjectGithubSyncStatus, syncProjectGithub } from '../../github/index.js';
import { membersApi } from '../../members/index.js';
import {
  BackButton,
  ContextualErrorPage,
  FeedbackRegion,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  TraceFlowIcon,
  useCountdown
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../components/ProjectSectionNav.jsx';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge.jsx';
import { projectsApi } from '../api/projects.api.js';
import './ProjectDetailsScreen.css';

function formatDateTime(value) {
  if (!value) return 'Ainda não realizada.';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatLastSuccessfulSync(value) {
  return value ? formatDateTime(value) : 'Não realizada';
}

function formatSyncSummary(summary) {
  if (!summary) return '';

  const parts = [];
  if (summary.branches) {
    parts.push(
      `Branches: ${summary.branches.found ?? 0} encontradas, ${summary.branches.active ?? 0} ativas.`
    );
  }
  if (summary.commits) {
    parts.push(
      `Commits: ${summary.commits.found ?? 0} encontrados, ${summary.commits.created ?? 0} novos.`
    );
  }
  if (summary.pullRequests) {
    parts.push(
      `Pull requests: ${summary.pullRequests.found ?? 0} encontrados, ${summary.pullRequests.created ?? 0} novos, ${summary.pullRequests.updated ?? 0} atualizados.`
    );
  }
  if (summary.issues) {
    parts.push(
      `Issues: ${summary.issues.found ?? 0} encontradas, ${summary.issues.created ?? 0} novas, ${summary.issues.updated ?? 0} atualizadas.`
    );
  }
  return parts.join(' ');
}

const syncStepLabels = {
  QUEUED: 'aguardando início',
  REPOSITORY: 'repositório',
  BRANCHES: 'branches',
  COMMITS: 'commits',
  PULL_REQUESTS: 'pull requests',
  ISSUES: 'issues',
  PERSIST: 'persistência',
  COMPLETED: 'concluída'
};

function isActiveSyncRun(run) {
  return run && ['QUEUED', 'RUNNING'].includes(run.status);
}

function formatSyncFailure(run) {
  const parts = ['Não foi possível concluir a sincronização.'];
  if (run.step) parts.push(`Etapa: ${syncStepLabels[run.step] || run.step}.`);
  if (run.currentBranch) parts.push(`Branch: ${run.currentBranch}.`);
  return parts.join(' ');
}

function getRepositoryName(project) {
  return project.githubIntegration?.repositoryFullName || '';
}

function getRepositoryUrl(project) {
  return project.githubIntegration?.repositoryUrl || '';
}

function getGithubSyncDisplay(project, syncStatus) {
  const integration = project.githubIntegration;
  const hasRepository = Boolean(getRepositoryName(project));
  const persistedStatus = integration?.lastSyncStatus;

  if (integration?.status === 'RECONNECT_REQUIRED') {
    return { label: 'Reconexão necessária', variant: 'warning' };
  }
  if (!hasRepository) return { label: 'Não integrado', variant: 'neutral' };
  if (syncStatus === 'syncing' || persistedStatus === 'SINCRONIZANDO') {
    return { label: 'Sincronizando...', variant: 'info' };
  }
  if (syncStatus === 'error' || persistedStatus === 'FALHA') {
    return {
      label: integration?.lastSyncAt ? 'Sincronizado anteriormente' : 'Falha na sincronização',
      variant: 'danger'
    };
  }
  if (persistedStatus === 'SINCRONIZADO' || integration?.lastSyncAt) {
    return { label: 'Sincronizado', variant: 'success' };
  }
  return { label: 'Nunca sincronizado', variant: 'neutral' };
}

export function ProjectDetailsScreen() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [memberCount, setMemberCount] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [githubSyncRun, setGithubSyncRun] = useState(null);
  const [githubSyncStatus, setGithubSyncStatus] = useState('idle');
  const [pageError, setPageError] = useState(null);
  const [membershipError, setMembershipError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const syncLock = useRef(false);

  const refreshProjectDetails = useCallback(async () => {
    const projectResponse = await projectsApi.get(id);
    setProject(projectResponse.data.project);
    return projectResponse.data.project;
  }, [id]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setMembershipError('');
    setError('');
    setRetryAfterSeconds(0);
    setGithubSyncStatus('idle');

    try {
      await refreshProjectDetails();
      try {
        const membershipData = await membersApi.list(id);
        setMemberCount((membershipData.members || []).filter((member) => member.isActive).length);
        setCurrentMembership(membershipData.currentMembership || null);
      } catch (requestError) {
        setMemberCount(null);
        setCurrentMembership(null);
        setMembershipError(
          normalizeApiError(requestError, 'Não foi possível carregar o resumo da equipe.').message
        );
      }
    } catch (requestError) {
      setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
    } finally {
      setLoading(false);
    }
  }, [id, refreshProjectDetails]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!project?.id) return undefined;
    let cancelled = false;
    void getProjectGithubSyncStatus(id)
      .then(({ run }) => {
        if (!cancelled && isActiveSyncRun(run)) {
          setGithubSyncRun(run);
          setGithubSyncStatus('syncing');
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          const normalized = normalizeApiError(
            requestError,
            'Não foi possível consultar o estado atual da sincronização.'
          );
          setError(normalized.message);
          setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, project?.id]);

  useEffect(() => {
    if (!isActiveSyncRun(githubSyncRun)) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { run } = await getProjectGithubSyncStatus(id);
        if (cancelled || !run) return;
        setGithubSyncRun(run);
        if (run.status === 'SUCCEEDED') {
          setGithubSyncStatus('success');
          setSuccess(
            `Sincronização GitHub concluída com sucesso. ${formatSyncSummary(run.summary)}`
          );
          setError('');
          await refreshProjectDetails();
        } else if (run.status === 'FAILED') {
          setGithubSyncStatus('error');
          setSuccess('');
          setError(formatSyncFailure(run));
          await refreshProjectDetails();
        }
      } catch (requestError) {
        if (!cancelled) {
          const normalized = normalizeApiError(
            requestError,
            'Não foi possível consultar o progresso da sincronização.'
          );
          setError(normalized.message);
          setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
          setGithubSyncRun((current) => (current ? { ...current } : current));
        }
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [githubSyncRun, id, refreshProjectDetails]);

  async function handleGithubSync() {
    if (syncLock.current || isActiveSyncRun(githubSyncRun) || cooldown > 0) return;
    syncLock.current = true;
    setGithubSyncStatus('syncing');
    setError('');
    setRetryAfterSeconds(0);
    setSuccess('');

    try {
      const response = await syncProjectGithub(id);
      setGithubSyncRun(response.run);
    } catch (requestError) {
      setGithubSyncStatus('error');
      const normalized = normalizeApiError(
        requestError,
        'Não foi possível sincronizar com o GitHub no momento. Verifique sua conexão ou tente novamente mais tarde.'
      );
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      try {
        await refreshProjectDetails();
      } catch {
        // Mantém o feedback local quando a atualização do projeto também falha.
      }
    } finally {
      syncLock.current = false;
    }
  }

  if (loading) {
    return (
      <main className="page-container project-details-screen">
        <p className="project-details-screen__loading" role="status">
          Carregando projeto...
        </p>
      </main>
    );
  }

  if (!project) {
    const type = classifyPageError(pageError);
    return (
      <ContextualErrorPage
        type={type}
        title={type === PAGE_ERROR_TYPES.NOT_FOUND ? 'Projeto não encontrado.' : undefined}
        description={
          type === PAGE_ERROR_TYPES.NOT_FOUND
            ? 'O projeto solicitado não existe ou não está mais disponível.'
            : undefined
        }
        onRetry={loadProject}
        secondaryAction={{ label: 'Voltar aos projetos', href: '/projects' }}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError?.retryAfterSeconds}
      />
    );
  }

  const repositoryName = getRepositoryName(project);
  const repositoryUrl = getRepositoryUrl(project);
  const githubSyncDisplay = getGithubSyncDisplay(project, githubSyncStatus);
  const syncingGithub = githubSyncStatus === 'syncing' || isActiveSyncRun(githubSyncRun);
  const githubIntegration = project.githubIntegration;
  const githubSyncFailed =
    githubSyncStatus === 'error' || githubIntegration?.lastSyncStatus === 'FALHA';
  const isOwner = currentMembership?.role === 'OWNER';
  const canSync = ['MANAGER', 'OWNER'].includes(currentMembership?.role);

  return (
    <main className="page-container project-details-screen">
      <div className="project-details-screen__return">
        <BackButton to="/projects" label="Voltar para projetos" />
      </div>

      <header className="project-details-screen__header">
        <div className="project-details-screen__title-group">
          <h1>{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="project-details-screen__actions" aria-label="Ações do projeto">
          {isOwner && (
            <Link
              className="project-icon-button"
              to={`/projects/${project.id}/edit`}
              aria-label="Editar projeto"
              title="Editar projeto"
            >
              <TraceFlowIcon name="edit" />
            </Link>
          )}
          {currentMembership && (
            <Link
              className="project-icon-button"
              to={`/projects/${project.id}/members`}
              aria-label="Membros do projeto"
              title="Membros do projeto"
            >
              <TraceFlowIcon name="users" />
            </Link>
          )}
          {canSync && (
            <button
              className="project-sync-button"
              type="button"
              onClick={() => void handleGithubSync()}
              disabled={syncingGithub || cooldown > 0}
              aria-busy={syncingGithub}
            >
              <TraceFlowIcon name="refresh" />
              {syncingGithub
                ? 'Sincronizando...'
                : cooldown > 0
                  ? `Sincronizar em ${cooldown}s`
                  : 'Sincronizar'}
            </button>
          )}
        </div>
      </header>

      <ProjectSectionNav projectId={project.id} activeSection="overview" />

      <div className="project-details-screen__feedback">
        <FeedbackRegion
          error={cooldown ? undefined : error || membershipError}
          rateLimit={cooldown ? error : undefined}
          retryAfterSeconds={retryAfterSeconds}
          success={success}
        />
      </div>

      {githubSyncRun && syncingGithub && (
        <div className="github-sync-progress" role="status" aria-live="polite">
          <strong>Sincronizando GitHub...</strong>
          <span>
            Branches: {githubSyncRun.progress?.processedBranches ?? 0}/
            {githubSyncRun.progress?.branchCount ?? 0}
          </span>
          <span>Etapa atual: {syncStepLabels[githubSyncRun.step] || githubSyncRun.step}</span>
          {githubSyncRun.currentBranch && <span>Branch: {githubSyncRun.currentBranch}</span>}
        </div>
      )}

      <section className="project-overview-surface" aria-labelledby="project-overview-title">
        <header className="project-overview-surface__intro">
          <div>
            <h2 id="project-overview-title">Visão geral</h2>
            <p>Contexto essencial do projeto, da integração GitHub e da equipe.</p>
          </div>
        </header>

        <div className="project-overview-surface__groups">
          <section className="project-overview-group">
            <header>
              <TraceFlowIcon name="info" />
              <h3>Projeto</h3>
            </header>
            <dl>
              <div>
                <dt>Descrição</dt>
                <dd>{project.description || 'Sem descrição cadastrada.'}</dd>
              </div>
              <div>
                <dt>Equipe responsável</dt>
                <dd>{project.responsibleTeam || 'Não informada'}</dd>
              </div>
            </dl>
          </section>

          <section className="project-overview-group project-overview-group--github">
            <header>
              <TraceFlowIcon name="branch" />
              <h3>GitHub</h3>
            </header>
            <dl>
              {repositoryName && (
                <div>
                  <dt>Repositório</dt>
                  <dd>
                    {repositoryUrl ? (
                      <a
                        href={repositoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir repositório GitHub ${repositoryName}`}
                      >
                        <code>{repositoryName}</code>
                      </a>
                    ) : (
                      <code>{repositoryName}</code>
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt>Estado da integração</dt>
                <dd>
                  <span
                    className={`project-github-status project-github-status--${githubSyncDisplay.variant}`}
                  >
                    <span aria-hidden="true" />
                    {githubSyncDisplay.label}
                  </span>
                </dd>
              </div>
              {repositoryName && (
                <div>
                  <dt>{githubSyncFailed ? 'Último sucesso' : 'Última sincronização'}</dt>
                  <dd>{formatLastSuccessfulSync(githubIntegration?.lastSyncAt)}</dd>
                </div>
              )}
              {githubSyncFailed && (
                <div>
                  <dt>Última tentativa falhou</dt>
                  <dd>
                    {formatLastSuccessfulSync(githubIntegration?.lastSyncAttemptAt)}
                    <small>A última sincronização não pôde ser concluída.</small>
                  </dd>
                </div>
              )}
              {!repositoryName && (
                <div>
                  <dt>Repositório</dt>
                  <dd>Nenhum repositório conectado.</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="project-overview-group project-overview-group--team">
            <header>
              <TraceFlowIcon name="users" />
              <h3>Equipe</h3>
            </header>
            <p className="project-overview-team-count">
              <strong>{memberCount ?? '—'}</strong>
              <span>
                {memberCount === null
                  ? 'contagem indisponível'
                  : memberCount === 1
                    ? 'membro ativo'
                    : 'membros ativos'}
              </span>
            </p>
          </section>
        </div>

        <footer className="project-overview-surface__metadata">
          <span>Criado em {formatDateTime(project.createdAt)}</span>
          <span>Atualizado em {formatDateTime(project.updatedAt)}</span>
        </footer>
      </section>
    </main>
  );
}
