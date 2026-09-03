import { formatInstant } from './schedule-display.js';
import { buildMilestoneSummary } from './milestone-view.js';

function Metric({ label, value, detail, emphasis = false }) {
  return (
    <div
      className={`milestones-summary__metric${emphasis ? ' milestones-summary__metric--emphasis' : ''}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function MilestonesSummary({ milestones, now }) {
  const summary = buildMilestoneSummary(milestones, now);
  const next = summary.nextDeadline;

  return (
    <section className="milestones-summary" aria-labelledby="milestones-summary-title">
      <div className="milestones-summary__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2 id="milestones-summary-title">Visão geral dos marcos</h2>
        </div>
        <p>Entregas abertas, concluídas e prazos do projeto.</p>
      </div>
      <div className="milestones-summary__metrics">
        <Metric
          label="Total"
          value={summary.total}
          detail={summary.total === 1 ? 'marco' : 'marcos'}
        />
        <Metric label="Em aberto" value={summary.open} />
        <Metric label="Concluídos" value={summary.completed} />
        <Metric label="Atrasados" value={summary.overdue} emphasis={summary.overdue > 0} />
        <Metric
          label="Próximo prazo"
          value={next?.title || 'Nenhum'}
          detail={next ? formatInstant(next.dueDate) : 'Nenhum prazo futuro em aberto'}
        />
      </div>
    </section>
  );
}
