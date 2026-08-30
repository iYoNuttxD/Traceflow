import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { membersApi } from '../../members/index.js';
import {
  ContextualErrorPage,
  FeedbackRegion,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import { ProjectBreadcrumb } from '../components/ProjectBreadcrumb.jsx';
import { ProjectForm, emptyProjectForm, updateProjectForm } from '../components/ProjectForm.jsx';
import { useProjectsCatalog } from '../hooks/ProjectsCatalogContext.jsx';
import { projectsApi } from '../api/projects.api.js';
import '../styles/project-admin.css';

function toFormData(project) {
  return {
    ...emptyProjectForm,
    name: project.name || '',
    description: project.description || '',
    responsibleTeam: project.responsibleTeam || '',
    status: project.status || 'ATIVO'
  };
}

export function ProjectEditScreen() {
  const { projectId } = useParams();
  const { refreshProjects } = useProjectsCatalog();
  const [project, setProject] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const updateLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [projectResponse, membershipData] = await Promise.all([
        projectsApi.get(projectId),
        membersApi.list(projectId)
      ]);
      const loadedProject = projectResponse.data.project;
      setProject(loadedProject);
      setCurrentMembership(membershipData.currentMembership || null);
      setFormData(toFormData(loadedProject));
    } catch (requestError) {
      setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (updateLock.current || cooldown > 0) return;
    updateLock.current = true;
    setSubmitting(true);
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);

    try {
      const response = await projectsApi.update(projectId, {
        name: formData.name,
        description: formData.description,
        responsibleTeam: formData.responsibleTeam,
        status: formData.status
      });
      setProject(response.data.project);
      setFormData(toFormData(response.data.project));
      setSuccess(response.data.message);
      await refreshProjects();
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível atualizar o projeto.');
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      updateLock.current = false;
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page-container project-admin-screen">
        <p className="project-admin-screen__loading" role="status">
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
        onRetry={load}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError?.retryAfterSeconds}
      />
    );
  }

  if (currentMembership?.role !== 'OWNER') {
    return (
      <ContextualErrorPage
        type={PAGE_ERROR_TYPES.FORBIDDEN}
        showRetry={false}
        secondaryAction={{ label: 'Voltar ao projeto', href: `/projects/${project.id}` }}
      />
    );
  }

  return (
    <main className="page-container project-admin-screen">
      <ProjectBreadcrumb projectName={project.name} currentLabel="Editar" />
      <header className="project-admin-screen__header">
        <div>
          <h1>Editar projeto</h1>
          <p>Atualize os dados de {project.name} sem alterar suas integrações ou permissões.</p>
        </div>
        <Link className="project-admin-screen__back" to={`/projects/${project.id}`}>
          Voltar à visão geral
        </Link>
      </header>

      <FeedbackRegion
        error={cooldown ? undefined : error}
        rateLimit={cooldown ? error : undefined}
        retryAfterSeconds={retryAfterSeconds}
        success={success}
      />

      <section className="project-admin-surface" aria-labelledby="project-edit-form-title">
        <h2 id="project-edit-form-title">Dados do projeto</h2>
        <ProjectForm
          formData={formData}
          onChange={handleChange}
          onSubmit={handleSubmit}
          submitLabel="Salvar alterações"
          submitting={submitting}
          showRepositoryField={false}
        />
      </section>
    </main>
  );
}
