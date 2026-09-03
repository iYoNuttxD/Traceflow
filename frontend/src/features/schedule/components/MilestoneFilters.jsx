import { TraceFlowIcon } from '../../../shared/index.js';
import { CollapsibleFilterPanel } from './CollapsibleFilterPanel.jsx';
import { SearchCombobox } from './SearchCombobox.jsx';
import { formatSprintCardPeriod, sprintStatusLabels } from './schedule-display.js';
import { hasMilestoneFilters } from './milestone-view.js';

const sprintLabel = (sprint) => sprint.name;

export function MilestoneFilters({
  filters,
  sprints,
  selectedSprint,
  total,
  filteredTotal,
  onChange,
  onClear
}) {
  const active = hasMilestoneFilters(filters);
  const activeCount = Object.entries(filters).filter(([field, value]) =>
    field === 'search' ? Boolean(value.trim()) : Boolean(value)
  ).length;
  const resultLabel = active ? `${filteredTotal} de ${total} marcos` : `${total} marcos`;

  return (
    <CollapsibleFilterPanel
      id="milestone-filters-controls"
      className="milestone-filters"
      resultLabel={resultLabel}
      activeCount={activeCount}
    >
      {active && (
        <div className="planning-filter-panel__actions">
          <button type="button" className="milestone-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}

      <div className="milestone-filters__controls">
        <label className="milestone-filter milestone-filter--search">
          <span>Pesquisar</span>
          <span className="milestone-search-input">
            <TraceFlowIcon name="search" />
            <input
              type="search"
              value={filters.search}
              placeholder="Pesquisar marco..."
              onChange={(event) => onChange('search', event.target.value)}
            />
          </span>
        </label>

        <label className="milestone-filter">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            <option value="">Todos</option>
            <option value="PENDENTE">Em aberto</option>
            <option value="CONCLUIDO">Concluídos</option>
          </select>
        </label>

        <label className="milestone-filter">
          <span>Situação do prazo</span>
          <select
            value={filters.deadlineHealth}
            onChange={(event) => onChange('deadlineHealth', event.target.value)}
          >
            <option value="">Todas</option>
            <option value="EM_DIA">Em dia</option>
            <option value="ATRASADO">Atrasado</option>
            <option value="CONCLUIDO">Concluído</option>
          </select>
        </label>

        <SearchCombobox
          id="milestones-filter-sprint"
          label="Sprint relacionada"
          placeholder="Pesquisar sprint..."
          options={sprints}
          selectedOption={selectedSprint}
          getOptionLabel={sprintLabel}
          onSelect={(sprint) => onChange('sprintId', sprint.id, sprint)}
          onClear={() => onChange('sprintId', null, null)}
          emptyMessage="Nenhuma sprint encontrada."
          renderOption={(sprint) => (
            <span className="milestone-sprint-option">
              <strong>{sprint.name}</strong>
              <span>
                {formatSprintCardPeriod(sprint)} ·{' '}
                {sprintStatusLabels[sprint.status] || sprint.status}
              </span>
            </span>
          )}
        />

        <label className="milestone-filter">
          <span>Prazo inicial</span>
          <input
            type="date"
            value={filters.dueFrom}
            onChange={(event) => onChange('dueFrom', event.target.value)}
          />
        </label>
        <label className="milestone-filter">
          <span>Prazo final</span>
          <input
            type="date"
            value={filters.dueTo}
            onChange={(event) => onChange('dueTo', event.target.value)}
          />
        </label>
      </div>
    </CollapsibleFilterPanel>
  );
}
