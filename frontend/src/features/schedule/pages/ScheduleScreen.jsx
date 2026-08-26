import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ProjectSectionNav } from '../../projects/index.js';
import { FeedbackRegion, LoadingState, ErrorState, ForbiddenState } from '../../../shared/index.js';
import { ScheduleCalendar } from '../components/ScheduleCalendar.jsx';
import { useScheduleData } from '../hooks/useScheduleData.js';

export function ScheduleScreen() {
  const { projectId } = useParams();
  const {
    project,
    schedule,
    milestones,
    loading,
    forbidden,
    error,
    success,
    loadAll,
    refreshSchedule,
    feedback,
    handleFailure,
    fail
  } = useScheduleData(projectId);

  const [period, setPeriod] = useState({ from: '', to: '' });
  const [appliedPeriod, setAppliedPeriod] = useState({ from: '', to: '' });

  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );

  const filtered = Boolean(appliedPeriod.from || appliedPeriod.to);
  const unassignedCount = schedule?.unassignedTasks?.length ?? 0;
  // A contagem acompanha o que o calendário desenha: sprint cancelada saiu das
  // faixas e da legenda, então também não entra no "no período".
  const sprintCount = (schedule?.sprints || []).filter(
    (sprint) => sprint.status !== 'CANCELADA'
  ).length;

  const applyPeriod = async (event) => {
    event.preventDefault();
    if (period.from && period.to && period.from > period.to) {
      fail('A data inicial não pode ser maior que a data final.');
      return;
    }
    setAppliedPeriod(period);
    try {
      await refreshSchedule(period);
      feedback('Período aplicado.');
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível aplicar o período.');
    }
  };

  const clearPeriod = async () => {
    const empty = { from: '', to: '' };
    setPeriod(empty);
    setAppliedPeriod(empty);
    try {
      await refreshSchedule(empty);
      feedback('Período limpo.');
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível limpar o período.');
    }
  };

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
            Agenda do projeto em formato de calendário, com inícios e fins de sprint e prazos de
            marco.
          </p>
          {/* Resumo numerico orienta antes de rolar a pagina. */}
          <p className="schedule-summary">
            {sprintCount} no período · {unassignedCount}{' '}
            {unassignedCount === 1 ? 'tarefa sem sprint' : 'tarefas sem sprint'}
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="schedule" />
      </header>
      <FeedbackRegion error={error} success={success} />

      <section className="card">
        <div className="schedule-card-header">
          <h2>Período exibido</h2>
          {/* O filtro pertence a linha do tempo: e ela que ele recorta. */}
          <form className="schedule-filters" onSubmit={applyPeriod}>
            <label className="field">
              <span>Data inicial</span>
              <input
                type="date"
                value={period.from}
                onChange={(event) => setPeriod({ ...period, from: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Data final</span>
              <input
                type="date"
                value={period.to}
                onChange={(event) => setPeriod({ ...period, to: event.target.value })}
              />
            </label>
            <button className="button button-secondary" type="submit">
              Filtrar
            </button>
            {filtered && (
              <button className="button button-secondary" type="button" onClick={clearPeriod}>
                Limpar
              </button>
            )}
          </form>
        </div>
        <p className="field-help">
          O recorte vale para as faixas e para os eventos do calendário. Sem filtro, o cronograma
          inteiro do projeto é exibido.
        </p>
      </section>

      <ScheduleCalendar key={projectId} schedule={schedule} milestoneNames={milestoneNames} />
    </main>
  );
}
