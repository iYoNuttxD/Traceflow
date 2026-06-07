import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/api.js';
import { Card } from '../components/Card.jsx';
import {
  ProjectForm,
  applyRepositoryToProjectForm,
  emptyProjectForm,
  normalizeRepository,
  updateProjectForm
} from '../components/ProjectForm.jsx';

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRepositories, setLoadingRepositories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError('');

    try {
      const response = await api.get('/projects');
      setProjects(response.data.projects);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível carregar os projetos.'));
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  const loadRepositories = useCallback(async () => {
    setLoadingRepositories(true);
    setRepositoriesError('');

    try {
      const response = await api.get('/github/repositories');
      const validRepositories = (response.data.repositories || [])
        .map(normalizeRepository)
        .filter(
          (repository) =>
            repository.owner &&
            repository.name &&
            repository.fullName &&
            repository.url
        );
      setRepositories(validRepositories);
    } catch {
      setRepositories([]);
      setRepositoriesError('Não foi possível carregar os repositórios do GitHub.');
    } finally {
      setLoadingRepositories(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadRepositories();
  }, [loadProjects, loadRepositories]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleRepositoryChange(fullName) {
    const selectedRepository = repositories.find(
      (repository) => normalizeRepository(repository).fullName === fullName
    );

    if (!selectedRepository) {
      setFormData((current) => ({
        ...current,
        githubOwner: '',
        githubRepo: '',
        githubUrl: ''
      }));
      return;
    }

    setFormData((current) => applyRepositoryToProjectForm(current, selectedRepository));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.githubOwner || !formData.githubRepo || !formData.githubUrl) {
      setError('Selecione um repositório GitHub para criar o projeto.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.post('/projects', formData);
      setSuccess(response.data.message);
      setFormData(emptyProjectForm);
      await loadProjects();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível cadastrar o projeto.'));
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

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="projects-layout">
        <Card title="Cadastrar projeto">
          <ProjectForm
            formData={formData}
            repositories={repositories}
            loadingRepositories={loadingRepositories}
            repositoriesError={repositoriesError}
            onChange={handleChange}
            onRepositoryChange={handleRepositoryChange}
            onSubmit={handleSubmit}
            submitLabel="Cadastrar projeto"
            submitting={submitting}
          />
        </Card>

        <Card title="Projetos cadastrados">
          {loadingProjects ? (
            <p className="empty-state">Carregando projetos...</p>
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
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
