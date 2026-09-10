import { CollapsibleFilterPanel } from '../../schedule/index.js';
import { SelectControl, TraceFlowIcon } from '../../../shared/index.js';
import {
  overviewMetrics,
  percentageLabel,
  requirementStatuses,
  situations,
  situationLabel
} from '../model/requirement-view.js';

export function SituationBadge({ value }) {
  return (
    <span
      className={`requirement-situation requirement-situation--${situations[value]?.[1] || 'neutral'}`}
    >
      {situationLabel(value)}
    </span>
  );
}
export function RequirementSummary({ summary }) {
  return (
    <section className="sprints-summary" aria-label="Resumo da rastreabilidade">
      <div className="sprints-summary__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2>Visão geral da rastreabilidade</h2>
        </div>
      </div>
      <dl className="requirement-metrics">
        {overviewMetrics(summary).map(([label, value, description]) => (
          <div className="sprints-summary__metric" key={label}>
            <dt title={description} aria-label={`${label}: ${description}`}>
              {label}
            </dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function RequirementFilters({ filters, onChange, onClear, count, total }) {
  const activeCount = Object.values(filters).filter(Boolean).length;
  const select = (key, label, options) => (
    <label className="sprint-filter" key={key}>
      <span>{label}</span>
      <SelectControl value={filters[key]} onChange={(event) => onChange(key, event.target.value)}>
        <option value="">Todos</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </SelectControl>
    </label>
  );
  return (
    <CollapsibleFilterPanel
      className="sprint-filters"
      resultLabel={
        activeCount ? `${count ?? '—'} de ${total ?? '—'} requisitos` : `${total ?? '—'} requisitos`
      }
      activeCount={activeCount}
    >
      {activeCount > 0 && (
        <div className="planning-filter-panel__actions">
          <button type="button" className="sprint-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}
      <div className="requirement-filter-grid">
        <label className="sprint-filter sprint-filter--search">
          <span>Pesquisar</span>
          <span className="sprint-search-input">
            <TraceFlowIcon name="search" />
            <input
              type="search"
              placeholder="REQ-id ou título"
              value={filters.search}
              onChange={(event) => onChange('search', event.target.value)}
            />
          </span>
        </label>
        {select(
          'situation',
          'Situação',
          Object.entries(situations).map(([key, [label]]) => [key, label])
        )}
        {select('requirementStatus', 'Status do requisito', Object.entries(requirementStatuses))}
        {select('hasTests', 'Com casos de teste', [
          ['true', 'Sim'],
          ['false', 'Não']
        ])}
        {select('hasOpenDefects', 'Com defeitos pendentes', [
          ['true', 'Sim'],
          ['false', 'Não']
        ])}
        {select('hasTechnicalEvidence', 'Com evidência técnica', [
          ['true', 'Sim'],
          ['false', 'Não']
        ])}
      </div>
    </CollapsibleFilterPanel>
  );
}
function Evidence({ label, value }) {
  const text =
    value === 'NOT_APPLICABLE'
      ? 'Não aplicável'
      : value === true || value === 'PRESENT'
        ? 'Presente'
        : 'Ausente';
  return (
    <span>
      <TraceFlowIcon name={text === 'Presente' ? 'check' : 'info'} />
      <span>
        {label}: {text}
      </span>
    </span>
  );
}
export function RequirementCard({ item, selected, onSelect, onHistory }) {
  const { requirement, progress, artifacts, validation, defects, evidence } = item;
  return (
    <article
      className={`sprint-card requirement-card${selected ? ' requirement-card--selected' : ''}`}
      aria-label={`${requirement.displayId} · ${requirement.title}`}
      aria-current={selected ? 'true' : undefined}
    >
      <header className="sprint-card__header requirement-card__header">
        <small>{requirement.displayId}</small>
        <SituationBadge value={item.situation} />
      </header>
      <div className="requirement-card__body">
        <h3 title={requirement.title}>{requirement.title}</h3>
        <small>
          Status do requisito: {requirementStatuses[requirement.status] || 'Não informado'}
        </small>
        <div className="traceability-progress">
          <div className="requirement-card__line">
            <strong>Progresso</strong>
            <span>{percentageLabel(progress)}</span>
          </div>
          <div
            className="traceability-progress-bar"
            role="progressbar"
            aria-label={`Progresso de ${requirement.displayId}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage ?? undefined}
            aria-valuetext={percentageLabel(progress)}
          >
            <span style={{ width: `${progress.percentage ?? 0}%` }} />
          </div>
          <small>
            {progress.tasksTotal
              ? `${progress.tasksDone} de ${progress.tasksTotal} tarefas concluídas`
              : 'Nenhuma tarefa relacionada'}
          </small>
        </div>
        <div className="requirement-card__group">
          <strong>Artefatos</strong>
          <span>
            {artifacts.pullRequests} PRs · {artifacts.commits} commits · {artifacts.issues} issues
          </span>
        </div>
        <div className="requirement-card__group">
          <strong>Testes · {validation.testCasesTotal} ativos</strong>
          <span>
            {validation.pass} aprovados · {validation.fail} com falha · {validation.blocked}{' '}
            bloqueados · {validation.neverExecuted} nunca executados
          </span>
        </div>
        <div className="requirement-card__group">
          <strong>Defeitos · {defects.total}</strong>
          <span>
            {defects.open} abertos · {defects.inCorrection} em correção · {defects.waitingRetest}{' '}
            aguardando reteste · {defects.validated} validados
          </span>
        </div>
        <div className="requirement-evidence" aria-label="Evidências">
          <Evidence label="Implementação" value={evidence.implementation} />
          <Evidence label="Validação" value={evidence.validation} />
          <Evidence label="Correção" value={evidence.correction} />
        </div>
      </div>
      <footer className="sprint-card__actions requirement-card__actions">
        <button
          type="button"
          className="button button-primary button-compact"
          onClick={() => onSelect(requirement)}
        >
          Ver rastreabilidade
        </button>
        <button
          type="button"
          className="button button-secondary button-compact"
          onClick={(event) => onHistory(requirement, event.currentTarget)}
        >
          Histórico
        </button>
      </footer>
    </article>
  );
}
