import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ProjectMembersPanel } from '../../members/index.js';
import {
  ContextualErrorPage,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError
} from '../../../shared/index.js';
import { ProjectAccessCodePanel } from '../components/ProjectAccessCodePanel.jsx';
import { ProjectBreadcrumb } from '../components/ProjectBreadcrumb.jsx';
import { projectsApi } from '../api/projects.api.js';
import '../styles/project-admin.css';
import './ProjectMembersScreen.css';

export function ProjectMembersScreen() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const response = await projectsApi.get(projectId);
      setProject(response.data.project);
    } catch (requestError) {
      setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

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
        onRetry={loadProject}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError?.retryAfterSeconds}
      />
    );
  }

  return (
    <main className="page-container project-admin-screen project-members-screen">
      <ProjectBreadcrumb projectName={project.name} currentLabel="Membros" />
      <header className="project-admin-screen__header">
        <div>
          <h1>Membros do projeto</h1>
          <p>
            Consulte a equipe e, quando permitido, administre membros e acessos de {project.name}.
          </p>
        </div>
        <Link className="project-admin-screen__back" to={`/projects/${project.id}`}>
          Voltar à visão geral
        </Link>
      </header>

      <section className="project-admin-surface" aria-labelledby="project-members-title">
        <h2 id="project-members-title">Equipe</h2>
        <ProjectMembersPanel projectId={projectId} onMembershipLoaded={setCurrentMembership} />
      </section>

      {currentMembership?.role === 'OWNER' && (
        <ProjectAccessCodePanel projectId={projectId} isOwner />
      )}
    </main>
  );
}
