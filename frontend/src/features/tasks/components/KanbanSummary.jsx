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
    { label: 'Prioridade crítica', value: summary.criticalPriority },
    { label: 'Atrasadas', value: summary.overdue },
    { label: 'Sem rastreabilidade', value: summary.untraced }
  ];

  return (
    <section className="kanban-summary" aria-labelledby="kanban-summary-title">
      <header className="kanban-summary__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2 id="kanban-summary-title">Visão geral do Kanban</h2>
        </div>
        <p>Estado atual do quadro e do recorte visualizado.</p>
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
