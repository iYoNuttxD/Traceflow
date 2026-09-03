import { useParams } from 'react-router';
import { ProjectSectionNav } from '../../projects/index.js';
import { FeedbackRegion, LoadingState, ErrorState, ForbiddenState } from '../../../shared/index.js';
import { ScheduleCalendar } from '../components/ScheduleCalendar.jsx';
import { useScheduleData } from '../hooks/useScheduleData.js';
import '../styles/schedule.css';
import './ScheduleScreen.css';

export function ScheduleScreen() {
  const { projectId } = useParams();
  const { project, schedule, loading, forbidden, error, success, loadAll } =
    useScheduleData(projectId);

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
    <main className="page-container schedule-screen">
      <header className="page-header schedule-screen__header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Cronograma{project ? ` — ${project.name}` : ''}</h1>
          <p>
            Visualize períodos de Sprints, prazos de Marcos e deadlines de tarefas em uma única
            linha temporal operacional.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="schedule" />
      </header>
      <FeedbackRegion error={error} success={success} />

      <ScheduleCalendar key={projectId} schedule={schedule} />
    </main>
  );
}
