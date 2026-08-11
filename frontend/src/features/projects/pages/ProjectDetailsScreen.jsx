import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getProjectGithubSyncStatus, syncProjectGithub } from '../../github/index.js';
import {
  Card,
  ContextualErrorPage,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../components/ProjectSectionNav.jsx';
import { ProjectForm, emptyProjectForm, updateProjectForm } from '../components/ProjectForm.jsx';
import { projectsApi } from '../api/projects.api.js';
import { ProjectMembersPanel } from '../../members/index.js';

function toFormData(project) {
  return {
    name: project.name || '',
    description: project.description || '',
    responsibleTeam: project.responsibleTeam || '',
    githubOwner: project.githubOwner || '',
    githubRepo: project.githubRepo || '',
    githubUrl: project.githubUrl || '',
    status: project.status || 'ATIVO'
  };
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDateTime(value) {
  if (!value) {
    return 'Ainda não realizada.';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatLastSuccessfulSync(value) {
  if (!value) {
    return 'Não realizada';
  }

  return formatDateTime(value);
}

function formatSyncSummary(summary) {
  if (!summary) {
    return '';
  }

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
  const parts = [run.error?.message || 'Não foi possível concluir a sincronização.'];
  if (run.step) parts.push(`Etapa: ${syncStepLabels[run.step] || run.step}.`);
  if (run.currentBranch) parts.push(`Branch: ${run.currentBranch}.`);
  return parts.join(' ');
}

function formatProjectStatus(status) {
  const labels = {
    ATIVO: 'Ativo',
    INATIVO: 'Inativo',
    ARQUIVADO: 'Arquivado'
  };

  return labels[status] || status || 'Não informado';
}

function getRepositoryName(project) {
  if (project.githubRepositoryFullName) {
    return project.githubRepositoryFullName;
  }

  if (project.githubOwner && (project.githubRepositoryName || project.githubRepo)) {
    return `${project.githubOwner}/${project.githubRepositoryName || project.githubRepo}`;
  }

  return project.githubRepo || project.githubRepositoryName || '';
}

function getRepositoryUrl(project) {
  return project.githubRepositoryUrl || project.githubUrl || '';
}

function buildInviteUrl(project) {
  if (project.inviteLink) {
    return project.inviteLink;
  }

  if (!project.accessCode) {
    return '';
  }

  return `${window.location.origin}/join/${project.accessCode}`;
}

function getGithubSyncDisplay(project, syncStatus) {
  const hasRepository = Boolean(getRepositoryName(project));
  const persistedStatus = project.githubSyncStatus;

  if (!hasRepository) {
    return {
      label: 'Não integrado',
      className: 'status-pendente'
    };
  }

  if (syncStatus === 'syncing' || persistedStatus === 'SINCRONIZANDO') {
    return {
      label: 'Sincronizando...',
      className: 'status-pendente'
    };
  }

  if (syncStatus === 'error' || persistedStatus === 'FALHA') {
    return {
      label: 'Falha na sincronização',
      className: 'status-cancelado'
    };
  }

  if (persistedStatus === 'SINCRONIZADO' || project.githubLastSyncAt) {
    return {
      label: 'Sincronizado',
      className: 'status-ativo'
    };
  }

  return {
    label: 'Nunca sincronizado',
    className: 'status-pendente'
  };
}

export function ProjectDetailsScreen() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [githubSyncRun, setGithubSyncRun] = useState(null);
  const [githubSyncStatus, setGithubSyncStatus] = useState('idle');
  const [pageError, setPageError] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refreshProjectDetails = useCallback(async () => {
    const projectResponse = await projectsApi.get(id);
    setProject(projectResponse.data.project);
    setFormData(toFormData(projectResponse.data.project));
    return projectResponse.data.project;
  }, [id]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setError('');
    setGithubSyncStatus('idle');

    try {
      await refreshProjectDetails();
    } catch (requestError) {
      setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
    } finally {
      setLoading(false);
    }
  }, [refreshProjectDetails]);

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
      .catch(() => {
        // O status persistido do projeto continua sendo o fallback visual.
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
          setError(
            getErrorMessage(
              requestError,
              'Não foi possível consultar o progresso da sincronização.'
            )
          );
          setGithubSyncRun((current) => (current ? { ...current } : current));
        }
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [githubSyncRun, id, refreshProjectDetails]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await projectsApi.update(id, {
        name: formData.name,
        description: formData.description,
        responsibleTeam: formData.responsibleTeam,
        status: formData.status
      });
      setProject(response.data.project);
      setFormData(toFormData(response.data.project));
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível atualizar o projeto.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGithubSync() {
    setGithubSyncStatus('syncing');
    setError('');
    setSuccess('');

    try {
      const response = await syncProjectGithub(id);
      setGithubSyncRun(response.run);
    } catch (requestError) {
      setGithubSyncStatus('error');
      setError(
        getErrorMessage(
          requestError,
          'Não foi possível sincronizar com o GitHub no momento. Verifique sua conexão ou tente novamente mais tarde.'
        )
      );

      try {
        await refreshProjectDetails();
      } catch {
        // Mantem o estado local de falha se a atualização do projeto também falhar.
      }
    }
  }

  async function handleCopyInviteLink() {
    const inviteUrl = buildInviteUrl(project);

    if (!inviteUrl) {
      setError('Código de acesso não disponível para copiar convite.');
      setSuccess('');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setError('');
      setSuccess('Link de convite copiado.');
    } catch {
      setSuccess('');
      setError('Não foi possível copiar o link de convite.');
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando projeto...</p>
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
      />
    );
  }

  const repositoryName = getRepositoryName(project);
  const repositoryUrl = getRepositoryUrl(project);
  const githubSyncDisplay = getGithubSyncDisplay(project, githubSyncStatus);
  const syncingGithub = isActiveSyncRun(githubSyncRun);

  return (
    <main className="page-container">
      <Link className="back-link" to="/projects">
        Voltar para projetos
      </Link>

      <header className="page-header project-details-header">
        <div>
          <span className="eyebrow">Projeto #{project.id}</span>
          <h1>{project.name}</h1>
          <p>{project.description || 'Sem descrição cadastrada.'}</p>
        </div>
        <ProjectSectionNav
          projectId={project.id}
          activeSection="overview"
          showSyncButton={['MANAGER', 'OWNER'].includes(currentMembership?.role)}
          onSync={handleGithubSync}
          isSyncing={syncingGithub}
        />
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}
      {syncingGithub && (
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

      <section className="project-overview">
        <Card title="Visão geral do projeto">
          <dl className="overview-grid">
            <div>
              <dt>Status do projeto</dt>
              <dd>
                <span className={`status-badge status-${project.status.toLowerCase()}`}>
                  {formatProjectStatus(project.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Status GitHub</dt>
              <dd>
                <span className={`status-badge ${githubSyncDisplay.className}`}>
                  {githubSyncDisplay.label}
                </span>
              </dd>
            </div>
            <div>
              <dt>Repositório GitHub</dt>
              <dd>
                {repositoryName ? (
                  repositoryUrl ? (
                    <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
                      {repositoryName}
                    </a>
                  ) : (
                    repositoryName
                  )
                ) : (
                  'Não informado'
                )}
              </dd>
            </div>
            <div>
              <dt>Última sincronização bem-sucedida</dt>
              <dd>{formatLastSuccessfulSync(project.githubLastSyncAt)}</dd>
            </div>
            <div>
              <dt>Última tentativa</dt>
              <dd>{formatLastSuccessfulSync(project.githubLastSyncAttemptAt)}</dd>
            </div>
            {project.githubSyncStatus === 'FALHA' && project.githubLastSyncError && (
              <div>
                <dt>Último erro</dt>
                <dd>{project.githubLastSyncError}</dd>
              </div>
            )}
            <div>
              <dt>Membros</dt>
              <dd>{memberCount}</dd>
            </div>
            <div>
              <dt>Código de acesso</dt>
              <dd className="overview-value-with-action">
                <span>{project.accessCode || 'Não informado'}</span>
                {project.accessCode && (
                  <button
                    className="copy-invite-button"
                    type="button"
                    onClick={handleCopyInviteLink}
                  >
                    Copiar convite
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Área ou equipe responsável</dt>
              <dd>{project.responsibleTeam || 'Não informada'}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDateTime(project.createdAt)}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{formatDateTime(project.updatedAt)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <div className="project-details-stack">
        {currentMembership?.role === 'OWNER' && (
          <Card title="Editar dados do projeto">
            <ProjectForm
              formData={formData}
              onChange={handleChange}
              onSubmit={handleSubmit}
              submitLabel="Salvar alterações"
              submitting={submitting}
              showRepositoryField={false}
            />
          </Card>
        )}

        <Card title="Membros do projeto">
          <ProjectMembersPanel
            projectId={id}
            onCountChange={setMemberCount}
            onMembershipLoaded={setCurrentMembership}
          />
        </Card>
      </div>
    </main>
  );
}
