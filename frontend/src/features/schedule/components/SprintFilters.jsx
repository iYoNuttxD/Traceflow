import { TraceFlowIcon } from '../../../shared/index.js';
import { CollapsibleFilterPanel } from './CollapsibleFilterPanel.jsx';
import { SearchCombobox } from './SearchCombobox.jsx';
import { hasSprintFilters } from './sprint-view.js';

const milestoneLabel = (milestone) => milestone.title;
const taskLabel = (task) => `#${task.id} ${task.title}`;

export function SprintFilters({
  filters,
  milestones,
  selectedMilestone,
  selectedTask,
  total,
  filteredTotal,
  onChange,
  onTaskSearch,
  onClear
}) {
  const active = hasSprintFilters(filters);
  const activeCount = Object.entries(filters).filter(([field, value]) =>
    field === 'search' ? Boolean(value.trim()) : Boolean(value)
  ).length;
  const resultLabel = active ? `${filteredTotal} de ${total} sprints` : `${total} sprints`;

  return (
    <CollapsibleFilterPanel
      id="sprint-filters-controls"
      className="sprint-filters"
      resultLabel={resultLabel}
      activeCount={activeCount}
    >
      {active && (
        <div className="planning-filter-panel__actions">
          <button type="button" className="sprint-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}

      <div className="sprint-filters__controls">
        <label className="sprint-filter sprint-filter--search">
          <span>Pesquisar</span>
          <span className="sprint-search-input">
            <TraceFlowIcon name="search" />
            <input
              type="search"
              value={filters.search}
              placeholder="Pesquisar sprint..."
              onChange={(event) => onChange('search', event.target.value)}
            />
          </span>
        </label>

        <label className="sprint-filter">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            <option value="">Todos</option>
            <option value="PLANEJADA">Planejada</option>
            <option value="EM_ANDAMENTO">Em andamento</option>
            <option value="CONCLUIDA">Concluída</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </label>

        <SearchCombobox
          id="sprints-filter-milestone"
          label="Marco"
          placeholder="Pesquisar marco..."
          options={milestones}
          selectedOption={selectedMilestone}
          getOptionLabel={milestoneLabel}
          onSelect={(milestone) => onChange('milestoneId', milestone.id)}
          onClear={() => onChange('milestoneId', null)}
          emptyMessage="Nenhum marco encontrado."
        />

        <SearchCombobox
          id="sprints-filter-task"
          label="Tarefa relacionada"
          placeholder="Pesquisar tarefa..."
          selectedOption={selectedTask}
          getOptionLabel={taskLabel}
          onSearch={onTaskSearch}
          onSelect={(task) => onChange('taskId', task.id, task)}
          onClear={() => onChange('taskId', null, null)}
          emptyMessage="Nenhuma tarefa encontrada."
          renderOption={(task) => (
            <span className="sprint-task-option">
              <strong>{taskLabel(task)}</strong>
              <span className="sprint-task-option__metadata">
                {task.status || 'Status não informado'}
              </span>
            </span>
          )}
        />

        <label className="sprint-filter">
          <span>Data inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => onChange('startDate', event.target.value)}
          />
        </label>
        <label className="sprint-filter">
          <span>Data final</span>
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
