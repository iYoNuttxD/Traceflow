import { ResponsibleCombobox, SelectControl } from '../../../shared/index.js';
import { CollapsibleFilterPanel } from '../../schedule/index.js';
import { priorityLabels } from './kanban-display.js';

export function KanbanFilters({
  filters,
  members,
  activeCount,
  visibleCount,
  scopedCount,
  onChange,
  onClear
}) {
  const resultLabel = activeCount
    ? `${visibleCount} de ${scopedCount} tarefas exibidas`
    : `${scopedCount} ${scopedCount === 1 ? 'tarefa' : 'tarefas'} no recorte`;

  return (
    <CollapsibleFilterPanel
      id="kanban-filters-body"
      title="Buscar e filtrar"
      resultLabel={resultLabel}
      activeCount={activeCount}
      className="kanban-filters"
    >
      {activeCount > 0 && (
        <div className="kanban-filters__actions">
          <button type="button" className="kanban-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}
      <div className="kanban-filters__controls">
        <label className="kanban-filter kanban-filter--search">
          <span>Pesquisar</span>
          <input
            type="search"
            value={filters.search}
            placeholder="Pesquisar tarefa..."
            onChange={(event) => onChange('search', event.target.value)}
          />
        </label>
        <ResponsibleCombobox
          members={members}
          value={filters.responsibleUserId}
          onChange={(value) => onChange('responsibleUserId', value)}
        />

        <label className="kanban-filter">
          <span>Prioridade</span>
          <SelectControl
            value={filters.priority}
            onChange={(event) => onChange('priority', event.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectControl>
        </label>
        <label className="kanban-filter">
          <span>Prazo inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => onChange('startDate', event.target.value)}
          />
        </label>
        <label className="kanban-filter">
          <span>Prazo final</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => onChange('endDate', event.target.value)}
          />
        </label>
      </div>
    </CollapsibleFilterPanel>
  );
}
