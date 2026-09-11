import { TraceabilityPhaseTrail } from './TraceabilityPhaseTrail.jsx';
import { TraceabilityHelp } from './TraceabilityHelp.jsx';
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
          <p>
            Acompanhe a distribuição dos requisitos entre desenvolvimento, validação, correção e
            conclusão.
          </p>
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
    <span aria-label={`${label}: ${text}`} title={`${label}: ${text}`}>
      {text === 'Presente' ? <TraceFlowIcon name="check" /> : <span aria-hidden="true">—</span>}
      <span>
        {label}
        {text === 'Não aplicável' ? ' · Não aplicável' : ''}
      </span>
    </span>
  );
}
function Count({ label, value, icon, tone }) {
  return (
    <span
      className={`requirement-count${value && tone ? ` requirement-count--${tone}` : ''}`}
      aria-label={`${label}: ${value}`}
    >
      {icon && <TraceFlowIcon name={icon} />}
      <span>{label}</span>
      <b>{value}</b>
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
        <span>
          <SituationBadge value={item.situation} />
          <TraceabilityHelp topic="situation" />
        </span>
      </header>
      <div className="requirement-card__body">
        <h3 title={requirement.title}>{requirement.title}</h3>
        <TraceabilityPhaseTrail projection={item} />
        <div className="traceability-progress">
          <div className="requirement-card__line">
            <strong className="trace-help-label">
              Progresso
              <TraceabilityHelp
                topic="progress"
                context={`${progress.tasksDone} de ${progress.tasksTotal} tarefas concluídas.`}
              />
            </strong>
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
        <section className="requirement-card__group" aria-label="Artefatos">
          <strong>Artefatos</strong>
          <div className="requirement-counts">
            <Count icon="branch" label="PRs" value={artifacts.pullRequests} />
            <Count icon="code" label="Commits" value={artifacts.commits} />
            <Count icon="info" label="Issues" value={artifacts.issues} />
          </div>
        </section>
        <section className="requirement-card__group" aria-label="Testes">
          <strong>Testes · {validation.testCasesTotal} casos ativos</strong>
          <div className="requirement-counts">
            <Count label="PASS" value={validation.pass} />
            <Count label="FAIL" value={validation.fail} tone="danger" />
            <Count label="BLOCKED" value={validation.blocked} tone="warning" />
            <Count label="Pendentes" value={validation.neverExecuted} />
          </div>
        </section>
        <section className="requirement-card__group" aria-label="Defeitos">
          <strong>Defeitos · {defects.total}</strong>
          <div className="requirement-counts">
            <Count label="Abertos" value={defects.open} tone="danger" />
            <Count label="Em correção" value={defects.inCorrection} tone="warning" />
            <Count label="Aguardando reteste" value={defects.waitingRetest} />
            <Count label="Validados" value={defects.validated} />
          </div>
        </section>
        <div className="requirement-evidence" aria-label="Evidências">
          <span className="trace-help-label">
            Evidências
            <TraceabilityHelp topic="evidence" />
          </span>
          <Evidence label="Implementação" value={evidence.implementation} />
          <Evidence label="Validação" value={evidence.validation} />
          <Evidence label="Correção" value={evidence.correction} />
        </div>
      </div>
      <footer className="sprint-card__actions requirement-card__actions">
        <button
          type="button"
          className="button button-primary button-compact"
          onClick={(event) => onSelect(requirement, event.currentTarget)}
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
