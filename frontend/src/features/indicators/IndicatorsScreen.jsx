import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ProjectSectionNav, useProjectsCatalog } from '../projects/index.js';
import { getProjectGithubSyncStatus } from '../github/index.js';
import { ContextualErrorPage, LoadingState, PAGE_ERROR_TYPES } from '../../shared/index.js';
import { DashboardPanel } from './DashboardPanel.jsx';
import './IndicatorsScreen.css';

function ProjectIndicators({ project }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let observedRun = null;
    let probeGeneration = 0;
    let consecutiveFailures = 0;
    async function probe() {
      const generation = ++probeGeneration;
      try {
        const { run } = await getProjectGithubSyncStatus(project.id, { signal: controller.signal });
        if (controller.signal.aborted || generation !== probeGeneration) return;
        consecutiveFailures = 0;
        if (run && ['QUEUED', 'RUNNING'].includes(run.status)) {
          observedRun = run.id;
          timer = window.setTimeout(probe, 2500);
        } else if (observedRun && run?.id === observedRun) {
          observedRun = null;
          setRefreshVersion((n) => n + 1);
        }
      } catch {
        if (controller.signal.aborted || generation !== probeGeneration) return;
        // Retry transient reads without replacing aggregate data or polling forever offline.
        if (consecutiveFailures < 3) {
          timer = window.setTimeout(probe, 2500 * 2 ** consecutiveFailures);
          consecutiveFailures += 1;
        }
      }
    }
    void probe();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [project.id]);
  return <DashboardPanel projectId={project.id} refreshVersion={refreshVersion} />;
}

export function IndicatorsScreen() {
  const { projectId } = useParams();
  const { projects, loading, error, refreshProjects } = useProjectsCatalog();
  const project = projects.find((p) => String(p.id) === projectId);
  return (
    <main className="page-container indicators-screen">
      <header className="page-header indicators-screen__header">
        <div>
          <span className="eyebrow">Indicadores</span>
          <h1>Indicadores</h1>
          <p>Acompanhe a evolução, a qualidade e a saúde do projeto.</p>
        </div>
      </header>
      <ProjectSectionNav projectId={projectId} activeSection="indicators" />
      {loading ? (
        <LoadingState message="Carregando contexto do projeto..." />
      ) : error ? (
        <ContextualErrorPage embedded error={error} onRetry={refreshProjects} />
      ) : !project ? (
        <ContextualErrorPage embedded type={PAGE_ERROR_TYPES.NOT_FOUND} showRetry={false} />
      ) : (
        <ProjectIndicators key={projectId} project={project} />
      )}
    </main>
  );
}
