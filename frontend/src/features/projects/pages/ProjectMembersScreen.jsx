import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ProjectMembersPanel } from '../../members/index.js';
import {
  BackButton,
  ContextualErrorPage,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useAbortableRequest
} from '../../../shared/index.js';
import { ProjectAccessCodePanel } from '../components/ProjectAccessCodePanel.jsx';
import { useProjectsCatalog } from '../hooks/ProjectsCatalogContext.jsx';
import { projectsApi } from '../api/projects.api.js';
import '../../../shared/styles/internal-tabs.css';
import '../styles/project-admin.css';
import '../styles/project-tabs.css';
import './ProjectMembersScreen.css';

export function ProjectMembersScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { refreshProjects } = useProjectsCatalog();
  const [project, setProject] = useState(null);
  const [loadedProjectId, setLoadedProjectId] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [activeTab, setActiveTab] = useState('team');
  const { run: runProjectLoad } = useAbortableRequest();

  const loadProject = useCallback(
    () =>
      runProjectLoad(async (signal) => {
        setLoading(true);
        setPageError(null);
        setCurrentMembership(null);
        setActiveTab('team');
        try {
          const response = await projectsApi.get(projectId, { signal });
          if (signal.aborted) return;
          setProject(response.data.project);
          setLoadedProjectId(projectId);
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setProject(null);
          setPageError(normalizeApiError(requestError, 'Não foi possível carregar o projeto.'));
          setLoadedProjectId(projectId);
        } finally {
          if (!signal.aborted) setLoading(false);
        }
      }),
    [projectId, runProjectLoad]
  );

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const handleLeftProject = useCallback(() => {
    void refreshProjects();
    navigate('/projects', { replace: true });
  }, [navigate, refreshProjects]);

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
        onRetry={loadProject}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError?.retryAfterSeconds}
      />
    );
  }

  return (
    <main className="page-container project-admin-screen project-members-screen">
      <div className="project-admin-screen__return">
        <BackButton to={`/projects/${project.id}`} label="Voltar para visão geral" />
      </div>
      <header className="project-admin-screen__header">
        <div>
          <h1>Membros do projeto</h1>
          <p>Gerencie a equipe, os convites e as formas de acesso ao projeto.</p>
        </div>
      </header>

      <nav className="internal-tabs project-members-tabs" role="tablist" aria-label="Membros">
        <button
          id="project-members-team-tab"
          className={`internal-tab ${activeTab === 'team' ? 'internal-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'team'}
          aria-controls="project-members-team-panel"
          onClick={() => setActiveTab('team')}
        >
          Equipe
        </button>
        {currentMembership?.role === 'OWNER' && (
          <button
            id="project-members-invitations-tab"
            className={`internal-tab ${activeTab === 'invitations' ? 'internal-tab--active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === 'invitations'}
            aria-controls="project-members-invitations-panel"
            onClick={() => setActiveTab('invitations')}
          >
            Convites
          </button>
        )}
      </nav>

      <section
        id={`project-members-${activeTab}-panel`}
        className="project-admin-surface project-members-surface"
        role="tabpanel"
        aria-labelledby={`project-members-${activeTab === 'team' ? 'team' : 'invitations'}-tab`}
      >
        <h2>{activeTab === 'team' ? 'Equipe' : 'Convites'}</h2>
        <ProjectMembersPanel
          key={projectId}
          projectId={projectId}
          activeView={activeTab}
          onMembershipLoaded={setCurrentMembership}
          onLeftProject={handleLeftProject}
        />
        {activeTab === 'invitations' && currentMembership?.role === 'OWNER' && (
          <ProjectAccessCodePanel projectId={projectId} isOwner />
        )}
      </section>
    </main>
  );
}
