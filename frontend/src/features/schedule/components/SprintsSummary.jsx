import { buildSprintSummary } from './sprint-view.js';
import { formatSprintCardPeriod } from './schedule-display.js';

function Metric({ label, value, detail, active = false }) {
  return (
    <div className={`sprints-summary__metric${active ? ' sprints-summary__metric--active' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function SprintsSummary({ sprints, scheduleById }) {
  const summary = buildSprintSummary(sprints, scheduleById);
  const active = summary.active;
  const activeTasks = summary.activeTasks;
  const activeDetail = active
    ? `${formatSprintCardPeriod(active)} · ${activeTasks.total} ${activeTasks.total === 1 ? 'tarefa' : 'tarefas'} · ${activeTasks.points} pts`
    : 'Nenhuma sprint em execução';

  return (
    <section className="sprints-summary" aria-labelledby="sprints-summary-title">
      <div className="sprints-summary__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2 id="sprints-summary-title">Visão geral das sprints</h2>
        </div>
        <p>Estado atual do planejamento do projeto.</p>
      </div>
      <div className="sprints-summary__metrics">
        <Metric
          label="Total"
          value={summary.total}
          detail={summary.total === 1 ? 'sprint' : 'sprints'}
        />
        <Metric label="Planejadas" value={summary.planned} />
        <Metric
          label="Em andamento"
          value={active?.name || (summary.activeCount > 1 ? summary.activeCount : 'Nenhuma')}
          detail={activeDetail}
          active={Boolean(active)}
        />
        <Metric label="Concluídas" value={summary.completed} />
        <Metric label="Canceladas" value={summary.cancelled} />
      </div>
    </section>
  );
}
