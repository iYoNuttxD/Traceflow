import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Card,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  normalizeApiError,
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
import { ProjectJoinCard } from '../components/ProjectJoinCard.jsx';
import { PendingProjectInvitations } from '../../invitations/index.js';

export function ProjectsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [duplicateRepository, setDuplicateRepository] = useState(null);
  const [highlightedProjectId, setHighlightedProjectId] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [authorizingRepositories, setAuthorizingRepositories] = useState(false);
  const [repositoryAuthorizationStatus, setRepositoryAuthorizationStatus] = useState('AUTHORIZED');
  const [submitting, setSubmitting] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState('');
  const [projectsError, setProjectsError] = useState('');
  const [projectsRetryAfterSeconds, setProjectsRetryAfterSeconds] = useState(0);
  const [operationError, setOperationError] = useState('');
  const [operationRetryAfterSeconds, setOperationRetryAfterSeconds] = useState(0);
  const [installationsError, setInstallationsError] = useState('');
  const [success, setSuccess] = useState('');
  const [githubCallbackError, setGithubCallbackError] = useState('');
  const operationCooldown = useCountdown(operationRetryAfterSeconds);
  const operationLock = useRef(false);
  const reconnectProjectId = searchParams.get('projectId');

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setProjectsError('');
    setProjectsRetryAfterSeconds(0);

    try {
      const response = await projectsApi.list();
      setProjects(response.data.projects);
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível carregar os projetos.');
      setProjectsError(normalized.message);
      setProjectsRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadRepositories = useCallback(async () => {
    setLoadingRepositories(true);
    setRepositoriesError('');

    try {
      const response = await projectsApi.listAllGithubRepositories(reconnectProjectId);
      const nextAuthorizationStatus = response.data.authorizationStatus || 'AUTHORIZED';
      setRepositoryAuthorizationStatus(nextAuthorizationStatus);
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
      setRepositories(validRepositories);
    } catch (requestError) {
      setRepositories([]);
      setRepositoryAuthorizationStatus('AUTHORIZED');
      setRepositoriesError(
        normalizeApiError(requestError, 'Não foi possível carregar os repositórios do GitHub.')
          .message
      );
    } finally {
      setLoadingRepositories(false);
    }
  }, [reconnectProjectId]);

  const loadInstallations = useCallback(async () => {
    setInstallationsError('');
    try {
      const response = await projectsApi.listGithubInstallations();
      const available = response.data.installations || [];
      setInstallations(available);
    } catch (requestError) {
      setInstallations([]);
      setInstallationsError(
        normalizeApiError(requestError, 'Não foi possível verificar a conexão com o GitHub.')
          .message
      );
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadInstallations();
    void loadRepositories();
  }, [loadProjects, loadInstallations, loadRepositories]);

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
    } else if (searchParams.get('githubRepositoryAuthorization') === 'success') {
      setSuccess('Autorização pessoal do GitHub renovada. Os repositórios foram atualizados.');
      setGithubCallbackError('');
      void loadRepositories();
    } else if (searchParams.get('githubRepositoryAuthorization') === 'error') {
      setGithubCallbackError(
        'Não foi possível renovar sua autorização pessoal do GitHub. Tente novamente.'
      );
    }
  }, [loadInstallations, loadRepositories, searchParams]);

  async function renewRepositoryAuthorization() {
    if (authorizingRepositories || operationCooldown > 0) return;
    setAuthorizingRepositories(true);
    setOperationError('');
    setOperationRetryAfterSeconds(0);
    try {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('github');
      nextParams.delete('githubRepositoryAuthorization');
      nextParams.delete('reason');
      const query = nextParams.toString();
      const response = await projectsApi.startGithubRepositoryAuthorization(
        `/projects${query ? `?${query}` : ''}`
      );
      window.location.assign(response.data.url);
    } catch (requestError) {
      const normalized = normalizeApiError(
        requestError,
        'Não foi possível iniciar a renovação da autorização GitHub.'
      );
      setOperationError(normalized.message);
      setOperationRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      setAuthorizingRepositories(false);
    }
  }

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleRepositoryChange(fullName) {
    const selectedRepository = repositories.find(
      (repository) => normalizeRepository(repository).fullName === fullName
    );

    const normalized = selectedRepository ? normalizeRepository(selectedRepository) : null;
    if (!normalized || normalized.selectable === false) {
      setFormData((current) => ({
        ...current,
        selectedOwner: '',
        selectedRepositoryName: '',
        selectedRepositoryUrl: '',
        selectedRepositoryId: '',
        selectedRepositoryFullName: '',
        selectedDefaultBranch: '',
        selectedInstallationId: ''
      }));
      setDuplicateRepository(null);
      return;
    }

    if (normalized.alreadyConnected && !normalized.connectedToCurrentProject) {
      setDuplicateRepository(normalized);
      setHighlightedProjectId(normalized.connectedProject?.id || null);
      window.setTimeout(() => setHighlightedProjectId(null), 4000);
      setFormData((current) => ({
        ...current,
        selectedOwner: '',
        selectedRepositoryName: '',
        selectedRepositoryUrl: '',
        selectedRepositoryId: '',
        selectedRepositoryFullName: '',
        selectedDefaultBranch: '',
        selectedInstallationId: ''
      }));
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
      await loadProjects();
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
      await loadProjects();
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

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Gestão de projetos</span>
          <h1>Projetos</h1>
          <p>Cadastre e acompanhe os projetos de software do TRACEFLOW.</p>
        </div>
      </header>

      <FeedbackRegion
        error={operationCooldown ? undefined : operationError || githubCallbackError}
        rateLimit={operationCooldown ? operationError : undefined}
        retryAfterSeconds={operationRetryAfterSeconds}
        success={success}
      />

      <section className="projects-dashboard-grid" aria-label="Projetos e formas de ingresso">
        <ProjectJoinCard />
        <PendingProjectInvitations onAccepted={loadProjects} />

        <Card
          className="projects-dashboard-card project-create-card"
          title="Cadastrar projeto"
          headerAction={
            <Link
              className={`integration-status ${
                installations.length > 0 && !installationsError ? 'is-connected' : 'is-disconnected'
              }`}
              to="/settings/integrations"
            >
              {installationsError
                ? '⚠ Status do GitHub indisponível'
                : installations.length > 0
                  ? `GitHub vinculado · ${installations[0].accountLogin}`
                  : '⚠ Vincular GitHub'}
            </Link>
          }
        >
          <ProjectForm
            formData={formData}
            repositories={repositories}
            loadingRepositories={loadingRepositories}
            repositoriesError={repositoriesError}
            onRetryRepositories={() => void loadRepositories()}
            repositoryEmptyMessage={
              installations.length === 0 || repositoryAuthorizationStatus === 'REAUTH_REQUIRED'
                ? ''
                : 'Nenhum repositório com permissão OWNER ou ADMIN foi autorizado recentemente.'
            }
            repositoryDisabled={
              Boolean(installationsError) ||
              installations.length === 0 ||
              repositoryAuthorizationStatus === 'REAUTH_REQUIRED'
            }
            onChange={handleChange}
            onRepositoryChange={handleRepositoryChange}
            onSubmit={handleSubmit}
            submitLabel="Cadastrar projeto"
            submitting={submitting}
            showStatusField={false}
          />
          {repositoryAuthorizationStatus === 'REAUTH_REQUIRED' && (
            <aside className="repository-authorization-callout" role="status">
              <p>Sua autorização GitHub precisa ser renovada para listar repositórios.</p>
              <button
                className="button button-secondary"
                type="button"
                disabled={authorizingRepositories || operationCooldown > 0}
                aria-busy={authorizingRepositories}
                onClick={() => void renewRepositoryAuthorization()}
              >
                {authorizingRepositories ? 'Abrindo GitHub...' : 'Renovar acesso GitHub'}
              </button>
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
                  <Link to={`/projects/${duplicateRepository.connectedProject.id}`}>
                    Ver projeto
                  </Link>
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
                disabled={submitting || operationCooldown > 0}
                aria-busy={submitting}
              >
                Concluir reconexão
              </button>
            </div>
          )}
        </Card>

        <Card className="projects-dashboard-card project-list-card" title="Projetos cadastrados">
          {loadingProjects ? (
            <LoadingState message="Carregando projetos..." />
          ) : projectsError ? (
            <ErrorState
              message={projectsError}
              onRetry={loadProjects}
              retryAfterSeconds={projectsRetryAfterSeconds}
            />
          ) : projects.length === 0 ? (
            <p className="empty-state">Nenhum projeto cadastrado ainda.</p>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <article
                  className={`project-item ${
                    highlightedProjectId === project.id ? 'project-highlight' : ''
                  }`}
                  key={project.id}
                >
                  <div className="project-item-header">
                    <div>
                      <h3>{project.name}</h3>
                      <p>{project.description || 'Sem descrição cadastrada.'}</p>
                    </div>
                    <span className={`status-badge status-${project.status.toLowerCase()}`}>
                      {project.status}
                    </span>
                  </div>

                  <div className="project-meta">
                    <span>Equipe: {project.responsibleTeam}</span>
                    <span>
                      Repositório:{' '}
                      {project.githubIntegration?.repositoryFullName || 'não informado'}
                    </span>
                  </div>

                  <Link className="text-link" to={`/projects/${project.id}`}>
                    Ver detalhes e editar
                  </Link>
                  {project.githubIntegration?.status === 'RECONNECT_REQUIRED' && (
                    <Link className="text-link" to={`/projects?projectId=${project.id}`}>
                      Selecionar repositório para reconectar
                    </Link>
                  )}
                </article>
              ))}
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
