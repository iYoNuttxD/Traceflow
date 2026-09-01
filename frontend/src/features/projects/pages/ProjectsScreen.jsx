import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  ErrorState,
  FeedbackRegion,
  LoadingState,
  TraceFlowIcon,
  normalizeApiError,
  useAbortableRequest,
  useCountdown
} from '../../../shared/index.js';
import {
  ProjectForm,
  applyRepositoryToProjectForm,
  emptyProjectForm,
  normalizeRepository,
  updateProjectForm
} from '../components/ProjectForm.jsx';
import { projectsApi } from '../api/projects.api.js';
import { ProjectJoinForm } from '../components/ProjectJoinCard.jsx';
import { NewProjectDialog } from '../components/NewProjectDialog.jsx';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge.jsx';
import { useProjectsCatalog } from '../hooks/ProjectsCatalogContext.jsx';
import { PendingProjectInvitations } from '../../invitations/index.js';
import './ProjectsScreen.css';

function clearRepositorySelection(current) {
  return {
    ...current,
    selectedOwner: '',
    selectedRepositoryName: '',
    selectedRepositoryUrl: '',
    selectedRepositoryId: '',
    selectedRepositoryFullName: '',
    selectedDefaultBranch: '',
    selectedInstallationId: ''
  };
}

function projectMonogram(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function formatUpdatedAt(value) {
  if (!value) return '';
  return `Atualizado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
    new Date(value)
  )}`;
}

export function ProjectsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reconnectProjectId = searchParams.get('projectId');
  const {
    projects,
    loading: loadingProjects,
    error: projectsRequestError,
    refreshProjects
  } = useProjectsCatalog();
  const [repositoryRequestState, setRepositoryRequestState] = useState({
    projectId: null,
    repositories: [],
    loading: false,
    error: ''
  });
  const [installations, setInstallations] = useState([]);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [duplicateRepository, setDuplicateRepository] = useState(null);
  const [highlightedProjectId, setHighlightedProjectId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [operationRetryAfterSeconds, setOperationRetryAfterSeconds] = useState(0);
  const [installationsError, setInstallationsError] = useState('');
  const [success, setSuccess] = useState('');
  const [githubCallbackError, setGithubCallbackError] = useState('');
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(Boolean(reconnectProjectId));
  const [invitationState, setInvitationState] = useState({ count: 0, loading: true });
  const operationCooldown = useCountdown(operationRetryAfterSeconds);
  const { run: runRepositoriesRequest } = useAbortableRequest();
  const { run: runInstallationsRequest } = useAbortableRequest();
  const operationLock = useRef(false);
  const repositoryStateBelongsToContext =
    String(repositoryRequestState.projectId || '') === String(reconnectProjectId || '');
  const repositories = repositoryStateBelongsToContext ? repositoryRequestState.repositories : [];
  const loadingRepositories = repositoryStateBelongsToContext
    ? repositoryRequestState.loading
    : true;
  const repositoriesError = repositoryStateBelongsToContext ? repositoryRequestState.error : '';
  const projectsError = projectsRequestError?.message || '';
  const projectsRetryAfterSeconds = projectsRequestError?.retryAfterSeconds || 0;

  const loadRepositories = useCallback(
    () =>
      runRepositoriesRequest(async (signal) => {
        const requestedProjectId = reconnectProjectId || null;
        setRepositoryRequestState((current) => ({
          projectId: requestedProjectId,
          repositories:
            String(current.projectId || '') === String(requestedProjectId || '')
              ? current.repositories
              : [],
          loading: true,
          error: ''
        }));

        try {
          const response = await projectsApi.listAllGithubRepositories(reconnectProjectId, {
            signal
          });
          if (signal.aborted) return;
          const validRepositories = (response.data.repositories || [])
            .map(normalizeRepository)
            .filter(
              (repository) =>
                repository.id &&
                repository.owner &&
                repository.name &&
                repository.fullName &&
                repository.url &&
                repository.defaultBranch &&
                repository.githubInstallationId
            );
          setRepositoryRequestState({
            projectId: requestedProjectId,
            repositories: validRepositories,
            loading: false,
            error: ''
          });
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setRepositoryRequestState({
            projectId: requestedProjectId,
            repositories: [],
            loading: false,
            error: normalizeApiError(
              requestError,
              'Não foi possível carregar os repositórios do GitHub.'
            ).message
          });
        } finally {
          if (!signal.aborted) {
            setRepositoryRequestState((current) =>
              String(current.projectId || '') === String(requestedProjectId || '')
                ? { ...current, loading: false }
                : current
            );
          }
        }
      }),
    [reconnectProjectId, runRepositoriesRequest]
  );

  const loadInstallations = useCallback(
    () =>
      runInstallationsRequest(async (signal) => {
        setInstallationsError('');
        try {
          const response = await projectsApi.listGithubInstallations({ signal });
          if (signal.aborted) return;
          setInstallations(response.data.installations || []);
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setInstallations([]);
          setInstallationsError(
            normalizeApiError(requestError, 'Não foi possível verificar a conexão com o GitHub.')
              .message
          );
        }
      }),
    [runInstallationsRequest]
  );

  useEffect(() => {
    loadInstallations();
    void loadRepositories();
  }, [loadInstallations, loadRepositories]);

  useEffect(() => {
    if (reconnectProjectId) setNewProjectDialogOpen(true);
  }, [reconnectProjectId]);

  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      setSuccess('GitHub App vinculada ao TraceFlow. Os acessos foram atualizados.');
      setGithubCallbackError('');
      void loadInstallations();
      void loadRepositories();
    } else if (searchParams.get('github') === 'error') {
      setGithubCallbackError(
        'Não foi possível concluir a autorização da GitHub App. Inicie o fluxo novamente.'
      );
    }
  }, [loadInstallations, loadRepositories, searchParams]);

  const closeNewProjectDialog = useCallback(() => {
    setNewProjectDialogOpen(false);
    if (reconnectProjectId) setSearchParams({}, { replace: true });
  }, [reconnectProjectId, setSearchParams]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleRepositoryChange(fullName) {
    const selectedRepository = repositories.find(
      (repository) => normalizeRepository(repository).fullName === fullName
    );

    const normalized = selectedRepository ? normalizeRepository(selectedRepository) : null;
    if (!normalized || normalized.selectable === false) {
      setFormData(clearRepositorySelection);
      setDuplicateRepository(null);
      return;
    }

    if (normalized.alreadyConnected && !normalized.connectedToCurrentProject) {
      setDuplicateRepository(normalized);
      setHighlightedProjectId(normalized.connectedProject?.id || null);
      window.setTimeout(() => setHighlightedProjectId(null), 4000);
      setFormData(clearRepositorySelection);
      return;
    }

    setDuplicateRepository(null);
    setFormData((current) => applyRepositoryToProjectForm(current, selectedRepository));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (operationLock.current || operationCooldown > 0) return;
    setOperationError('');
    setOperationRetryAfterSeconds(0);
    setSuccess('');

    if (
      !formData.selectedRepositoryId ||
      !formData.selectedRepositoryFullName ||
      !formData.selectedDefaultBranch
    ) {
      setOperationError('Selecione um repositório GitHub para criar o projeto.');
      return;
    }

    operationLock.current = true;
    setSubmitting(true);

    try {
      const response = await projectsApi.createFromGithub({
        githubInstallationId: formData.selectedInstallationId,
        githubRepositoryId: formData.selectedRepositoryId,
        name: formData.name,
        description: formData.description,
        responsibleTeam: formData.responsibleTeam
      });
      setSuccess(response.data.message);
      setFormData(emptyProjectForm);
      await refreshProjects();
      setNewProjectDialogOpen(false);
    } catch (requestError) {
      const connectedProject = requestError.response?.data?.details?.connectedProject;
      if (requestError.response?.status === 409 && connectedProject) {
        setDuplicateRepository({
          fullName: formData.selectedRepositoryFullName,
          connectedProject
        });
        setHighlightedProjectId(connectedProject.id);
      }
      const normalized = normalizeApiError(requestError, 'Não foi possível cadastrar o projeto.');
      setOperationError(normalized.message);
      setOperationRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      operationLock.current = false;
      setSubmitting(false);
    }
  }

  async function reconnectProject() {
    if (operationLock.current || operationCooldown > 0) return;
    const projectId = searchParams.get('projectId');
    if (!projectId || !formData.selectedRepositoryId) {
      setOperationError('Selecione o repositório que será reconectado.');
      return;
    }
    operationLock.current = true;
    setSubmitting(true);
    setOperationError('');
    setOperationRetryAfterSeconds(0);
    setSuccess('');
    try {
      const response = await projectsApi.connectGithubRepository(projectId, {
        githubInstallationId: formData.selectedInstallationId,
        githubRepositoryId: formData.selectedRepositoryId
      });
      setSuccess(response.data.message);
      setSearchParams({}, { replace: true });
      setFormData(emptyProjectForm);
      await refreshProjects();
      setNewProjectDialogOpen(false);
    } catch (requestError) {
      const normalized = normalizeApiError(
        requestError,
        'Não foi possível reconectar o repositório.'
      );
      setOperationError(normalized.message);
      setOperationRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      operationLock.current = false;
      setSubmitting(false);
    }
  }

  const projectCountLabel = `${projects.length} ${projects.length === 1 ? 'projeto' : 'projetos'}`;
  const invitationCountLabel = `${invitationState.count} ${
    invitationState.count === 1 ? 'convite' : 'convites'
  }`;

  const createContent = (
    <div className="project-create-flow">
      <FeedbackRegion
        error={operationCooldown ? undefined : operationError}
        rateLimit={operationCooldown ? operationError : undefined}
        retryAfterSeconds={operationRetryAfterSeconds}
      />
      <ProjectForm
        formData={formData}
        repositories={repositories}
        loadingRepositories={loadingRepositories}
        repositoriesError={repositoriesError}
        onRetryRepositories={() => void loadRepositories()}
        repositoryEmptyMessage={
          installations.length === 0
            ? ''
            : 'A GitHub App não possui repositórios concedidos. Gerencie o acesso da instalação no GitHub.'
        }
        repositoryDisabled={Boolean(installationsError) || installations.length === 0}
        repositoryContext={
          <Link
            className={`integration-status ${
              installations.length > 0 && !installationsError ? 'is-connected' : 'is-disconnected'
            }`}
            to="/settings/integrations"
          >
            {installationsError
              ? 'Status do GitHub indisponível'
              : installations.length > 0
                ? `GitHub App conectada · ${installations[0].accountLogin}`
                : 'Conectar GitHub App'}
          </Link>
        }
        onChange={handleChange}
        onRepositoryChange={handleRepositoryChange}
        onSubmit={handleSubmit}
        submitLabel="Cadastrar projeto"
        submitDisabled={installations.length === 0}
        submitting={submitting}
        showStatusField={false}
      />
      {installations.length === 0 && !installationsError && (
        <aside className="repository-authorization-callout" role="status">
          <p>Para criar um projeto, conecte a GitHub App e escolha um repositório.</p>
          <Link className="button button-secondary" to="/settings/integrations">
            Conectar GitHub App
          </Link>
        </aside>
      )}
      {installationsError && <FeedbackRegion error={installationsError} />}
      {duplicateRepository && (
        <aside className="repository-duplicate-callout" role="status">
          <p>
            {duplicateRepository.connectedProject ? (
              <>
                Este repositório já está vinculado ao projeto{' '}
                <strong>“{duplicateRepository.connectedProject.name}”</strong>.
              </>
            ) : (
              'Este repositório já está vinculado a outro projeto.'
            )}
          </p>
          <div>
            {duplicateRepository.connectedProject && (
              <Link to={`/projects/${duplicateRepository.connectedProject.id}`}>Ver projeto</Link>
            )}
            <button type="button" onClick={() => setDuplicateRepository(null)}>
              Fechar
            </button>
          </div>
        </aside>
      )}
      {reconnectProjectId && (
        <div className="github-reconnect-action">
          <p>Selecione acima o repositório autorizado para reconectar o projeto.</p>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void reconnectProject()}
            disabled={submitting || operationCooldown > 0 || installations.length === 0}
            aria-busy={submitting}
          >
            Concluir reconexão
          </button>
        </div>
      )}
    </div>
  );

  return (
    <main className="page-container projects-screen">
      <header className="projects-screen__header">
        <h1>Projetos</h1>
        <p>Gerencie e acompanhe seus projetos.</p>
      </header>

      <FeedbackRegion error={githubCallbackError} success={success} />

      <section className="projects-screen__section" aria-labelledby="projects-heading">
        <header className="projects-screen__section-heading">
          <h2 id="projects-heading">Seus projetos</h2>
          {!loadingProjects && !invitationState.loading && (
            <span>
              {projectCountLabel} · {invitationCountLabel}
            </span>
          )}
        </header>

        <div className="projects-grid">
          <PendingProjectInvitations
            onAccepted={refreshProjects}
            onStateChange={setInvitationState}
          />

          {loadingProjects ? (
            <div className="projects-grid__state">
              <LoadingState message="Carregando projetos..." />
            </div>
          ) : projectsError ? (
            <div className="projects-grid__state">
              <ErrorState
                message={projectsError}
                onRetry={refreshProjects}
                retryAfterSeconds={projectsRetryAfterSeconds}
              />
            </div>
          ) : (
            <>
              {projects.length === 0 && invitationState.count === 0 && !invitationState.loading && (
                <p className="projects-grid__empty">Nenhum projeto cadastrado ainda.</p>
              )}
              {projects.map((project) => {
                const repository = project.githubIntegration?.repositoryFullName;
                const needsReconnect = project.githubIntegration?.status === 'RECONNECT_REQUIRED';
                return (
                  <article
                    className={`project-card ${
                      highlightedProjectId === project.id ? 'project-card--highlighted' : ''
                    }`}
                    key={project.id}
                  >
                    <Link
                      className="project-card__link"
                      to={`/projects/${project.id}`}
                      aria-label={`Abrir projeto ${project.name}`}
                    >
                      <span className="project-card__topline">
                        <span className="project-card__monogram" aria-hidden="true">
                          {projectMonogram(project.name)}
                        </span>
                        <ProjectStatusBadge status={project.status} />
                      </span>
                      <span className="project-card__body">
                        <strong>{project.name}</strong>
                        <span>{project.description || 'Sem descrição cadastrada.'}</span>
                      </span>
                      <span className="project-card__details">
                        <span>
                          <TraceFlowIcon name="users" />
                          {project.responsibleTeam || 'Equipe não informada'}
                        </span>
                        {repository && (
                          <span>
                            <TraceFlowIcon name="branch" />
                            <code>{repository}</code>
                          </span>
                        )}
                      </span>
                      <span className="project-card__footer">
                        <span>{formatUpdatedAt(project.updatedAt)}</span>
                        <span className="project-card__affordance" aria-hidden="true">
                          <TraceFlowIcon name="arrowRight" />
                        </span>
                      </span>
                    </Link>
                    {needsReconnect && (
                      <Link
                        className="project-card__reconnect"
                        to={`/projects?projectId=${project.id}`}
                      >
                        Selecionar repositório para reconectar
                      </Link>
                    )}
                  </article>
                );
              })}
            </>
          )}

          <button
            className="new-project-card"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setNewProjectDialogOpen(true)}
          >
            <span className="new-project-card__icon" aria-hidden="true">
              <TraceFlowIcon name="plus" />
            </span>
            <strong>Novo projeto</strong>
            <span>Crie um projeto ou entre usando um código de acesso.</span>
          </button>
        </div>
      </section>

      <NewProjectDialog
        open={newProjectDialogOpen}
        initialView={reconnectProjectId ? 'create' : 'choose'}
        onClose={closeNewProjectDialog}
        createContent={createContent}
        joinContent={<ProjectJoinForm />}
      />
    </main>
  );
}
