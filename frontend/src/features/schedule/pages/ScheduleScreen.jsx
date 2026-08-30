import { useMemo } from 'react';
import { useParams } from 'react-router';
import { ProjectSectionNav } from '../../projects/index.js';
import { FeedbackRegion, LoadingState, ErrorState, ForbiddenState } from '../../../shared/index.js';
import { ScheduleCalendar } from '../components/ScheduleCalendar.jsx';
import { useScheduleData } from '../hooks/useScheduleData.js';

export function ScheduleScreen() {
  const { projectId } = useParams();
  const { project, schedule, milestones, loading, forbidden, error, success, loadAll } =
    useScheduleData(projectId);

  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );

  const unassignedCount = schedule?.unassignedTasks?.length ?? 0;
  const sprintCount = (schedule?.sprints || []).filter(
    (sprint) => sprint.status !== 'CANCELADA'
  ).length;

  if (loading) {
    return (
      <main className="page-container">
        <LoadingState message="Carregando cronograma..." />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container">
        <ForbiddenState message="Você não possui acesso ao cronograma deste projeto." />
      </main>
    );
  }

  if (error && !schedule) {
    return (
      <main className="page-container">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Cronograma{project ? ` — ${project.name}` : ''}</h1>
          <p>
            Agenda do projeto em formato de calendário, com inícios e fins de sprint e de marco,
            prazos e tarefas.
          </p>
          <p className="schedule-summary">
            {sprintCount} no período · {unassignedCount}{' '}
            {unassignedCount === 1 ? 'tarefa sem sprint' : 'tarefas sem sprint'}
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="schedule" />
      </header>
      <FeedbackRegion error={error} success={success} />

      <ScheduleCalendar key={projectId} schedule={schedule} milestoneNames={milestoneNames} />
    </main>
  );
}
