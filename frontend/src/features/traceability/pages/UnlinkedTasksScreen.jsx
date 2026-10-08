import { Link, useParams } from 'react-router';
import {
  ContextualErrorPage,
  EmptyState,
  ErrorState,
  LoadingState,
  SelectControl,
  classifyPageError,
  getErrorRequestId
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { TraceabilitySubnav } from '../components/TraceabilitySubnav.jsx';
import { useAlertSummary } from '../hooks/useAlertSummary.js';
import { useUnlinkedTasks } from '../hooks/useUnlinkedTasks.js';
import { TASK_STATUSES, taskStatusLabel, unlinkedCountLabel } from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './UnlinkedTasksScreen.css';

export function UnlinkedTasksScreen() {
  const { projectId } = useParams();
  return <ProjectUnlinkedTasks key={projectId} projectId={projectId} />;
}

function ProjectUnlinkedTasks({ projectId }) {
  const tasks = useUnlinkedTasks(projectId);
  const { summary } = useAlertSummary(projectId);

  if (!tasks.loading && !tasks.data && tasks.error)
    return (
      <ContextualErrorPage
        type={classifyPageError(tasks.error)}
        description={tasks.error.message}
        requestId={getErrorRequestId(tasks.error)}
        retryAfterSeconds={tasks.error.retryAfterSeconds}
        onRetry={tasks.retry}
      />
    );

  return (
    <main className="page-container sprints-screen traceability-page">
      <div className="trace-alerts-content">
        <header className="page-header sprints-screen__header">
          <div>
            <span className="eyebrow">Rastreabilidade</span>
            <h1>Tarefas sem vínculo técnico</h1>
            <p>Tarefas sem commit, pull request ou issue vinculados.</p>
          </div>
          <ProjectSectionNav projectId={projectId} activeSection="traceability" />
        </header>
        <TraceabilitySubnav
          projectId={projectId}
          active="unlinked"
          openAlerts={summary?.open.total}
        />
        <section className="sprints-summary unlinked-tasks__toolbar" aria-label="Filtro de tarefas">
          <label className="sprint-filter">
            <span>Status</span>
            <SelectControl
              value={tasks.status}
              onChange={(event) => tasks.changeStatus(event.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(TASK_STATUSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectControl>
          </label>
          <p className="unlinked-tasks__count" aria-live="polite">
            {unlinkedCountLabel(tasks.data?.pagination.total)}
          </p>
        </section>
        <section className="sprint-grid-section" aria-label="Tarefas sem vínculo técnico">
          <ul className="unlinked-tasks__list">
            {tasks.data?.tasks.map((task) => (
              <li key={task.id} className="sprint-card unlinked-tasks__item">
                <div className="unlinked-tasks__body">
                  <p className="trace-alert-subject">
                    <span className="trace-alert-subject__code">{task.code}</span>
                    {task.title}
                  </p>
                  <p className="trace-alert-meta">
                    {taskStatusLabel(task.status)} · {task.responsible?.name || 'Sem responsável'} ·{' '}
                    {task.requirement?.code || 'Sem requisito'}
                  </p>
                </div>
                <Link
                  className="button button-secondary"
                  to={`/projects/${projectId}/kanban?task=${task.id}`}
                  aria-label={`Abrir ${task.code} no Kanban`}
                >
                  Abrir no Kanban
                </Link>
              </li>
            ))}
          </ul>
          {tasks.loading && <LoadingState message="Carregando tarefas..." />}
          {tasks.error && (
            <ErrorState
              message={tasks.error.message}
              retryAfterSeconds={tasks.error.retryAfterSeconds}
              onRetry={tasks.retry}
            />
          )}
          {!tasks.loading && !tasks.error && tasks.data?.tasks.length === 0 && (
            <EmptyState
              title={
                tasks.status
                  ? 'Nenhuma tarefa sem vínculo técnico com este status.'
                  : 'Todas as tarefas têm ao menos um vínculo técnico.'
              }
            />
          )}
          {tasks.data?.pagination.page < tasks.data?.pagination.totalPages && !tasks.error && (
            <button
              type="button"
              className="button button-secondary trace-alert-load-more"
              disabled={tasks.loading}
              onClick={tasks.more}
            >
              Carregar mais tarefas
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
