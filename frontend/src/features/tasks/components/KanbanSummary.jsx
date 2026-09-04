import { KanbanSprintFilter } from './KanbanSprintFilter.jsx';

export function KanbanSummary({
  summary,
  sprints,
  selectedSprintIds,
  statusLabels,
  onToggleSprint,
  onClearSprints
}) {
  const metrics = [
    { label: 'Total', value: summary.total },
    { label: 'A fazer', value: summary.A_FAZER },
    { label: 'Em andamento', value: summary.EM_ANDAMENTO },
    { label: 'Concluídas', value: summary.CONCLUIDO }
  ];

  return (
    <section className="kanban-summary" aria-labelledby="kanban-summary-title">
      <header className="kanban-summary__heading">
        <div>
          <h2 id="kanban-summary-title">Resumo</h2>
          <p>Visão geral do recorte atual do quadro.</p>
        </div>
      </header>
      <div className="kanban-summary__metrics">
        {metrics.map((metric) => (
          <div className="kanban-summary__metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
        <div className="kanban-summary__metric kanban-summary__metric--sprint">
          <span>Sprint visualizada</span>
          <KanbanSprintFilter
            sprints={sprints}
            selectedIds={selectedSprintIds}
            statusLabels={statusLabels}
            onToggle={onToggleSprint}
            onClear={onClearSprints}
          />
        </div>
      </div>
    </section>
  );
}
