import { CollapsibleFilterPanel } from '../../schedule/index.js';
import {
  NO_SPRINT_FILTER,
  REPORT_FILTER_STATUSES,
  countReportFilters,
  reportFilterError
} from '../model/report-filters.js';

// Mesmo painel recolhível e mesmos campos das abas Sprints e Defeitos.
export function ReportFilters({ filters, sprints, members, total, onChange, onClear }) {
  const activeCount = countReportFilters(filters);
  const periodError = reportFilterError(filters);
  const resultLabel =
    total == null
      ? 'Carregando relatórios…'
      : `${total} ${total === 1 ? 'relatório' : 'relatórios'}`;
  const field = (key) => ({
    value: filters[key],
    onChange: (event) => onChange(key, event.target.value)
  });

  return (
    <CollapsibleFilterPanel
      id="report-filters-controls"
      className="sprint-filters report-filters"
      resultLabel={resultLabel}
      activeCount={activeCount}
      onClear={onClear}
    >
      <div className="report-filters__controls">
        <label className="sprint-filter">
          <span>Situação</span>
          <select {...field('status')}>
            <option value="">Todas</option>
            {REPORT_FILTER_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sprint-filter">
          <span>Sprint</span>
          <select {...field('sprintId')}>
            <option value="">Todas</option>
            <option value={NO_SPRINT_FILTER}>Sem Sprint escolhida</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={String(sprint.id)}>
                {sprint.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sprint-filter">
          <span>Solicitado por</span>
          <select {...field('requestedByUserId')}>
            <option value="">Todos</option>
            {members.map((member) => (
              <option key={member.user.id} value={String(member.user.id)}>
                {member.user.username
                  ? `${member.user.name} (@${member.user.username})`
                  : member.user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sprint-filter">
          <span>Data inicial</span>
          <input type="date" {...field('startDate')} />
        </label>
        <label className="sprint-filter">
          <span>Data final</span>
          <input
            type="date"
            aria-invalid={periodError ? true : undefined}
            aria-describedby={periodError ? 'report-filters-period-error' : undefined}
            {...field('endDate')}
          />
        </label>
      </div>
      {periodError ? (
        <p className="field-error" id="report-filters-period-error" role="alert">
          {periodError}
        </p>
      ) : (
        <p className="field-help report-filters__help">
          As datas selecionam relatórios cujo período tem dias em comum com o intervalo; relatórios
          de todo o histórico não entram nesse filtro.
        </p>
      )}
    </CollapsibleFilterPanel>
  );
}
