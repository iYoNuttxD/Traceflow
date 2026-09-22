import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { membersApi } from '../../members/index.js';
import {
  BackButton,
  ContextualErrorPage,
  FeedbackRegion,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useAbortableRequest,
  useCountdown,
  useConfirm
} from '../../../shared/index.js';
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
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { refreshProjects } = useProjectsCatalog();
  const [project, setProject] = useState(null);
  const [loadedProjectId, setLoadedProjectId] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pageError, setPageError] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const { run: runProjectLoad } = useAbortableRequest();
  const updateLock = useRef(null);
  const routeProjectIdRef = useRef(projectId);
  routeProjectIdRef.current = projectId;

  const load = useCallback(
    () =>
      runProjectLoad(async (signal) => {
        setLoading(true);
        setPageError(null);
        setError('');
        setSuccess('');
        updateLock.current = null;
        setSubmitting(false);
        try {
          const [projectResponse, membershipData] = await Promise.all([
            projectsApi.get(projectId, { signal }),
            membersApi.list(projectId, { signal })
          ]);
          if (signal.aborted) return;
          const loadedProject = projectResponse.data.project;
          setProject(loadedProject);
          setCurrentMembership(membershipData.currentMembership || null);
          setFormData(toFormData(loadedProject));
          setLoadedProjectId(projectId);
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setProject(null);
          setCurrentMembership(null);
          setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
          setLoadedProjectId(projectId);
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      }),
    [projectId, runProjectLoad]
  );

  useEffect(() => {
    void load();
  }, [load]);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (updateLock.current || cooldown > 0) return;
    const operation = Symbol('project-update');
    const requestedProjectId = projectId;
    updateLock.current = operation;
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
      if (routeProjectIdRef.current === requestedProjectId) {
        setProject(response.data.project);
        setFormData(toFormData(response.data.project));
        setSuccess(response.data.message);
      }
      await refreshProjects();
    } catch (requestError) {
      if (routeProjectIdRef.current === requestedProjectId) {
        const normalized = normalizeApiError(requestError, 'Não foi possível atualizar o projeto.');
        setError(normalized.message);
        setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      }
    } finally {
      if (updateLock.current === operation) {
        updateLock.current = null;
        if (routeProjectIdRef.current === requestedProjectId) setSubmitting(false);
      }
    }
  }

  async function handleDeleteProject() {
    if (deleting || submitting) return;
    const confirmed = await confirm({
      title: `Excluir ${project.name}?`,
      description:
        'O projeto ficará indisponível imediatamente. Os dados serão preservados por 30 dias antes da exclusão definitiva, e um proprietário poderá recuperá-lo nesse período.',
      confirmationText: project.name,
      confirmLabel: 'Excluir projeto',
      destructive: true
    });
    if (!confirmed) return;

    setDeleting(true);
    setError('');
    try {
      await projectsApi.requestDeletion(project.id);
      await refreshProjects();
      navigate('/projects?projectDeletion=scheduled', { replace: true });
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível excluir o projeto.');
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      setDeleting(false);
    }
  }

  if (loading || String(loadedProjectId) !== String(projectId)) {
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
      <div className="project-admin-screen__return">
        <BackButton to={`/projects/${project.id}`} label="Voltar para visão geral" />
      </div>
      <header className="project-admin-screen__header">
        <div>
          <h1>Editar projeto</h1>
          <p>Atualize os dados de {project.name} sem alterar suas integrações ou permissões.</p>
        </div>
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

      <section
        className="project-admin-surface project-danger-zone"
        aria-labelledby="project-danger-zone-title"
      >
        <div>
          <h2 id="project-danger-zone-title">Zona de perigo</h2>
          <p>
            Excluir o projeto o tornará indisponível para a equipe. Os dados serão apagados
            definitivamente após 30 dias; durante esse período, um proprietário poderá recuperá-lo.
          </p>
        </div>
        <button
          className="button button-danger"
          type="button"
          disabled={deleting || submitting || cooldown > 0}
          aria-busy={deleting}
          onClick={() => void handleDeleteProject()}
        >
          {deleting ? 'Excluindo...' : 'Excluir projeto'}
        </button>
      </section>
    </main>
  );
}
