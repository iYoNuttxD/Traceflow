import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ProjectMembersPanel } from '../../members/index.js';
import {
  BackButton,
  ContextualErrorPage,
  PAGE_ERROR_TYPES,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError
} from '../../../shared/index.js';
import { ProjectAccessCodePanel } from '../components/ProjectAccessCodePanel.jsx';
import { projectsApi } from '../api/projects.api.js';
import '../styles/project-admin.css';
import '../styles/project-tabs.css';
import './ProjectMembersScreen.css';

export function ProjectMembersScreen() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [activeTab, setActiveTab] = useState('team');

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
      <div className="project-admin-screen__return">
        <BackButton to={`/projects/${project.id}`} label="Voltar para visão geral" />
      </div>
      <header className="project-admin-screen__header">
        <div>
          <h1>Membros do projeto</h1>
          <p>Gerencie a equipe, os convites e as formas de acesso ao projeto.</p>
        </div>
      </header>

      <nav className="project-tabs project-members-tabs" role="tablist" aria-label="Membros">
        <button
          id="project-members-team-tab"
          className={`project-tab ${activeTab === 'team' ? 'project-tab--active' : ''}`}
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
            className={`project-tab ${activeTab === 'invitations' ? 'project-tab--active' : ''}`}
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
          projectId={projectId}
          activeView={activeTab}
          onMembershipLoaded={setCurrentMembership}
        />
        {activeTab === 'invitations' && currentMembership?.role === 'OWNER' && (
          <ProjectAccessCodePanel projectId={projectId} isOwner />
        )}
      </section>
    </main>
  );
}
