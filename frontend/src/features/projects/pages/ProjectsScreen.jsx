import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Card,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import {
  ProjectForm,
  applyRepositoryToProjectForm,
  emptyProjectForm,
  normalizeRepository,
  updateProjectForm
} from '../components/ProjectForm.jsx';
import { projectsApi } from '../api/projects.api.js';

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function ProjectsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [selectedInstallationId, setSelectedInstallationId] = useState('');
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState('');
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [success, setSuccess] = useState('');
  const [githubCallbackError, setGithubCallbackError] = useState('');
  const reconnectProjectId = searchParams.get('projectId');

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError('');
    setRetryAfterSeconds(0);

    try {
      const response = await projectsApi.list();
      setProjects(response.data.projects);
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível carregar os projetos.');
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadRepositories = useCallback(
    async (installationId) => {
      if (!installationId) {
        setRepositories([]);
        setLoadingRepositories(false);
        return;
      }
      setLoadingRepositories(true);
      setRepositoriesError('');

      try {
        const response = await projectsApi.listGithubRepositories(
          installationId,
          reconnectProjectId
        );
        const validRepositories = (response.data.repositories || [])
          .map(normalizeRepository)
          .filter(
            (repository) =>
              repository.owner && repository.name && repository.fullName && repository.url
          );
        setRepositories(validRepositories);
      } catch {
        setRepositories([]);
        setRepositoriesError('Não foi possível carregar os repositórios do GitHub.');
      } finally {
        setLoadingRepositories(false);
      }
    },
    [reconnectProjectId]
  );

  const loadInstallations = useCallback(async () => {
    try {
      const response = await projectsApi.listGithubInstallations();
      const available = response.data.installations || [];
      setInstallations(available);
      if (available.length) {
        setSelectedInstallationId((current) => current || available[0].githubInstallationId);
      }
    } catch {
      setInstallations([]);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadInstallations();
  }, [loadProjects, loadInstallations]);

  useEffect(() => {
    void loadRepositories(selectedInstallationId);
  }, [loadRepositories, selectedInstallationId]);

  useEffect(() => {
    const callbackInstallationId = searchParams.get('installationId');
    if (callbackInstallationId) setSelectedInstallationId(callbackInstallationId);
    if (searchParams.get('github') === 'connected') {
      setSuccess('GitHub App vinculada ao TraceFlow. Os acessos foram atualizados.');
      setGithubCallbackError('');
      void loadInstallations();
    } else if (searchParams.get('github') === 'error') {
      setGithubCallbackError(
        'Não foi possível concluir a autorização da GitHub App. Inicie o fluxo novamente.'
      );
    }
  }, [loadInstallations, searchParams]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleRepositoryChange(fullName) {
    const selectedRepository = repositories.find(
      (repository) => normalizeRepository(repository).fullName === fullName
    );

    if (!selectedRepository || normalizeRepository(selectedRepository).selectable === false) {
      setFormData((current) => ({
        ...current,
        githubOwner: '',
        githubRepo: '',
        githubUrl: '',
        githubRepositoryId: '',
        githubRepositoryName: '',
        githubRepositoryFullName: '',
        githubRepositoryUrl: '',
        githubDefaultBranch: ''
      }));
      return;
    }

    setFormData((current) => applyRepositoryToProjectForm(current, selectedRepository));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (
      !formData.githubRepositoryId ||
      !formData.githubRepositoryFullName ||
      !formData.githubDefaultBranch
    ) {
      setError('Selecione um repositório GitHub para criar o projeto.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await projectsApi.createFromGithub({
        githubInstallationId: selectedInstallationId,
        githubRepositoryId: formData.githubRepositoryId,
        name: formData.name,
        description: formData.description,
        responsibleTeam: formData.responsibleTeam
      });
      setSuccess(response.data.message);
      setFormData(emptyProjectForm);
      await loadProjects();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível cadastrar o projeto.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function reconnectProject() {
    const projectId = searchParams.get('projectId');
    if (!projectId || !formData.githubRepositoryId) {
      setError('Selecione o repositório que será reconectado.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = await projectsApi.connectGithubRepository(projectId, {
        githubInstallationId: selectedInstallationId,
        githubRepositoryId: formData.githubRepositoryId
      });
      setSuccess(response.data.message);
      setSearchParams({}, { replace: true });
      setFormData(emptyProjectForm);
      await loadProjects();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível reconectar o repositório.'));
    } finally {
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

      <FeedbackRegion error={githubCallbackError} success={success} />

      <div className="projects-layout">
        <Card title="Cadastrar projeto">
          <div className="github-app-setup">
            <span
              className={`integration-status ${
                installations.length > 0 ? 'is-connected' : 'is-disconnected'
              }`}
              role="status"
            >
              {installations.length > 0
                ? `GitHub vinculado${
                    installations.length === 1 ? ` · ${installations[0].accountLogin}` : ''
                  }`
                : 'GitHub não vinculado'}
            </span>
            {installations.length > 0 && (
              <label className="field">
                <span>Instalação GitHub</span>
                <select
                  value={selectedInstallationId}
                  onChange={(event) => setSelectedInstallationId(event.target.value)}
                >
                  {installations.map((installation) => (
                    <option
                      key={installation.githubInstallationId}
                      value={installation.githubInstallationId}
                    >
                      {installation.accountLogin}
                      {installation.accountType ? ` (${installation.accountType})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {installations.length === 0 && (
              <p className="field-help">
                Configure a integração em{' '}
                <Link className="text-link" to="/settings/integrations">
                  Integrações
                </Link>
                .
              </p>
            )}
          </div>
          <ProjectForm
            formData={formData}
            repositories={repositories}
            loadingRepositories={loadingRepositories}
            repositoriesError={repositoriesError}
            repositoryEmptyMessage={
              installations.length === 0 ? '' : 'A instalação não possui repositórios acessíveis.'
            }
            repositoryDisabled={installations.length === 0}
            onChange={handleChange}
            onRepositoryChange={handleRepositoryChange}
            onSubmit={handleSubmit}
            submitLabel="Cadastrar projeto"
            submitting={submitting}
            showStatusField={false}
          />
          {reconnectProjectId && (
            <div className="github-reconnect-action">
              <p>Selecione acima o repositório autorizado para reconectar o projeto.</p>
              <button
                className="button button-primary"
                type="button"
                onClick={() => void reconnectProject()}
                disabled={submitting}
              >
                Concluir reconexão
              </button>
            </div>
          )}
        </Card>

        <Card title="Projetos cadastrados">
          {loadingProjects ? (
            <LoadingState message="Carregando projetos..." />
          ) : error ? (
            <ErrorState
              message={error}
              onRetry={loadProjects}
              retryAfterSeconds={retryAfterSeconds}
            />
          ) : projects.length === 0 ? (
            <p className="empty-state">Nenhum projeto cadastrado ainda.</p>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <article className="project-item" key={project.id}>
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
                      {project.githubOwner && project.githubRepo
                        ? `${project.githubOwner}/${project.githubRepo}`
                        : 'não informado'}
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
      </div>
    </main>
  );
}
