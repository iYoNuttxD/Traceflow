import { useCallback, useEffect, useRef, useState } from 'react';
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

const memberTabs = {
  team: {
    label: 'Equipe',
    tabId: 'project-members-team-tab',
    panelId: 'project-members-team-panel'
  },
  invitations: {
    label: 'Convites',
    tabId: 'project-members-invitations-tab',
    panelId: 'project-members-invitations-panel'
  }
};

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
  const tabRefs = useRef({});
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

  const availableTabs = currentMembership?.role === 'OWNER' ? ['team', 'invitations'] : ['team'];

  function handleTabKeyDown(event, currentTab) {
    const currentIndex = availableTabs.indexOf(currentTab);
    let nextIndex;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % availableTabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = availableTabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = availableTabs[nextIndex];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
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

      <div
        className="internal-tabs project-members-tabs"
        role="tablist"
        aria-label="Membros"
        aria-orientation="horizontal"
      >
        {availableTabs.map((tab) => (
          <button
            id={memberTabs[tab].tabId}
            className={`internal-tab ${activeTab === tab ? 'internal-tab--active' : ''}`}
            key={tab}
            ref={(element) => {
              tabRefs.current[tab] = element;
            }}
            type="button"
            role="tab"
            tabIndex={activeTab === tab ? 0 : -1}
            aria-selected={activeTab === tab}
            aria-controls={memberTabs[tab].panelId}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, tab)}
          >
            {memberTabs[tab].label}
          </button>
        ))}
      </div>

      <section
        id={memberTabs[activeTab].panelId}
        className="project-admin-surface project-members-surface"
        role="tabpanel"
        aria-labelledby={memberTabs[activeTab].tabId}
      >
        <h2>{memberTabs[activeTab].label}</h2>
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
      {availableTabs
        .filter((tab) => tab !== activeTab)
        .map((tab) => (
          <section
            id={memberTabs[tab].panelId}
            key={tab}
            role="tabpanel"
            aria-labelledby={memberTabs[tab].tabId}
            hidden
          />
        ))}
    </main>
  );
}
