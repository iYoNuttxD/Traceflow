import { TraceFlowIcon } from '../../../shared/index.js';
import { SearchCombobox } from './SearchCombobox.jsx';
import {
  formatSprintCardPeriod,
  isTerminalSprint,
  sprintStatusLabels,
  sprintStatusKey,
  sprintStatusKeyLabels,
  statusBadgeClass
} from './schedule-display.js';

const sprintLabel = (sprint) => sprint.name;

export function MilestoneSprintSelector({
  id = 'milestone-sprint-search',
  sprints = [],
  selectedSprintIds = [],
  milestoneNames = {},
  editingMilestoneId = null,
  disabled = false,
  onChange
}) {
  const selected = selectedSprintIds
    .map((sprintId) => sprints.find((sprint) => Number(sprint.id) === Number(sprintId)))
    .filter(Boolean);
  const selectedIds = new Set(selected.map((sprint) => Number(sprint.id)));
  const options = sprints.filter((sprint) => !selectedIds.has(Number(sprint.id)));

  const otherMilestone = (sprint) =>
    sprint.milestoneId && Number(sprint.milestoneId) !== Number(editingMilestoneId)
      ? sprint.milestone?.deletedAt
        ? `${sprint.milestone.title} · Excluído`
        : milestoneNames[sprint.milestoneId] || 'outro marco'
      : null;

  const remove = (sprint) => {
    if (isTerminalSprint(sprint.status)) return;
    onChange(selectedSprintIds.filter((sprintId) => Number(sprintId) !== Number(sprint.id)));
  };

  return (
    <fieldset className="milestone-sprint-selector">
      <legend>Sprints do marco</legend>
      <p className="field-help">
        Pesquise por nome. Sprints abertas de outro marco serão movidas ao salvar; sprints
        concluídas ou canceladas não podem mudar de marco.
      </p>

      <SearchCombobox
        id={id}
        label="Pesquisar Sprints"
        placeholder="Pesquisar Sprints..."
        options={options}
        disabled={disabled}
        getOptionLabel={sprintLabel}
        isOptionDisabled={(sprint) => isTerminalSprint(sprint.status)}
        onSelect={(sprint) => onChange([...selectedSprintIds, sprint.id])}
        emptyMessage="Nenhuma Sprint encontrada."
        help={
          sprints.length
            ? 'Digite ao menos 2 caracteres para pesquisar.'
            : 'Nenhuma Sprint cadastrada neste projeto.'
        }
        renderOption={(sprint) => {
          const frozen = isTerminalSprint(sprint.status);
          const previous = otherMilestone(sprint);
          return (
            <span className="milestone-sprint-option">
              <strong>{sprint.name}</strong>
              <span>
                {formatSprintCardPeriod(sprint)} ·{' '}
                {sprintStatusLabels[sprint.status] || sprint.status}
              </span>
              {frozen && <small>Não pode mudar de marco.</small>}
              {!frozen && previous && <small>Pertence ao Marco {previous} — será movida.</small>}
            </span>
          );
        }}
      />

      <div className="milestone-sprint-selector__selected">
        <div className="milestone-sprint-selector__heading">
          <strong>Sprints selecionadas ({selected.length})</strong>
          <span role="status">
            {selected.length}{' '}
            {selected.length === 1 ? 'Sprint selecionada' : 'Sprints selecionadas'}
          </span>
        </div>

        {selected.length === 0 ? (
          <p className="milestone-sprint-selector__empty">Nenhuma Sprint selecionada.</p>
        ) : (
          <ul className="milestone-sprint-selector__list">
            {selected.map((sprint) => {
              const frozen = isTerminalSprint(sprint.status);
              const previous = otherMilestone(sprint);
              const statusKey = sprintStatusKey(sprint);
              return (
                <li key={sprint.id}>
                  <div>
                    <strong>{sprint.name}</strong>
                    <span className={statusBadgeClass(statusKey)}>
                      {sprintStatusKeyLabels[statusKey] || sprint.status}
                    </span>
                    {frozen && <small>Sprint congelada — não pode mudar de marco.</small>}
                    {!frozen && previous && (
                      <small>Pertence ao Marco {previous} — será movida.</small>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || frozen}
                    onClick={() => remove(sprint)}
                    aria-label={`Remover ${sprint.name}`}
                    title={
                      frozen ? 'Sprint congelada — não pode mudar de marco.' : 'Remover Sprint'
                    }
                  >
                    {frozen ? <TraceFlowIcon name="lock" /> : '×'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
